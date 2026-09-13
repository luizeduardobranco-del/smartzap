/**
 * POST /api/integrations/pedido-alert
 *
 * Endpoint chamado pelo WHITE ERP para avisar o cliente (ou o próprio lojista)
 * pelo WhatsApp sobre um pedido da loja: recebido, confirmado, saiu para
 * entrega, cancelado.
 *
 * Substitui o link manual de WhatsApp que o sistema antigo de delivery usava.
 *
 * Fluxo (mesmo dos outros integrations/*):
 *  1. Valida API key (header x-api-key)
 *  2. Encontra o canal WhatsApp conectado da organização
 *  3. Upsert contato pelo telefone
 *  4. Cria ou reabre conversa
 *  5. Salva a mensagem como sender_type='pedido_alert'
 *  6. Envia via Evolution API / Meta Cloud API
 *
 * O TEXTO vem pronto do WHITE ERP (`message`): é lá que moram o nome da loja,
 * o número do pedido e o link de acompanhamento. Aqui só entra o transporte.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EvolutionWhatsAppAdapter, MetaCloudWhatsAppAdapter } from '@zapagent/channel-adapters'
import { findOrCreateOpenConversation } from '@/lib/conversations'
import { autenticarChaveApi } from '@/lib/api-key-auth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface PedidoAlertPayload {
  /** Telefone no formato internacional sem + (ex: 5511987654321) */
  phone: string
  /** Texto pronto, montado pelo WHITE ERP */
  message: string
  customerName?: string
  storeName?: string
  orderNumber?: number | string
  /** 'new' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled' */
  event?: string
  /** 'customer' (padrão) ou 'owner' — quem está sendo avisado */
  target?: 'customer' | 'owner'
  organizationId?: string
  /** Slug da organização no WHITE CHAT (ex.: "luizmarques-88e7ec83") */
  organizationSlug?: string
  agentName?: string
  /**
   * Modo da conversa quando ela for criada. Padrão 'human': quem responde
   * "cadê meu pedido?" é a loja, não o agente de IA — a menos que a loja
   * peça 'ai' explicitamente.
   */
  mode?: 'ai' | 'human'
}

// Envio externo (Evolution/Meta) não cabe no orçamento padrão da Vercel.
// `nodejs` é explícito porque a autenticação da chave usa crypto.
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  // ── 1. Autenticação por API Key ──────────────────────────────────────────────
  // Chave de organização (wz_live_...) já traz a identidade do cliente. A chave
  // de ambiente continua valendo para não quebrar o que já roda.
  const origem = await autenticarChaveApi(request, ['WHITEERP_INTEGRATION_API_KEY'])

  if (!origem) {
    return NextResponse.json({ error: 'API key inválida, revogada ou ausente' }, { status: 401 })
  }

  // ── 2. Parse do payload ──────────────────────────────────────────────────────
  let payload: PedidoAlertPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (!payload.phone || !payload.message?.trim()) {
    return NextResponse.json({ error: 'Campos obrigatórios: phone, message' }, { status: 400 })
  }

  // Normaliza telefone: só dígitos. JID de grupo/@lid não é destino válido.
  const phone = payload.phone.replace(/\D/g, '')
  if (phone.length < 10 || phone.length > 15) {
    return NextResponse.json({ error: `Telefone inválido: ${payload.phone}` }, { status: 400 })
  }

  const supabase = getSupabase()

  // ── 3. Resolve a organização e seu canal WhatsApp conectado ──────────────────
  // Quando a chave é de organização, ela MANDA: um cliente não pode pedir para
  // enviar pelo canal de outro só trocando o slug do corpo.
  let orgId = origem.organizationId || payload.organizationId || null
  if (!orgId && payload.organizationSlug) {
    const { data: org } = await supabase
      .from('organizations').select('id').eq('slug', payload.organizationSlug).maybeSingle()
    if (!org) {
      return NextResponse.json(
        { error: `Organização não encontrada (slug: ${payload.organizationSlug})` },
        { status: 404 }
      )
    }
    orgId = org.id
  }

  let channelQuery = supabase
    .from('channels')
    .select('id, organization_id, agent_id, credentials, type')
    .eq('type', 'whatsapp')
    .eq('status', 'connected')
    .limit(1)

  if (orgId) channelQuery = channelQuery.eq('organization_id', orgId)

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

  let agentId = channel.agent_id
  if (payload.agentName) {
    const { data: ag } = await supabase
      .from('agents')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('name', payload.agentName)
      .maybeSingle()
    if (ag) agentId = ag.id
  }

  // ── 4. Upsert contato ────────────────────────────────────────────────────────
  const nomeContato = payload.customerName?.trim() || `Cliente ${phone.slice(-4)}`

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
        name: nomeContato,
        phone,
        tags: ['pedido', 'delivery'],
      })
      .select('id')
      .single()

    if (!newContact) {
      return NextResponse.json({ error: `Erro ao criar contato: ${contactErr?.message}` }, { status: 500 })
    }
    contactId = newContact.id
  }

  // ── 5. Conversa aberta ───────────────────────────────────────────────────────
  const conv = await findOrCreateOpenConversation(supabase, {
    organizationId,
    contactId,
    channelId: channel.id,
    agentId,
    mode: payload.mode === 'ai' ? 'ai' : 'human',
  })
  if (!conv) {
    return NextResponse.json({ error: 'Erro ao criar conversa' }, { status: 500 })
  }
  const conversationId = conv.id

  // ── 6. Registra a mensagem ───────────────────────────────────────────────────
  const messageText = payload.message.trim()

  const { error: msgErr } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    organization_id: organizationId,
    role: 'assistant',
    content: messageText,
    content_type: 'text',
    sender_type: 'pedido_alert',
    metadata: {
      event: payload.event ?? null,
      order_number: payload.orderNumber ?? null,
      store_name: payload.storeName ?? null,
      target: payload.target ?? 'customer',
    },
  })

  // Registro no inbox é desejável, mas não pode impedir o aviso de sair.
  if (msgErr) console.error('[pedido-alert] falha ao registrar mensagem:', msgErr.message)

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  // ── 7. Envia via WhatsApp ────────────────────────────────────────────────────
  try {
    if (credentials.provider === 'meta' || credentials.phoneNumberId) {
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
    console.error('[pedido-alert] send error:', errMsg)
    return NextResponse.json({ error: `Erro ao enviar WhatsApp: ${errMsg}` }, { status: 500 })
  }

  console.log(
    `[pedido-alert] sent to ${phone} (conv: ${conversationId}) event: ${payload.event ?? '—'}`
  )

  return NextResponse.json({ ok: true, conversationId, contactId, phone })
}
