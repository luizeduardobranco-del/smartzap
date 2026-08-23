/**
 * @fileoverview Funnel Scheduler Processor
 *
 * Processa mensagens agendadas dos funis de prospecção.
 * Este era o PIECE MISSING que causava as mensagens de funil nunca saírem.
 *
 * Roda a cada ~1 minuto via BullMQ repeatable job.
 * Busca todos os funnel_contacts com next_message_at <= NOW() e status='active',
 * envia a próxima mensagem da sequência, e atualiza o índice + próximo horário.
 */

import type { Job } from 'bullmq'
import type { Database } from '@zapagent/database'
import { sql } from 'drizzle-orm'
import { EvolutionWhatsAppAdapter, MetaCloudWhatsAppAdapter } from '@zapagent/channel-adapters'
import type { FunnelSchedulerJobData } from '../queues/automation.queue'

interface FunnelContactRow {
  fc_id: string
  contact_id: string
  funnel_id: string
  stage_id: string
  next_message_index: number
  channel_id: string
  external_contact_id: string   // número WhatsApp do contato
  stage_messages: FunnelMessage[]
}

interface FunnelMessage {
  type: 'text' | 'image' | 'audio' | 'delay'
  content?: string
  url?: string
  delay_minutes?: number
}

interface ChannelRow {
  id: string
  type: string
  provider: string
  settings: Record<string, unknown>
  credentials: Record<string, unknown>
}

export async function processFunnelScheduler(
  _job: Job<FunnelSchedulerJobData>,
  db: Database
): Promise<void> {
  // 1. Find all due funnel messages
  const result = await db.execute(sql`
    SELECT
      fc.id               AS fc_id,
      fc.contact_id,
      fc.funnel_id,
      fc.stage_id,
      fc.next_message_index,
      fc.channel_id,
      c.phone             AS external_contact_id,
      fs.messages         AS stage_messages
    FROM funnel_contacts fc
    JOIN contacts c        ON c.id  = fc.contact_id
    JOIN funnel_stages fs  ON fs.id = fc.stage_id
    WHERE fc.status = 'active'
      AND fc.next_message_at IS NOT NULL
      AND fc.next_message_at <= NOW()
    ORDER BY fc.next_message_at ASC
    LIMIT 100
  `)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((result as any).rows ?? result) as FunnelContactRow[]

  if (rows.length === 0) return

  console.log(`[FunnelScheduler] Processing ${rows.length} due funnel messages`)

  for (const rawRow of rows) {
    const row = rawRow as FunnelContactRow

    try {
      await processFunnelContact(db, row)
    } catch (err) {
      console.error(`[FunnelScheduler] Failed to process funnel_contact ${row.fc_id}:`, err)
      // Mark as error so it doesn't keep retrying infinitely
      await db.execute(sql`
        UPDATE funnel_contacts
        SET status = 'error', updated_at = NOW()
        WHERE id = ${row.fc_id}
      `)
    }
  }
}

async function processFunnelContact(db: Database, row: FunnelContactRow): Promise<void> {
  const messages: FunnelMessage[] = row.stage_messages ?? []
  const idx = row.next_message_index ?? 0

  // No more messages in this stage — mark finished
  if (idx >= messages.length) {
    await db.execute(sql`
      UPDATE funnel_contacts
      SET status = 'finished', updated_at = NOW()
      WHERE id = ${row.fc_id}
    `)
    return
  }

  const msg = messages[idx]

  // Skip 'delay' pseudo-messages (used only for scheduling)
  if (msg.type !== 'delay' && msg.content) {
    // Load channel
    const chanResult = await db.execute(sql`
      SELECT id, type, provider, settings, credentials
      FROM channels WHERE id = ${row.channel_id} LIMIT 1
    `)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chanRows = ((chanResult as any).rows ?? chanResult) as ChannelRow[]
    const channel = chanRows[0]

    if (channel && row.external_contact_id) {
      await sendFunnelMessage(channel, row.external_contact_id, msg)
    }
  }

  // Calculate when to send the NEXT message
  // Look ahead for the next real message's delay
  const nextIdx = idx + 1
  let nextMessageAt: Date | null = null

  if (nextIdx < messages.length) {
    // Find delay for next message (either explicit delay or next message's delay_minutes)
    const lookahead = messages[nextIdx]
    const delayMinutes = lookahead.delay_minutes ?? 0
    nextMessageAt = new Date(Date.now() + delayMinutes * 60 * 1000)
  }

  // Update funnel_contact
  await db.execute(sql`
    UPDATE funnel_contacts
    SET
      next_message_index = ${nextIdx},
      next_message_at    = ${nextMessageAt ? nextMessageAt.toISOString() : null},
      status             = CASE
                             WHEN ${nextIdx} >= ${messages.length} THEN 'finished'
                             ELSE 'active'
                           END,
      updated_at         = NOW()
    WHERE id = ${row.fc_id}
  `)

  console.log(
    `[FunnelScheduler] Sent message ${idx + 1}/${messages.length} ` +
    `for contact ${row.contact_id} in stage ${row.stage_id}`
  )
}

async function sendFunnelMessage(
  channel: ChannelRow,
  recipientPhone: string,
  msg: FunnelMessage
): Promise<void> {
  const evolutionUrl = process.env.EVOLUTION_API_URL
  const evolutionKey = process.env.EVOLUTION_API_KEY

  if (channel.provider === 'evolution' && evolutionUrl && evolutionKey) {
    const instanceName = (channel.credentials?.instance_name ??
      channel.settings?.instanceName) as string
    const adapter = new EvolutionWhatsAppAdapter(evolutionUrl, evolutionKey, instanceName)

    if (msg.type === 'text' && msg.content) {
      await adapter.sendMessage({
        channelType: 'whatsapp',
        channelIdentifier: instanceName,
        recipientExternalId: recipientPhone,
        contentType: 'text',
        text: msg.content,
      })
    } else if (msg.type === 'image' && msg.url) {
      await adapter.sendImage(recipientPhone, msg.url, msg.content ?? '')
    }
    return
  }

  if (channel.provider === 'meta-cloud') {
    const accessToken = channel.credentials?.access_token as string
    const phoneNumberId = channel.credentials?.phone_number_id as string
    if (accessToken && phoneNumberId && msg.type === 'text' && msg.content) {
      const adapter = new MetaCloudWhatsAppAdapter(accessToken, phoneNumberId)
      await adapter.sendMessage({
        channelType: 'whatsapp',
        channelIdentifier: phoneNumberId,
        recipientExternalId: recipientPhone,
        contentType: 'text',
        text: msg.content,
      })
    }
    return
  }

  console.warn(`[FunnelScheduler] Unsupported channel provider: ${channel.provider}`)
}
