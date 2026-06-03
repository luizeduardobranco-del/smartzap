/**
 * POST /api/integrations/garagem-alert
 *
 * Endpoint chamado pelo Sistema de Rotograma (Ativa Rio) para notificar uma
 * TRANSPORTADORA via WhatsApp quando o cliente solicita a retirada de um
 * veículo do pátio/garagem.
 *
 * Espelha o tracker-alert, porém abre a conversa em mode='human' — apenas
 * notifica; o agente de IA NÃO responde automaticamente.
 *
 * Fluxo:
 *  1. Valida API key (header x-api-key === GARAGEM_INTEGRATION_API_KEY)
 *  2. Encontra o canal WhatsApp conectado da organização
 *  3. Upsert contato pelo telefone
 *  4. Cria/reabre conversa em mode='human'
 *  5. Salva a mensagem como sender_type='garagem_alert'
 *  6. Envia via Evolution API / Meta Cloud API
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EvolutionWhatsAppAdapter, MetaCloudWhatsAppAdapter } from '@zapagent/channel-adapters'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface GaragemAlertPayload {
  /** Telefone da transportadora no formato internacional sem + (ex: 5521987654321) */
  phone: string
  /** Nome da transportadora (usado no contato) */
  transportadoraNome: string
  /** Nome do cliente que solicitou a retirada */
  clienteNome: string
  placaCavalo?: string | null
  placaCarreta?: string | null
  produto?: string | null
  /** Mensagem personalizada — se não fornecida, usa o template padrão */
  customMessage?: string
  /** ID da organização WHITE ZAP — se omitido, usa a primeira org com canal conectado */
  organizationId?: string
}

function buildMessage(p: GaragemAlertPayload): string {
  if (p.customMessage) return p.customMessage

  const veic = p.placaCavalo
    ? `*${p.placaCavalo}*${p.placaCarreta ? ` (carreta ${p.placaCarreta})` : ''}`
    : 'um veículo'
  const prod = p.produto ? `\n\nProduto: ${p.produto}.` : ''

  return (
    `🅿️ *Ativa Rio — Pátio*\n\n` +
    `Olá! O cliente *${p.clienteNome}* solicitou a retirada do veículo ${veic} do pátio da Ativa Rio.${prod}\n\n` +
    `Por favor, envie um motorista para a coleta. Em caso de dúvidas, responda esta mensagem.`
  )
}

export async function POST(request: NextRequest) {
  // ── 1. Autenticação ───────────────────────────────────────────────────────
  const apiKey = request.headers.get('x-api-key')
  const expectedKey = process.env.GARAGEM_INTEGRATION_API_KEY
  if (!expectedKey) {
    return NextResponse.json({ error: 'Integração não configurada no servidor' }, { status: 500 })
  }
  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'API key inválida ou ausente' }, { status: 401 })
  }

  // ── 2. Payload ────────────────────────────────────────────────────────────
  let payload: GaragemAlertPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  if (!payload.phone || !payload.transportadoraNome || !payload.clienteNome) {
    return NextResponse.json(
      { error: 'Campos obrigatórios: phone, transportadoraNome, clienteNome' },
      { status: 400 }
    )
  }

  const phone = payload.phone.replace(/\D/g, '')
  const supabase = getSupabase()

  // ── 3. Canal WhatsApp conectado ───────────────────────────────────────────
  let channelQuery = supabase
    .from('channels')
    .select('id, organization_id, agent_id, credentials, type')
    .eq('type', 'whatsapp')
    .eq('status', 'connected')
    .limit(1)

  if (payload.organizationId) {
    channelQuery = channelQuery.eq('organization_id', payload.organizationId)
  }

  const { data: channelRows, error: channelErr } = await channelQuery
  if (channelErr || !channelRows?.length) {
    return NextResponse.json({ error: 'Nenhum canal WhatsApp conectado encontrado' }, { status: 404 })
  }

  const channel = channelRows[0]
  const credentials = channel.credentials as Record<string, string>
  const organizationId = channel.organization_id

  // ── 4. Upsert contato ─────────────────────────────────────────────────────
  let contactId: string
  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('channel_type', 'whatsapp')
    .eq('external_id', phone)
    .maybeSingle()

  if (existing) {
    contactId = existing.id
  } else {
    const { data: newContact, error: contactErr } = await supabase
      .from('contacts')
      .insert({
        organization_id: organizationId,
        external_id: phone,
        channel_type: 'whatsapp',
        name: payload.transportadoraNome,
        phone,
        tags: ['garagem', 'patio', 'transportadora'],
      })
      .select('id')
      .single()
    if (!newContact) {
      return NextResponse.json({ error: `Erro ao criar contato: ${contactErr?.message}` }, { status: 500 })
    }
    contactId = newContact.id
  }

  // ── 5. Conversa em mode='human' (sem auto-resposta da IA) ──────────────────
  let conversationId: string
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id')
    .eq('contact_id', contactId)
    .eq('channel_id', channel.id)
    .eq('status', 'open')
    .maybeSingle()

  if (existingConv) {
    conversationId = existingConv.id
    await supabase.from('conversations').update({ mode: 'human' }).eq('id', conversationId)
  } else {
    const { data: newConv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        organization_id: organizationId,
        contact_id: contactId,
        channel_id: channel.id,
        agent_id: channel.agent_id,
        status: 'open',
        mode: 'human',
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (!newConv) {
      return NextResponse.json({ error: `Erro ao criar conversa: ${convErr?.message}` }, { status: 500 })
    }
    conversationId = newConv.id
  }

  // ── 6. Salva mensagem ─────────────────────────────────────────────────────
  const messageText = buildMessage(payload)
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    organization_id: organizationId,
    role: 'assistant',
    content: messageText,
    content_type: 'text',
    sender_type: 'garagem_alert',
    metadata: {
      placa_cavalo: payload.placaCavalo ?? null,
      placa_carreta: payload.placaCarreta ?? null,
      cliente: payload.clienteNome,
    },
  })
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  // ── 7. Envia via WhatsApp ─────────────────────────────────────────────────
  try {
    if (credentials.provider === 'meta' || credentials.phoneNumberId) {
      const adapter = new MetaCloudWhatsAppAdapter(credentials.phoneNumberId, credentials.accessToken)
      await adapter.sendMessage({
        channelType: 'whatsapp',
        channelIdentifier: credentials.phoneNumberId,
        recipientExternalId: phone,
        contentType: 'text',
        text: messageText,
      })
    } else {
      const instanceName = credentials.instanceName
      const adapter = new EvolutionWhatsAppAdapter(
        (process.env.EVOLUTION_API_URL ?? '').trim(),
        (process.env.EVOLUTION_API_KEY ?? '').trim(),
        instanceName
      )
      await adapter.sendMessage({
        channelType: 'whatsapp',
        channelIdentifier: instanceName,
        recipientExternalId: phone,
        contentType: 'text',
        text: messageText,
      })
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[garagem-alert] send error:', errMsg)
    return NextResponse.json({ error: `Erro ao enviar WhatsApp: ${errMsg}` }, { status: 500 })
  }

  console.log(`[garagem-alert] sent to ${phone} (conv: ${conversationId}) cliente: ${payload.clienteNome}`)
  return NextResponse.json({ ok: true, conversationId, contactId, phone })
}
