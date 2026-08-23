import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findOrCreateOpenConversation } from '@/lib/conversations'

// Called by external cron (e.g. cron-job.org) every minute
// Secure with CRON_SECRET env variable
function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// Mesma convenção de /api/cron/garagem-relatorio, para o cron externo poder
// chamar por GET com `?key=`, que é o que os serviços gratuitos suportam.
function autorizado(req: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET ?? '').trim()
  if (!secret) return true // sem secret configurado → não bloqueia
  const auth = req.headers.get('authorization') ?? ''
  const key =
    req.headers.get('x-cron-secret') ??
    req.headers.get('x-cron-key') ??
    new URL(req.url).searchParams.get('key') ??
    ''
  return auth === `Bearer ${secret}` || key === secret
}

async function handler(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getDb()
  const now = new Date().toISOString()
  let processed = 0
  let errors = 0

  // Find all active funnel_contacts whose next_message_at is due
  const { data: pending, error } = await db
    .from('funnel_contacts')
    .select(`
      id, next_message_index, channel_id, organization_id, contact_id, funnel_id, stage_id,
      contacts(id, external_id, phone),
      funnel_stages(messages, name),
      channels(credentials, agent_id)
    `)
    .eq('status', 'active')
    .not('next_message_at', 'is', null)
    .lte('next_message_at', now)
    .limit(50)

  if (error) {
    console.error('[funnels/process] query error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  for (const fc of pending ?? []) {
    try {
      const messages = (fc.funnel_stages as any)?.messages as any[] ?? []
      const idx = fc.next_message_index ?? 0

      if (idx >= messages.length) {
        // No more messages — mark as waiting (sequence complete)
        await db
          .from('funnel_contacts')
          .update({ status: 'waiting', next_message_at: null })
          .eq('id', fc.id)
        continue
      }

      const msg = messages[idx]
      const contact = fc.contacts as any
      const channel = fc.channels as any
      const phone = contact?.external_id ?? contact?.phone

      if (phone && channel?.credentials) {
        await sendMessage(channel.credentials, phone, msg)

        // Save message to conversation history so the AI agent has context
        await saveMessageToConversation(db, {
          organizationId: fc.organization_id,
          contactId: contact?.id ?? fc.contact_id,
          channelId: fc.channel_id,
          agentId: channel?.agent_id ?? null,
          funnelId: fc.funnel_id,
          stageId: fc.stage_id,
          stageName: (fc.funnel_stages as any)?.name ?? '',
          messageIndex: idx,
          msg,
        })
      }

      // Schedule next message
      const nextIdx = idx + 1
      if (nextIdx < messages.length) {
        const nextDelay = messages[nextIdx]?.delay_minutes ?? 0
        const nextAt = new Date(Date.now() + nextDelay * 60 * 1000).toISOString()
        await db
          .from('funnel_contacts')
          .update({ next_message_index: nextIdx, next_message_at: nextAt })
          .eq('id', fc.id)
      } else {
        // Last message sent — sequence complete
        await db
          .from('funnel_contacts')
          .update({ status: 'waiting', next_message_at: null, next_message_index: nextIdx })
          .eq('id', fc.id)
      }

      processed++
    } catch (err: any) {
      console.error('[funnels/process] error for fc', fc.id, err?.message)
      errors++
      // Sem isto o contato continua vencido e é retentado a cada tique do cron,
      // para sempre. Adia 5 min: erro transitório se resolve sozinho, erro
      // permanente não vira martelo em cima da Evolution.
      await db
        .from('funnel_contacts')
        .update({ next_message_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() })
        .eq('id', fc.id)
    }
  }

  console.log(`[funnels/process] processed=${processed} errors=${errors}`)
  return NextResponse.json({ processed, errors })
}

export const POST = handler
export const GET = handler
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ── Save funnel message to conversation history ────────────────────────────────
async function saveMessageToConversation(
  db: ReturnType<typeof getDb>,
  opts: {
    organizationId: string
    contactId: string
    channelId: string | null
    agentId: string | null
    funnelId: string
    stageId: string
    stageName: string
    messageIndex: number
    msg: { type: string; content: string }
  }
) {
  if (!opts.channelId || !opts.contactId) return

  try {
    // Usa o helper compartilhado: o padrão antigo (`.single()` sobre um filtro
    // que casa várias linhas) devolvia PGRST116, o erro era descartado e o
    // código criava OUTRA conversa aberta a cada mensagem do funil.
    const conv = await findOrCreateOpenConversation(db, {
      organizationId: opts.organizationId,
      contactId: opts.contactId,
      channelId: opts.channelId,
      agentId: opts.agentId,
    })

    const conversationId = conv?.id ?? null
    if (!conversationId) return

    // Build message content
    const isMedia = opts.msg.type !== 'text'
    const content = isMedia
      ? `[${opts.msg.type === 'image' ? 'Imagem' : 'Áudio'} enviado via funil]`
      : opts.msg.content

    // Insert message record
    await db.from('messages').insert({
      conversation_id: conversationId,
      organization_id: opts.organizationId,
      role: 'assistant',
      content,
      content_type: opts.msg.type,
      media_url: isMedia ? opts.msg.content : null,
      sender_type: 'funnel',
      metadata: {
        funnel_id: opts.funnelId,
        stage_id: opts.stageId,
        stage_name: opts.stageName,
        message_index: opts.messageIndex,
      },
    })

    // Update conversation last_message_at
    await db
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId)
  } catch (err: any) {
    // Non-fatal: funnel dispatch still succeeded, just log
    console.warn('[funnels/process] saveMessageToConversation failed:', err?.message)
  }
}

// ── Send via Evolution API ────────────────────────────────────────────────────
//
// A URL e a chave da Evolution vêm do ambiente — `channels.credentials` guarda
// apenas `instanceName`. A versão anterior lia `evolutionApiUrl`/`apiKey` de
// dentro de credentials, montava `fetch("undefined/message/sendText/...")` e
// estourava antes de enviar: nenhuma mensagem de funil jamais saiu por aqui.
// É o mesmo caminho usado por /api/campaigns/[id]/process, que funciona.
async function sendMessage(
  credentials: { instanceName?: string },
  phone: string,
  msg: { type: string; content: string }
) {
  const evolutionApiUrl = process.env.EVOLUTION_API_URL
  const evolutionApiKey = process.env.EVOLUTION_API_KEY
  const instanceName = credentials?.instanceName

  if (!evolutionApiUrl || !evolutionApiKey) {
    throw new Error('EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes no ambiente')
  }
  if (!instanceName) {
    throw new Error('canal sem instanceName em credentials')
  }

  const headers = { apikey: evolutionApiKey, 'Content-Type': 'application/json' }
  const endpoint = msg.type === 'text' ? 'sendText' : 'sendMedia'
  const body =
    msg.type === 'text'
      ? { number: phone, text: msg.content }
      : { number: phone, mediatype: msg.type, media: msg.content }

  const res = await fetch(`${evolutionApiUrl}/message/${endpoint}/${instanceName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })

  // Sem esta checagem um 4xx da Evolution passava como sucesso e a mensagem
  // era marcada como enviada.
  if (!res.ok) {
    throw new Error(`Evolution ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
}
