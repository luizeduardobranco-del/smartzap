/**
 * POST /api/integrations/tracker-alert
 *
 * Endpoint chamado pelo WHITE TRACKERS para notificar um cliente via WhatsApp
 * quando um rastreador apresenta alerta de manutenção.
 *
 * Fluxo:
 *  1. Valida API key (header x-api-key)
 *  2. Encontra o canal WhatsApp conectado da organização
 *  3. Upsert contato pelo telefone
 *  4. Cria ou reabre conversa (mode=ai para o agente IA atender as respostas)
 *  5. Salva a mensagem de alerta como sender_type='tracker_alert'
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

export interface TrackerAlertPayload {
  /** Telefone do cliente no formato internacional sem + (ex: 5511987654321) */
  phone: string
  clientName: string
  alertType: 'offline_carro' | 'offline_moto' | 'offline_caminhao' | 'bateria_fraca' | 'falha_alimentacao'
  vehiclePlate: string | null
  vehicleDesc: string | null
  trackerName: string
  /** Mensagem personalizada — se não fornecida, usa o template padrão */
  customMessage?: string
  /** ID da organização WHITE ZAP — se omitido, usa a primeira org com canal conectado */
  organizationId?: string
}

const ALERT_EMOJI: Record<string, string> = {
  falha_alimentacao: '⚡',
  offline_carro:     '📡',
  offline_caminhao:  '📡',
  offline_moto:      '📡',
  bateria_fraca:     '🔋',
}

const ALERT_TITLE: Record<string, string> = {
  falha_alimentacao: 'Alerta Urgente',
  offline_carro:     'Alerta de Manutenção',
  offline_caminhao:  'Alerta de Manutenção',
  offline_moto:      'Alerta de Manutenção',
  bateria_fraca:     'Alerta Preventivo',
}

function buildMessage(payload: TrackerAlertPayload): string {
  if (payload.customMessage) return payload.customMessage

  const { alertType, clientName, vehiclePlate, vehicleDesc, trackerName } = payload
  const emoji = ALERT_EMOJI[alertType] ?? '⚠️'
  const title = ALERT_TITLE[alertType] ?? 'Alerta'
  const vehicleInfo = vehiclePlate
    ? `do veículo *${vehiclePlate}*${vehicleDesc ? ` (${vehicleDesc})` : ''}`
    : `do rastreador *${trackerName}*`

  const firstName = clientName.split(' ')[0]

  switch (alertType) {
    case 'falha_alimentacao':
      return (
        `${emoji} *${title} — WHITE TRACKERS*\n\n` +
        `Olá, ${firstName}! Detectamos uma *falha de alimentação* no rastreador ${vehicleInfo}.\n\n` +
        `Isso pode indicar um problema elétrico no veículo. Nossa equipe já foi notificada e entrará em contato para agendar uma visita técnica.\n\n` +
        `Precisa de alguma informação adicional? Responda esta mensagem.`
      )
    case 'offline_carro':
    case 'offline_caminhao':
      return (
        `${emoji} *${title} — WHITE TRACKERS*\n\n` +
        `Olá, ${firstName}! O rastreador ${vehicleInfo} está *sem comunicação*.\n\n` +
        `Nossa equipe está verificando o equipamento. O veículo está em local com sinal? Responda esta mensagem para nos ajudar a identificar o problema.`
      )
    case 'offline_moto':
      return (
        `${emoji} *${title} — WHITE TRACKERS*\n\n` +
        `Olá, ${firstName}! O rastreador da moto ${vehicleInfo} está *sem comunicação*.\n\n` +
        `Nossa equipe verificará o equipamento. Caso saiba de alguma situação, responda esta mensagem.`
      )
    case 'bateria_fraca':
      return (
        `${emoji} *${title} — WHITE TRACKERS*\n\n` +
        `Olá, ${firstName}! Identificamos que a bateria ${vehicleInfo} está com carga *abaixo do nível recomendado*.\n\n` +
        `Recomendamos agendar uma revisão preventiva para evitar falhas no rastreamento e no veículo. Posso ajudar a marcar um horário conveniente?`
      )
    default:
      return (
        `⚠️ *Alerta — WHITE TRACKERS*\n\n` +
        `Olá, ${firstName}! Identificamos uma situação que requer atenção no rastreador ${vehicleInfo}.\n\n` +
        `Responda esta mensagem ou entre em contato com nossa equipe.`
      )
  }
}

