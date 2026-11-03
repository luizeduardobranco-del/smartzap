import { createClient } from '@supabase/supabase-js'

// Indexa uma fonte da base de conhecimento (agent_knowledge_sources): monta o texto,
// divide em trechos, gera os embeddings e grava em knowledge_chunks — é o que o agente
// consulta a cada mensagem (match_knowledge_chunks). Usado pela rota /api/knowledge/process
// e pelo treino do agente.

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function processarFonteConhecimento(sourceId: string): Promise<{ chunks: number; mode?: string }> {
  const supabase = getServiceClient()

  const { data: source, error: sourceError } = await supabase
    .from('agent_knowledge_sources')
    .select('*')
    .eq('id', sourceId)
    .single()
  if (sourceError || !source) throw new Error('Fonte não encontrada: ' + (sourceError?.message ?? 'desconhecida'))

  try {
    await supabase.from('agent_knowledge_sources').update({ status: 'processing' }).eq('id', sourceId)

    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) {
      await supabase
        .from('agent_knowledge_sources')
        .update({ status: 'ready', updated_at: new Date().toISOString() })
        .eq('id', sourceId)
      return { chunks: 0, mode: 'no_embeddings' }
    }

    const metadata = source.metadata as Record<string, string>
    let textContent = ''
    if (source.type === 'text') {
      textContent = metadata.content ?? ''
    } else if (source.type === 'faq') {
      textContent = `Pergunta: ${metadata.question}\nResposta: ${metadata.answer}`
    } else if (source.type === 'image') {
      // Imagem: indexa nome + descrição; a URL vai no metadata do trecho para o webhook enviar.
      const desc = metadata.description ? `: ${metadata.description}` : ''
      textContent = `Imagem do produto ${metadata.name ?? source.name}${desc}`
    } else if (source.type === 'url') {
      const pageRes = await fetch(metadata.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WhiteChatBot/1.0)' },
        signal: AbortSignal.timeout(10000),
      })
      const html = await pageRes.text()
      textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8000)
    }
    if (!textContent.trim()) throw new Error('Nenhum conteúdo extraído da fonte.')

    const chunks = dividirEmTrechos(textContent, 500)

    const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: chunks }),
    })
    if (!embeddingRes.ok) {
      const err = await embeddingRes.json().catch(() => ({}))
      throw new Error(`OpenAI embeddings error: ${err.error?.message ?? embeddingRes.status}`)
    }
    const embeddingData = await embeddingRes.json()
    const embeddings: number[][] = embeddingData.data.map((d: { embedding: number[] }) => d.embedding)

    await supabase.from('knowledge_chunks').delete().eq('source_id', sourceId)

    const chunkRows = chunks.map((content, i) => ({
      source_id: sourceId,
      agent_id: source.agent_id,
      organization_id: source.organization_id,
      content,
      embedding: `[${embeddings[i].join(',')}]`,
      metadata: {
        sourceType: source.type,
        chunkIndex: i,
        ...(source.type === 'image' ? { imageUrl: metadata.imageUrl } : {}),
      },
    }))
    for (let i = 0; i < chunkRows.length; i += 50) {
      const { error } = await supabase.from('knowledge_chunks').insert(chunkRows.slice(i, i + 50))
      if (error) throw new Error(`Erro ao salvar chunks: ${error.message}`)
    }

    await supabase
      .from('agent_knowledge_sources')
      .update({ status: 'ready', updated_at: new Date().toISOString() })
      .eq('id', sourceId)
    return { chunks: chunkRows.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    await supabase
      .from('agent_knowledge_sources')
      .update({ status: 'error', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', sourceId)
    throw err
  }
}

function dividirEmTrechos(text: string, chunkSize: number): string[] {
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
