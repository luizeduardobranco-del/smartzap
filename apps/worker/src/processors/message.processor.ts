import type { Job } from 'bullmq'
import type { Database } from '@zapagent/database'
import { eq, desc, and, sql } from 'drizzle-orm'
import {
  messages,
  conversations,
  agents,
  channels,
  organizations,
  knowledgeChunks,
  creditTransactions,
} from '@zapagent/database'
import { runAgent } from '@zapagent/ai-engine'
import { calculateCredits } from '@zapagent/shared'
import type { AIModelId } from '@zapagent/shared'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'
import type { MessageJobData } from '../queues/message.queue'

const MAX_HISTORY_MESSAGES = 20

export async function processMessage(job: Job<MessageJobData>, db: Database): Promise<void> {
  const { messageId, conversationId, organizationId, agentId, channelId, userMessageContent } =
    job.data

  // 1. Load organization and check credits
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1)

  if (!org) throw new Error(`Organization not found: ${organizationId}`)
  if (org.creditsBalance <= 0) {
    console.warn(`Organization ${organizationId} has no credits. Skipping AI response.`)
    return
  }

  // 2. Load agent config
  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1)
  if (!agent) throw new Error(`Agent not found: ${agentId}`)
  if (agent.status !== 'active') return

  // 3. Load channel config
  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1)
  if (!channel) throw new Error(`Channel not found: ${channelId}`)

  // 4. Load conversation history
  const history = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(
      and(eq(messages.conversationId, conversationId), sql`${messages.id} != ${messageId}`)
    )
    .orderBy(desc(messages.createdAt))
    .limit(MAX_HISTORY_MESSAGES)

  const conversationHistory = history.reverse().map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content ?? '',
  }))

  // 5. RAG: retrieve relevant knowledge chunks
  const retrievedContext = await retrieveContext(db, agentId, userMessageContent)

  // 6. Run AI agent
  const aiConfig = agent.aiConfig as Parameters<typeof runAgent>[0]['aiConfig']
  const personality = agent.personality as Parameters<typeof runAgent>[0]['personality']
  const behaviorConfig = agent.behaviorConfig as Parameters<typeof runAgent>[0]['behaviorConfig']

  const result = await runAgent({
    personality,
    aiConfig,
    behaviorConfig,
    conversationHistory,
    userMessage: userMessageContent,
    retrievedContext,
    env: {
      openaiApiKey: process.env.OPENAI_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      groqApiKey: process.env.GROQ_API_KEY,
    },
  })

  // 7. Calculate credits and debit atomically
  const creditsToDebit = calculateCredits(
    aiConfig.model as AIModelId,
    result.tokensInput,
    result.tokensOutput
  )

  await db.transaction(async (tx) => {
    // Insert AI response message
    await tx.insert(messages).values({
      conversationId,
      organizationId,
      role: 'assistant',
      content: result.content,
      contentType: 'text',
      senderType: 'agent_ai',
      senderId: agentId,
      aiModel: result.model,
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
      creditsUsed: creditsToDebit,
    })

    // Debit credits
    const newBalance = (org.creditsBalance ?? 0) - creditsToDebit
    await tx
      .update(organizations)
      .set({
        creditsBalance: Math.max(0, newBalance),
        creditsUsed: sql`${organizations.creditsUsed} + ${creditsToDebit}`,
      })
      .where(eq(organizations.id, organizationId))

    await tx.insert(creditTransactions).values({
      organizationId,
      type: 'message_ai',
      amount: -creditsToDebit,
      balanceAfter: Math.max(0, newBalance),
      description: `Mensagem do agente ${agent.name} (${result.model})`,
      referenceId: messageId,
      referenceType: 'message',
    })

    // Update conversation last message time
    await tx
      .update(conversations)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(conversations.id, conversationId))
  })

  // 8. Send response via channel
  if (channel.type === 'whatsapp') {
    await sendWhatsAppResponse(channel, result.content)
  }

  // 9. Handle human handoff if triggered
  if (result.shouldHandoffToHuman) {
    await db
      .update(conversations)
      .set({ mode: 'human' })
      .where(eq(conversations.id, conversationId))
  }
}

async function retrieveContext(
  db: Database,
  agentId: string,
  query: string
): Promise<string | undefined> {
  // Generate embedding for the query using OpenAI
  const { OpenAIProvider } = await import('@zapagent/ai-engine')
  const openai = new OpenAIProvider(process.env.OPENAI_API_KEY!)

  try {
    const embedding = await openai.createEmbedding(query)
    const embeddingStr = `[${embedding.join(',')}]`

    // Vector similarity search in pgvector
    const chunks = await db.execute(
      sql`
        SELECT content, metadata
        FROM knowledge_chunks
        WHERE agent_id = ${agentId}
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT 5
      `
    )

    if (!chunks.rows.length) return undefined

    return chunks.rows
      .map((row: Record<string, unknown>) => row.content as string)
      .join('\n\n---\n\n')
  } catch (err) {
    console.error('RAG retrieval failed:', err)
    return undefined
  }
}

async function sendWhatsAppResponse(
  channel: { credentials: unknown; config: unknown },
  text: string
): Promise<void> {
  const credentials = channel.credentials as {
    evolutionApiUrl: string
    instanceName: string
    apiKey: string
    phoneNumber: string
  }
  const config = channel.config as { phoneNumber?: string }

  const adapter = new EvolutionWhatsAppAdapter(
    credentials.evolutionApiUrl,
    credentials.apiKey,
    credentials.instanceName
  )

  await adapter.sendMessage({
    channelType: 'whatsapp',
    channelIdentifier: credentials.instanceName,
    recipientExternalId: config.phoneNumber ?? credentials.phoneNumber,
    contentType: 'text',
    text,
  })
}
