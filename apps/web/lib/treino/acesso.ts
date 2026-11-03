import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type AgenteTreino = {
  id: string
  name: string
  organization_id: string
  personality: Record<string, unknown> | null
  behavior_config: Record<string, unknown> | null
}

// Confere o usuário logado e se o agente é da organização dele (RLS). Devolve o agente e um
// cliente de serviço para as gravações, sempre filtradas pela organização do agente.
export async function carregarAgenteDoUsuario(agentId: string) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { erro: 'Não autorizado', status: 401 as const }

  const { data: agente } = await supabase
    .from('agents')
    .select('id, name, organization_id, personality, behavior_config')
    .eq('id', agentId)
    .maybeSingle()
  if (!agente) return { erro: 'Agente não encontrado', status: 404 as const }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  return { agente: agente as AgenteTreino, db, supabase }
}

export function promptDoAgente(p: Record<string, unknown> | null): { campo: 'systemPrompt' | 'instructions'; texto: string } {
  const sp = (p?.systemPrompt as string | undefined) ?? ''
  if (sp.trim()) return { campo: 'systemPrompt', texto: sp }
  const ins = (p?.instructions as string | undefined) ?? ''
  if (ins.trim()) return { campo: 'instructions', texto: ins }
  return { campo: 'systemPrompt', texto: '' }
}
