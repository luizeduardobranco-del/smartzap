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
import { findOrCreateOpenConversation } from '@/lib/conversations'

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
  /** Nome do contato (se omitido, usa transportadoraNome) — ex.: aviso ao remetente da NF */
  contactName?: string
  /** Tags do contato (se omitido, usa garagem/patio/transportadora) */
  contactTags?: string[]
  /** ID da organização WHITE CHAT — se omitido, tenta pelo slug; senão usa a 1ª org com canal conectado */
  organizationId?: string
  /** Slug da organização WHITE CHAT (alternativa ao id, ex.: "luizmarques-88e7ec83") */
  organizationSlug?: string
}

function buildMessage(p: GaragemAlertPayload): string {
  if (p.customMessage) return p.customMessage

  const veic = p.placaCavalo
    ? `*${p.placaCavalo}*${p.placaCarreta ? ` (carreta ${p.placaCarreta})` : ''}`
    : 'um veículo'
  const prod = p.produto ? `\n\nProduto: ${p.produto}.` : ''

  return (
    `🅿️ *Estacionamento WR*\n\n` +
    `Olá! O cliente *${p.clienteNome}* solicitou o envio do veículo ${veic} para a sua fábrica.${prod}\n\n` +
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

  // ── 3. Canal WhatsApp conectado da ORGANIZAÇÃO certa ──────────────────────
  // Resolve a org por id ou slug — evita pegar o canal de outra conta.
  let orgId = payload.organizationId || null
  if (!orgId && payload.organizationSlug) {
    const { data: org } = await supabase
      .from('organizations').select('id').eq('slug', payload.organizationSlug).maybeSingle()
    if (!org) {
      return NextResponse.json({ error: `Organização não encontrada (slug: ${payload.organizationSlug})` }, { status: 404 })
    }
    orgId = org.id
  }

  let channelQuery = supabase
    .from('channels')
    .select('id, organization_id, agent_id, credentials, type')
    .eq('type', 'whatsapp')
    .eq('status', 'connected')
    .limit(1)

  if (orgId) {
    channelQuery = channelQuery.eq('organization_id', orgId)
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
        name: payload.contactName || payload.transportadoraNome,
        phone,
        tags: payload.contactTags || ['garagem', 'patio', 'transportadora'],
      })
      .select('id')
      .single()
    if (!newContact) {
      return NextResponse.json({ error: `Erro ao criar contato: ${contactErr?.message}` }, { status: 500 })
    }
    contactId = newContact.id
  }

  // ── 5. Conversa em mode='human' (sem auto-resposta da IA) ──────────────────
  const conv = await findOrCreateOpenConversation(supabase, {
    organizationId,
    contactId,
    channelId: channel.id,
    agentId: channel.agent_id,
    mode: 'human',
    forceHumanMode: true,
  })
  if (!conv) {
    return NextResponse.json({ error: 'Erro ao criar conversa' }, { status: 500 })
  }
  const conversationId = conv.id

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
