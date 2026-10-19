/**
 * POST /api/integrations/central-enviar
 *
 * O rotograma (Central do Motorista da Ativa Rio) manda uma mensagem ao motorista
 * pelo número do AGENTE da central — hoje o João, da conta da Ativa Rio, em teste
 * em duas viagens. Usado pela pergunta de parada, pelo aviso de direção contínua
 * e pela resposta da torre na tela.
 *
 * Por que aqui e não direto no Evolution a partir do rotograma: a credencial do
 * gateway fica num lugar só, e a mensagem entra na conversa do contato no WHITE
 * ZAP (o agente enxerga o que o robô perguntou quando o motorista responder).
 *
 * Body: { telefone, texto, agente: "João", organizacao?: slug, dry?: true }
 *   dry → não envia; devolve o agente e o canal que seriam usados (diagnóstico).
 * Auth: x-api-key === GARAGEM_INTEGRATION_API_KEY
 * Env:  CENTRAL_ROTOGRAMA_ORG (slug da conta da Ativa Rio, quando o body não traz)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'
import { findOrCreateOpenConversation } from '@/lib/conversations'

export const runtime = 'nodejs'

const normNome = (s: string | null | undefined) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

export async function POST(request: NextRequest) {
  const expected = process.env.GARAGEM_INTEGRATION_API_KEY
  if (!expected || request.headers.get('x-api-key') !== expected) {
    return NextResponse.json({ error: 'API key inválida ou ausente' }, { status: 401 })
  }
  const b = (await request.json().catch(() => ({}))) as {
    telefone?: string; texto?: string; agente?: string; organizacao?: string; dry?: boolean
  }
  const agenteNome = normNome(b.agente)
  if (!agenteNome) return NextResponse.json({ error: 'Informe o agente' }, { status: 400 })
  const telefone = String(b.telefone ?? '').replace(/\D/g, '')
  if (!b.dry && (!telefone || !String(b.texto ?? '').trim())) {
    return NextResponse.json({ error: 'telefone e texto são obrigatórios' }, { status: 400 })
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Agente pelo nome, mas SÓ na conta da Ativa Rio: outra conta pode ter um "João"
  const slug = (b.organizacao || process.env.CENTRAL_ROTOGRAMA_ORG || '').trim()
  const { data: agentes } = await supabase.from('agents').select('id, name, organization_id')
  const candidatos = (agentes ?? []).filter((a) => normNome(a.name) === agenteNome)
  const orgIds = [...new Set(candidatos.map((a) => a.organization_id))]
  const { data: orgs } = orgIds.length
    ? await supabase.from('organizations').select('id, slug, name').in('id', orgIds)
    : { data: [] as { id: string; slug: string; name: string }[] }
  const orgPorId = Object.fromEntries((orgs ?? []).map((o) => [o.id, o]))
  const naConta = candidatos.filter((a) => slug && orgPorId[a.organization_id]?.slug === slug)

  if (naConta.length !== 1) {
    // Diagnóstico: diz quais contas têm um agente com esse nome, para acertar o slug
    return NextResponse.json({
      error: naConta.length ? 'Mais de um agente com esse nome na conta' : 'Agente não encontrado na conta da central',
      slug_configurado: slug || null,
      contas_com_esse_agente: candidatos.map((a) => ({ agente: a.name, conta: orgPorId[a.organization_id]?.name, slug: orgPorId[a.organization_id]?.slug })),
    }, { status: 404 })
  }
  const agente = naConta[0]

  const { data: canais } = await supabase.from('channels')
    .select('id, status, credentials').eq('type', 'whatsapp').eq('agent_id', agente.id)
  const canal = (canais ?? []).find((c) => c.status === 'connected') ?? null
  const instancia = (canal?.credentials as Record<string, string> | null)?.instanceName ?? null
  if (b.dry) {
    return NextResponse.json({
      ok: !!instancia, agente: agente.name, conta: orgPorId[agente.organization_id]?.name,
      canais: (canais ?? []).map((c) => ({ status: c.status, instancia: (c.credentials as Record<string, string>)?.instanceName })),
    })
  }
  if (!canal || !instancia) {
    return NextResponse.json({ error: `O agente ${agente.name} não tem WhatsApp conectado` }, { status: 503 })
  }

  const texto = String(b.texto).trim()
  let externoId: string | null = null
  try {
    const adp = new EvolutionWhatsAppAdapter(process.env.EVOLUTION_API_URL!, process.env.EVOLUTION_API_KEY!, instancia)
    const env = await adp.sendMessage({
      channelType: 'whatsapp', channelIdentifier: instancia, recipientExternalId: telefone, contentType: 'text', text: texto,
    })
    externoId = env.externalId || null
  } catch (err) {
    return NextResponse.json({ error: `Evolution recusou: ${err instanceof Error ? err.message : err}` }, { status: 502 })
  }

  // Entra na conversa do contato, para o agente ter o contexto quando o motorista responder
  try {
    const organizationId = agente.organization_id
    let { data: contato } = await supabase.from('contacts').select('id')
      .eq('organization_id', organizationId).eq('channel_type', 'whatsapp').eq('external_id', telefone).maybeSingle()
    if (!contato) {
      const { data: novo } = await supabase.from('contacts').insert({
        organization_id: organizationId, external_id: telefone, channel_type: 'whatsapp', name: telefone, phone: telefone, tags: ['motorista'],
      }).select('id').single()
      contato = novo
    }
    if (contato) {
      const conv = await findOrCreateOpenConversation(supabase, {
        organizationId, contactId: contato.id, channelId: canal.id, agentId: agente.id, mode: 'ai',
      })
      if (conv) {
        await supabase.from('messages').insert({
          conversation_id: conv.id, organization_id: organizationId, role: 'assistant',
          content: texto, content_type: 'text', sender_type: 'agent', external_id: externoId,
        })
        await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id)
      }
    }
  } catch (err) {
    console.warn('[central-enviar] mensagem enviada, mas não registrada na conversa:', err instanceof Error ? err.message : err)
  }

  return NextResponse.json({ ok: true, externoId, instancia, agente: agente.name })
}
