import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Called by external cron (e.g. cron-job.org) every minute
// Secure with CRON_SECRET env variable
function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  // Auth: accept either CRON_SECRET header or internal calls
  const secret = req.headers.get('x-cron-secret')
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
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
    }
  }

  console.log(`[funnels/process] processed=${processed} errors=${errors}`)
  return NextResponse.json({ processed, errors })
}

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
    // Find existing open conversation for this contact + channel
    let conversationId: string | null = null

    const { data: existing } = await db
      .from('conversations')
      .select('id')
      .eq('contact_id', opts.contactId)
      .eq('channel_id', opts.channelId)
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existing?.id) {
      conversationId = existing.id
    } else if (opts.agentId) {
      // Create conversation if none exists (requires agentId)
      const { data: created } = await db
        .from('conversations')
        .insert({
          organization_id: opts.organizationId,
          contact_id: opts.contactId,
          channel_id: opts.channelId,
          agent_id: opts.agentId,
          status: 'open',
          mode: 'ai',
          subject: `Funil — ${opts.stageName}`,
        })
        .select('id')
        .single()
      conversationId = created?.id ?? null
    }

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
async function sendMessage(
  credentials: { evolutionApiUrl: string; instanceName: string; apiKey: string },
  phone: string,
  msg: { type: string; content: string }
) {
  const { evolutionApiUrl, instanceName, apiKey } = credentials
  const headers = { apikey: apiKey, 'Content-Type': 'application/json' }

  if (msg.type === 'text') {
    await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ number: phone, text: msg.content }),
    })
  } else if (msg.type === 'image') {
    await fetch(`${evolutionApiUrl}/message/sendMedia/${instanceName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ number: phone, mediatype: 'image', media: msg.content }),
    })
  } else if (msg.type === 'audio') {
    await fetch(`${evolutionApiUrl}/message/sendMedia/${instanceName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ number: phone, mediatype: 'audio', media: msg.content }),
    })
  }
}
