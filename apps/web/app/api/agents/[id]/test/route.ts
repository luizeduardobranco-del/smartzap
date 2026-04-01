import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { runAgent, OpenAIProvider } from '@zapagent/ai-engine'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function retrieveKnowledgeContext(
  supabase: ReturnType<typeof getServiceSupabase>,
  agentId: string,
  query: string
): Promise<string | undefined> {
  try {
    const openai = new OpenAIProvider(process.env.OPENAI_API_KEY!)
    const embedding = await openai.createEmbedding(query)
    const embeddingStr = `[${embedding.join(',')}]`

    const { data } = await supabase.rpc('match_knowledge_chunks', {
      query_embedding: embeddingStr,
      match_agent_id: agentId,
      match_threshold: 0.5,
      match_count: 4,
    })

    if (!data?.length) return undefined
    return (data as any[]).map((r: any) => r.content).join('\n\n---\n\n')
  } catch {
    // RAG is optional — proceed without context
    return undefined
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { message, history = [] } = await req.json()
    if (!message?.trim()) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

    const serviceSupabase = getServiceSupabase()

    const { data: agent, error } = await serviceSupabase
      .from('agents')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !agent) return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })

    const retrievedContext = await retrieveKnowledgeContext(serviceSupabase, params.id, message)

    const result = await runAgent({
      personality: agent.personality as any,
      aiConfig: agent.ai_config as any,
      behaviorConfig: agent.behavior_config as any,
      conversationHistory: history,
      userMessage: message,
      retrievedContext,
      env: {
        openaiApiKey: process.env.OPENAI_API_KEY,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        groqApiKey: process.env.GROQ_API_KEY,
      },
    })

    return NextResponse.json({ reply: result.content })
  } catch (err) {
    console.error('[agent/test]', err)
    const msg = err instanceof Error ? err.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
