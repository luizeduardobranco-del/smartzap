import { NextRequest, NextResponse } from 'next/server'
import { carregarAgenteDoUsuario, promptDoAgente } from '@/lib/treino/acesso'
import { aplicarSecaoNoPrompt, montarSecaoAprendida, type RegraAprendida } from '@/lib/treino/treino-agente'

// GET: o que o agente já aprendeu (regras do prompt) + conversas do WHITE ZAP que podem
// ser usadas no treino (as atendidas por uma pessoa aparecem primeiro).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await carregarAgenteDoUsuario(params.id)
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
  const { agente, db } = r

  const regras = ((agente.behavior_config?.treino as { regras?: RegraAprendida[] } | undefined)?.regras ?? [])

  const { data: canais } = await db.from('channels').select('id').eq('organization_id', agente.organization_id).eq('agent_id', agente.id)
  const idsCanais = (canais ?? []).map((c) => c.id)
  let consulta = db
    .from('conversations')
    .select('id, last_message_at, mode, contacts(name, phone)')
    .eq('organization_id', agente.organization_id)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(60)
  consulta = idsCanais.length
    ? consulta.or(`agent_id.eq.${agente.id},channel_id.in.(${idsCanais.join(',')})`)
    : consulta.eq('agent_id', agente.id)
  const { data: convs } = await consulta

  const ids = (convs ?? []).map((c) => c.id)
  const humanas = new Set<string>()
  const totais = new Map<string, number>()
  if (ids.length) {
    const { data: msgs } = await db
      .from('messages')
      .select('conversation_id, sender_type')
      .eq('organization_id', agente.organization_id)
      .in('conversation_id', ids)
      .in('role', ['user', 'assistant'])
      .limit(10000)
    for (const m of msgs ?? []) {
      totais.set(m.conversation_id, (totais.get(m.conversation_id) ?? 0) + 1)
      if (m.sender_type === 'human') humanas.add(m.conversation_id)
    }
  }

  const conversas = (convs ?? [])
    .filter((c) => (totais.get(c.id) ?? 0) >= 2)
    .map((c) => {
      const contato = (Array.isArray(c.contacts) ? c.contacts[0] : c.contacts) as { name?: string; phone?: string } | null
      return {
        id: c.id,
        nome: contato?.name || 'Sem nome',
        ultimaMensagem: c.last_message_at,
        mensagens: totais.get(c.id) ?? 0,
        atendidaPorPessoa: humanas.has(c.id),
      }
    })
    .sort((a, b) => Number(b.atendidaPorPessoa) - Number(a.atendidaPorPessoa))

  return NextResponse.json({ regras, conversas })
}

// DELETE ?regra=<id>: tira uma regra aprendida e redesenha a seção do prompt.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await carregarAgenteDoUsuario(params.id)
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
  const { agente, db } = r
  const idRegra = req.nextUrl.searchParams.get('regra')
  if (!idRegra) return NextResponse.json({ error: 'regra obrigatória' }, { status: 400 })

  const behavior = agente.behavior_config ?? {}
  const treino = (behavior.treino as { regras?: RegraAprendida[] } | undefined) ?? {}
  const regras = (treino.regras ?? []).filter((x) => x.id !== idRegra)

  const personality = agente.personality ?? {}
  const { campo, texto } = promptDoAgente(personality)
  const novoPrompt = aplicarSecaoNoPrompt(texto, montarSecaoAprendida(regras))

  const { error } = await db
    .from('agents')
    .update({
      personality: { ...personality, [campo]: novoPrompt },
      behavior_config: { ...behavior, treino: { ...treino, regras } },
      updated_at: new Date().toISOString(),
    })
    .eq('id', agente.id)
    .eq('organization_id', agente.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, regras })
}
