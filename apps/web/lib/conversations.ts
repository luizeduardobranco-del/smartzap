/**
 * Busca (ou cria) a conversa aberta de um contato num canal.
 *
 * Por que existe: o padrão antigo era
 *
 *   .eq('status', 'open').maybeSingle()
 *
 * e o PostgREST devolve erro (PGRST116, HTTP 406) quando o filtro casa com mais
 * de uma linha. Como o erro era descartado, `data` vinha null, o código caía no
 * ramo de criação e inseria MAIS uma conversa aberta — a cada mensagem. Um
 * contato da Ativa Rio chegou a 257 conversas para 290 mensagens, e com isso a
 * IA perdia todo o histórico (que é lido por conversation_id).
 *
 * Aqui o select é sempre ordenado + limit(1), então múltiplas linhas nunca viram
 * erro, e o insert trata violação de unicidade (23505) do índice parcial
 * `conversations_one_open_per_contact_channel` reconsultando — que é o caso de
 * dois webhooks concorrentes para o mesmo contato (foi assim que a duplicação
 * começou, em 03/08/2026: 5 alertas da garagem em 2 segundos).
 */

type Supabase = any

export type OpenConversation = { id: string; mode: string }

/** `created: true` quando a conversa acabou de nascer — usado para disparar
 *  automações de "primeira mensagem". */
export type ResolvedConversation = OpenConversation & { created: boolean }

export async function findOpenConversation(
  supabase: Supabase,
  contactId: string,
  channelId: string
): Promise<OpenConversation | null> {
  const { data } = await supabase
    .from('conversations')
    .select('id, mode')
    .eq('contact_id', contactId)
    .eq('channel_id', channelId)
    .eq('status', 'open')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  return (data as OpenConversation) ?? null
}

export async function findOrCreateOpenConversation(
  supabase: Supabase,
  params: {
    organizationId: string
    contactId: string
    channelId: string
    agentId?: string | null
    /** Modo da conversa quando ela precisa ser criada. Ignorado se já existir. */
    mode?: 'ai' | 'human'
    /** Força mode='human' mesmo numa conversa já existente (garagem-alert). */
    forceHumanMode?: boolean
  }
): Promise<ResolvedConversation | null> {
  const existing = await findOpenConversation(supabase, params.contactId, params.channelId)

  if (existing) {
    if (params.forceHumanMode && existing.mode !== 'human') {
      await supabase.from('conversations').update({ mode: 'human' }).eq('id', existing.id)
      return { id: existing.id, mode: 'human', created: false }
    }
    return { ...existing, created: false }
  }

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      organization_id: params.organizationId,
      contact_id: params.contactId,
      channel_id: params.channelId,
      agent_id: params.agentId ?? null,
      status: 'open',
      mode: params.mode ?? 'ai',
      last_message_at: new Date().toISOString(),
    })
    .select('id, mode')
    .single()

  if (created) return { ...(created as OpenConversation), created: true }

  // Corrida: outro request criou a conversa aberta entre o select e o insert.
  if ((error as any)?.code === '23505') {
    const raced = await findOpenConversation(supabase, params.contactId, params.channelId)
    if (raced) {
      if (params.forceHumanMode && raced.mode !== 'human') {
        await supabase.from('conversations').update({ mode: 'human' }).eq('id', raced.id)
        return { id: raced.id, mode: 'human', created: false }
      }
      return { ...raced, created: false }
    }
  }

  console.error('[conversations] insert failed:', (error as any)?.message)
  return null
}
