/**
 * POST /api/integrations/garagem-group-notify
 *
 * Posta uma mensagem de TEXTO em um GRUPO de WhatsApp da organização da garagem
 * (Ativa Rio) via Evolution. Usado pelo Sistema de Rotograma para avisar o grupo
 * dos CLIENTES quando um veículo efetiva a SAÍDA do pátio.
 *
 * Diferente do garagem-alert (que é 1:1, cria contato/conversa), aqui só enviamos
 * ao JID do grupo — sem criar contato/conversa.
 *
 * Auth: header x-api-key === GARAGEM_INTEGRATION_API_KEY.
 * Body: { text, groupJid?, organizationSlug?, organizationId? }
 *   - groupJid: se ausente, usa env GARAGEM_CLIENTE_GROUP_JIDS (1º da lista).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key')
  const expectedKey = process.env.GARAGEM_INTEGRATION_API_KEY
  if (!expectedKey) return NextResponse.json({ error: 'Integração não configurada no servidor' }, { status: 500 })
  if (!apiKey || apiKey !== expectedKey) return NextResponse.json({ error: 'API key inválida ou ausente' }, { status: 401 })

  let body: { text?: string; groupJid?: string; organizationSlug?: string; organizationId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Payload inválido' }, { status: 400 }) }

  const text = (body.text || '').trim()
  if (!text) return NextResponse.json({ error: 'Campo obrigatório: text' }, { status: 400 })

  const groupJid = (body.groupJid || (process.env.GARAGEM_CLIENTE_GROUP_JIDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0] || '').trim()
  if (!groupJid) return NextResponse.json({ error: 'Nenhum grupo destino (groupJid ou GARAGEM_CLIENTE_GROUP_JIDS)' }, { status: 400 })

  const supabase = getSupabase()

  // Resolve o canal WhatsApp conectado da org da garagem (por id, slug, ou 1º conectado).
  let orgId = body.organizationId || null
  if (!orgId && body.organizationSlug) {
    const { data: org } = await supabase.from('organizations').select('id').eq('slug', body.organizationSlug).maybeSingle()
    if (org) orgId = org.id
  }
  let channelQuery = supabase.from('channels').select('credentials, organization_id').eq('type', 'whatsapp').eq('status', 'connected').limit(1)
  if (orgId) channelQuery = channelQuery.eq('organization_id', orgId)
  const { data: channelRows } = await channelQuery
  if (!channelRows?.length) return NextResponse.json({ error: 'Nenhum canal WhatsApp conectado encontrado' }, { status: 404 })

  const credentials = channelRows[0].credentials as Record<string, string>
  const instanceName = credentials.instanceName
  if (!instanceName) return NextResponse.json({ error: 'Instância (instanceName) não encontrada no canal' }, { status: 500 })

  try {
    const adapter = new EvolutionWhatsAppAdapter(
      (process.env.EVOLUTION_API_URL ?? '').trim(),
      (process.env.EVOLUTION_API_KEY ?? '').trim(),
      instanceName
    )
    await adapter.sendMessage({
      channelType: 'whatsapp', channelIdentifier: instanceName,
      recipientExternalId: groupJid, contentType: 'text', text,
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[garagem-group-notify] send error:', errMsg)
    return NextResponse.json({ error: `Erro ao enviar WhatsApp: ${errMsg}` }, { status: 500 })
  }

  console.log(`[garagem-group-notify] enviado ao grupo ${groupJid}`)
  return NextResponse.json({ ok: true, groupJid })
}
