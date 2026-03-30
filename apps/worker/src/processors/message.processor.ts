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

  // 5b. Funnel context: check if contact is in an active funnel stage
  const [conv] = await db
    .select({ contactId: conversations.contactId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)

  const funnelContext = conv?.contactId
    ? await retrieveFunnelContext(db, conv.contactId)
    : undefined

  // Combine funnel context with RAG context
  const combinedContext = [funnelContext, retrievedContext].filter(Boolean).join('\n\n---\n\n') || undefined

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
    retrievedContext: combinedContext,
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

async function retrieveFunnelContext(
  db: Database,
  contactId: string
): Promise<string | undefined> {
  try {
    const result = await db.execute(
      sql`
        SELECT
          f.name        AS funnel_name,
          fs.name       AS stage_name,
          fs.messages   AS stage_messages,
          fc.next_message_index,
          fc.status
        FROM funnel_contacts fc
        JOIN funnels f  ON f.id  = fc.funnel_id
        JOIN funnel_stages fs ON fs.id = fc.stage_id
        WHERE fc.contact_id = ${contactId}
          AND fc.status IN ('active', 'waiting')
        ORDER BY fc.entered_stage_at DESC
        LIMIT 1
      `
    )

    if (!result.rows.length) return undefined

    const row = result.rows[0] as any
    const stageMessages: any[] = row.stage_messages ?? []
    const sentCount: number = row.next_message_index ?? 0
    const sentMessages = stageMessages.slice(0, sentCount)

    let context = `## Contexto do Funil de Prospecção\n`
    context += `Este lead está sendo trabalhado no funil **"${row.funnel_name}"**.\n`
    context += `Etapa atual: **${row.stage_name}**\n`

    if (sentMessages.length > 0) {
      context += `\nMensagens já enviadas automaticamente pelo funil para este contato:\n`
      sentMessages.forEach((m: any, i: number) => {
        if (m.type === 'text') {
          context += `${i + 1}. "${m.content}"\n`
        } else {
          context += `${i + 1}. [${m.type === 'image' ? 'Imagem' : 'Áudio'} enviado]\n`
        }
      })
    }

    context += `\nIMPORTANTE: Você já iniciou contato com este lead via sequência automática do funil. `
    context += `Continue a conversa de forma coerente com o que foi enviado. `
    context += `Não repita as mesmas abordagens iniciais. `
    context += `Seu objetivo nesta etapa é: ${row.stage_name === 'Novo Lead' ? 'qualificar o interesse' : row.stage_name === 'Primeiro Contato' ? 'entender a necessidade e apresentar a solução' : row.stage_name === 'Qualificado' ? 'agendar reunião ou demonstração' : row.stage_name === 'Proposta' ? 'tirar dúvidas e fechar o negócio' : 'dar suporte e fidelizar o cliente'}.`

    return context
  } catch (err) {
    console.error('[message.processor] retrieveFunnelContext failed:', err)
    return undefined
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