export async function POST(request: NextRequest) {
  // ── 1. Autenticação por API Key ──────────────────────────────────────────────
  const apiKey = request.headers.get('x-api-key')
  const expectedKey = process.env.TRACKER_INTEGRATION_API_KEY

  if (!expectedKey) {
    return NextResponse.json({ error: 'Integração não configurada no servidor' }, { status: 500 })
  }
  if (!apiKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'API key inválida ou ausente' }, { status: 401 })
  }

  // ── 2. Parse do payload ──────────────────────────────────────────────────────
  let payload: TrackerAlertPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (!payload.phone || !payload.clientName || !payload.alertType) {
    return NextResponse.json({ error: 'Campos obrigatórios: phone, clientName, alertType' }, { status: 400 })
  }

  // Normaliza telefone: remove não-dígitos
  const phone = payload.phone.replace(/\D/g, '')

  const supabase = getSupabase()

  // ── 3. Encontra canal WhatsApp conectado ─────────────────────────────────────
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
    return NextResponse.json(
      { error: 'Nenhum canal WhatsApp conectado encontrado' },
      { status: 404 }
    )
  }

  const channel = channelRows[0]
  const credentials = channel.credentials as Record<string, string>
  const organizationId = channel.organization_id

  // ── 4. Upsert contato ────────────────────────────────────────────────────────
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
        name: payload.clientName,
        phone,
        tags: ['rastreamento', 'manutencao'],
      })
      .select('id')
      .single()

    if (!newContact) {
      return NextResponse.json({ error: `Erro ao criar contato: ${contactErr?.message}` }, { status: 500 })
    }
    contactId = newContact.id
  }

  // ── 5. Cria ou encontra conversa aberta ──────────────────────────────────────
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
  } else {
    const { data: newConv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        organization_id: organizationId,
        contact_id: contactId,
        channel_id: channel.id,
        agent_id: channel.agent_id,
        status: 'open',
        mode: 'ai',
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (!newConv) {
      return NextResponse.json({ error: `Erro ao criar conversa: ${convErr?.message}` }, { status: 500 })
    }
    conversationId = newConv.id
  }

  // ── 6. Monta e salva mensagem de alerta ──────────────────────────────────────
  const messageText = buildMessage(payload)

  await supabase.from('messages').insert({
    conversation_id: conversationId,
    organization_id: organizationId,
    role: 'assistant',
    content: messageText,
    content_type: 'text',
    sender_type: 'tracker_alert',
    metadata: {
      alert_type:   payload.alertType,
      vehicle_plate: payload.vehiclePlate,
      tracker_name:  payload.trackerName,
    },
  })

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  // ── 7. Envia via WhatsApp ────────────────────────────────────────────────────
  try {
    if (credentials.provider === 'meta' || credentials.phoneNumberId) {
      // Meta Cloud API
      const adapter = new MetaCloudWhatsAppAdapter(
        credentials.phoneNumberId,
        credentials.accessToken
      )
      await adapter.sendMessage({
        channelType: 'whatsapp',
        channelIdentifier: credentials.phoneNumberId,
        recipientExternalId: phone,
        contentType: 'text',
        text: messageText,
      })
    } else {
      // Evolution API
      const instanceName = credentials.instanceName
      const adapter = new EvolutionWhatsAppAdapter(
        process.env.EVOLUTION_API_URL!,
        process.env.EVOLUTION_API_KEY!,
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
    console.error('[tracker-alert] send error:', errMsg)
    return NextResponse.json({ error: `Erro ao enviar WhatsApp: ${errMsg}` }, { status: 500 })
  }

  console.log(`[tracker-alert] sent to ${phone} (conv: ${conversationId}) type: ${payload.alertType}`)

  return NextResponse.json({
    ok: true,
    conversationId,
    contactId,
    phone,
  })
}
