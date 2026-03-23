import { NextRequest, NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { createDb, channels, contacts, conversations, messages, organizations } from '@zapagent/database'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

const db = createDb(process.env.DATABASE_URL!)

let messageQueue: Queue | null = null

function getMessageQueue() {
  if (!messageQueue) {
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    })
    messageQueue = new Queue('message-processing', { connection: redis })
  }
  return messageQueue
}

// Dummy adapter for parsing - no credentials needed for parsing
const adapter = new EvolutionWhatsAppAdapter('', '', '')

export async function POST(request: NextRequest) {
  // Return 200 immediately to avoid timeout issues with Evolution API
  const payload = await request.json()

  // Process asynchronously without awaiting
  handleWebhook(payload).catch((err) => {
    console.error('Webhook processing error:', err)
  })

  return NextResponse.json({ ok: true })
}

async function handleWebhook(payload: unknown) {
  // 1. Parse the webhook payload
  const normalizedMessage = adapter.parseWebhook(payload)
  if (!normalizedMessage) return // Not a message event we care about

  // 2. Find the channel by instance identifier
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.type, 'whatsapp'))
    .limit(1) // In production: filter by instanceName from credentials

  if (!channel) {
    console.warn(`No channel found for instance: ${normalizedMessage.channelIdentifier}`)
    return
  }

  // 3. Check organization credits
  const [org] = await db
    .select({ creditsBalance: organizations.creditsBalance })
    .from(organizations)
    .where(eq(organizations.id, channel.organizationId))
    .limit(1)

  if (!org || org.creditsBalance <= 0) {
    console.warn(`Organization ${channel.organizationId} has no credits`)
    return
  }

  // 4. Upsert contact
  let contact = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.organizationId, channel.organizationId),
        eq(contacts.channelType, 'whatsapp'),
        eq(contacts.externalId, normalizedMessage.senderExternalId)
      )
    )
    .then((rows) => rows[0])

  if (!contact) {
    const [inserted] = await db
      .insert(contacts)
      .values({
        organizationId: channel.organizationId,
        externalId: normalizedMessage.senderExternalId,
        channelType: 'whatsapp',
        name: normalizedMessage.senderName ?? normalizedMessage.senderExternalId,
        phone: normalizedMessage.senderExternalId,
      })
      .returning()
    contact = inserted
  } else if (normalizedMessage.senderName && !contact.name) {
    await db
      .update(contacts)
      .set({ name: normalizedMessage.senderName })
      .where(eq(contacts.id, contact.id))
  }

  // 5. Find or create conversation
  let conversation = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.contactId, contact.id),
        eq(conversations.channelId, channel.id),
        eq(conversations.status, 'open')
      )
    )
    .then((rows) => rows[0])

  if (!conversation) {
    const [inserted] = await db
      .insert(conversations)
      .values({
        organizationId: channel.organizationId,
        contactId: contact.id,
        channelId: channel.id,
        agentId: channel.agentId,
        status: 'open',
        mode: 'ai',
      })
      .returning()
    conversation = inserted
  }

  // 6. If conversation is in human mode, don't process with AI
  if (conversation.mode === 'human') {
    // Just save the message, notify operators via Supabase Realtime (handled by DB trigger)
    await db.insert(messages).values({
      conversationId: conversation.id,
      organizationId: channel.organizationId,
      role: 'user',
      content: normalizedMessage.text ?? '[mídia]',
      contentType: normalizedMessage.contentType,
      mediaUrl: normalizedMessage.mediaUrl,
      senderType: 'contact',
      externalId: normalizedMessage.externalId,
    })
    return
  }

  // 7. Save the incoming message
  const [savedMessage] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      organizationId: channel.organizationId,
      role: 'user',
      content: normalizedMessage.text ?? '[mídia]',
      contentType: normalizedMessage.contentType,
      mediaUrl: normalizedMessage.mediaUrl,
      senderType: 'contact',
      externalId: normalizedMessage.externalId,
    })
    .returning()

  // 8. Only process text messages with AI (for now)
  if (!normalizedMessage.text || normalizedMessage.contentType !== 'text') return
  if (!channel.agentId) return

  // 9. Enqueue for AI processing
  const queue = getMessageQueue()
  await queue.add('process-message', {
    messageId: savedMessage.id,
    conversationId: conversation.id,
    organizationId: channel.organizationId,
    agentId: channel.agentId,
    channelId: channel.id,
    userMessageContent: normalizedMessage.text,
  })
}
