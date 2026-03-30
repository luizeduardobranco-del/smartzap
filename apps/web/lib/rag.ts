import { createSupabaseServerClient } from './supabase/server'

/**
 * Retrieves relevant knowledge chunks for an agent based on a query.
 * Uses pgvector cosine similarity via Supabase RPC.
 */
export async function retrieveContext(
  agentId: string,
  query: string,
  options: { matchThreshold?: number; matchCount?: number } = {}
): Promise<string> {
  const { matchThreshold = 0.7, matchCount = 5 } = options

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) return ''

  // Embed the query
  const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: query }),
  })

  if (!embedRes.ok) return ''
  const { data } = await embedRes.json()
  const embedding: number[] = data[0].embedding

  const supabase = createSupabaseServerClient()

  const { data: chunks, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: `[${embedding.join(',')}]`,
    match_agent_id: agentId,
    match_threshold: matchThreshold,
    match_count: matchCount,
  })

  if (error || !chunks || chunks.length === 0) return ''

  return (chunks as { content: string }[])
    .map((c, i) => `[${i + 1}] ${c.content}`)
    .join('\n\n')
}
