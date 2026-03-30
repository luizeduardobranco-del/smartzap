import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  let sourceId: string | null = null

  try {
    const body = await req.json()
    sourceId = body.sourceId

    if (!sourceId) return NextResponse.json({ error: 'sourceId required' }, { status: 400 })

    const supabase = getServiceClient()

    const { data: source, error: sourceError } = await supabase
      .from('agent_knowledge_sources')
      .select('*')
      .eq('id', sourceId)
      .single()

    if (sourceError || !source) {
      console.error('[knowledge/process] source not found:', sourceId, sourceError?.message)
      return NextResponse.json({ error: 'Source not found: ' + (sourceError?.message ?? 'unknown') }, { status: 404 })
    }

    console.log('[knowledge/process] found source:', sourceId, 'type:', source.type)

    // Mark as processing
    await supabase
      .from('agent_knowledge_sources')
      .update({ status: 'processing' })
      .eq('id', sourceId)

    const openaiKey = process.env.OPENAI_API_KEY

    // If no OpenAI key — save content directly and mark as ready (no vector search)
    if (!openaiKey) {
      await supabase
        .from('agent_knowledge_sources')
        .update({ status: 'ready', updated_at: new Date().toISOString() })
        .eq('id', sourceId)
      return NextResponse.json({ success: true, chunks: 0, mode: 'no_embeddings' })
    }

    // Build text content based on source type
    const metadata = source.metadata as Record<string, string>
    let textContent = ''

    if (source.type === 'text') {
      textContent = metadata.content ?? ''
    } else if (source.type === 'faq') {
      textContent = `Pergunta: ${metadata.question}\nResposta: ${metadata.answer}`
    } else if (source.type === 'image') {
      // For images: index name + description for semantic search
      // The imageUrl is stored in chunk metadata for the webhook to send
      const desc = metadata.description ? `: ${metadata.description}` : ''
      textContent = `Imagem do produto ${metadata.name ?? source.name}${desc}`
    } else if (source.type === 'url') {
      // Fetch URL content
      const pageRes = await fetch(metadata.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WhiteZapBot/1.0)' },
        signal: AbortSignal.timeout(10000),
      })
      const html = await pageRes.text()
      // Basic HTML strip
      textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8000)
    }

    if (!textContent.trim()) {
      throw new Error('Nenhum conteúdo extraído da fonte.')
    }

    // Split into chunks (~500 chars each)
    const chunks = splitIntoChunks(textContent, 500)

    // Generate embeddings via OpenAI
    const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: chunks,
      }),
    })

    if (!embeddingRes.ok) {
      const err = await embeddingRes.json()
      throw new Error(`OpenAI embeddings error: ${err.error?.message ?? embeddingRes.status}`)
    }

    const embeddingData = await embeddingRes.json()
    const embeddings: number[][] = embeddingData.data.map((d: any) => d.embedding)

    // Delete existing chunks
    await supabase.from('knowledge_chunks').delete().eq('source_id', sourceId)

    // Insert new chunks
    const chunkRows = chunks.map((content, i) => ({
      source_id: sourceId!,
      agent_id: source.agent_id,
      organization_id: source.organization_id,
      content,
      embedding: `[${embeddings[i].join(',')}]`,
      metadata: {
        sourceType: source.type,
        chunkIndex: i,
        ...(source.type === 'image' ? { imageUrl: (source.metadata as any).imageUrl } : {}),
      },
    }))

    for (let i = 0; i < chunkRows.length; i += 50) {
      const batch = chunkRows.slice(i, i + 50)
      const { error } = await supabase.from('knowledge_chunks').insert(batch)
      if (error) throw new Error(`Erro ao salvar chunks: ${error.message}`)
    }

    // Mark as ready
    await supabase
      .from('agent_knowledge_sources')
      .update({ status: 'ready', updated_at: new Date().toISOString() })
      .eq('id', sourceId)

    return NextResponse.json({ success: true, chunks: chunkRows.length })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[knowledge/process]', message)

    if (sourceId) {
      try {
        await getServiceClient()
          .from('agent_knowledge_sources')
          .update({ status: 'error', error_message: message, updated_at: new Date().toISOString() })
          .eq('id', sourceId)
      } catch {}
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = []
  const sentences = text.split(/(?<=[.!?])\s+/)
  let current = ''

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length > chunkSize && current) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current = current ? current + ' ' + sentence : sentence
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks.length > 0 ? chunks : [text.slice(0, chunkSize)]
}
