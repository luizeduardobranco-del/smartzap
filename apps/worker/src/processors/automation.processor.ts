/**
 * @fileoverview Automation Executor
 *
 * Processa automações do WHITE CHAT.
 * Suporta dois formatos:
 *   1. Single-action  — action_type + action_config (formato legado da UI atual)
 *   2. Flow (ReactFlow) — flow_definition.nodes + edges (formato futuro)
 *
 * Triggers suportados: keyword, first_message, off_hours, no_response,
 *                      contact_created, stage_changed
 *
 * Actions suportadas: send_message, add_tag, change_stage, handoff,
 *                     send_email, send_webhook, wait
 */

import type { Job } from 'bullmq'
import type { Database } from '@zapagent/database'
import { eq, and, sql } from 'drizzle-orm'
import { automations, automationRuns } from '@zapagent/database'
import { EvolutionWhatsAppAdapter, MetaCloudWhatsAppAdapter } from '@zapagent/channel-adapters'
import type { AutomationJobData } from '../queues/automation.queue'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FlowNode {
  id: string
  type: string  // 'trigger' | 'send_message' | 'add_tag' | 'change_stage' | 'wait' | 'send_webhook' | 'handoff' | 'condition'
  data: Record<string, unknown>
}

interface FlowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
}

interface FlowDefinition {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

interface StepLog {
  nodeId: string
  action: string
  status: 'ok' | 'error' | 'skipped'
  at: string
  error?: string
}

// ─── Main processor ──────────────────────────────────────────────────────────

export async function processAutomation(
  job: Job<AutomationJobData>,
  db: Database
): Promise<void> {
  const {
    automationId,
    organizationId,
    conversationId,
    contactId,
    channelId,
    recipientPhone,
    resumeFromNodeId,
    flowState,
  } = job.data

  // 1. Load automation
  const [automation] = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, automationId), eq(automations.organizationId, organizationId)))
    .limit(1)

  if (!automation) {
    console.warn(`[AutomationProcessor] Automation not found: ${automationId}`)
    return
  }

  if (automation.status !== 'active') {
    console.log(`[AutomationProcessor] Automation ${automationId} is not active, skipping`)
    return
  }

  // 2. Create run record
  const [run] = await db
    .insert(automationRuns)
    .values({
      automationId,
      organizationId,
      conversationId: conversationId ?? null,
      status: 'running',
      stepsLog: [],
    })
    .returning()

  const stepsLog: StepLog[] = []

  try {
    // 3. Resolve channel for sending messages
    const channel = channelId ? await loadChannel(db, channelId) : null

    // 4. Execute — detect format
    const flowDef = automation.flowDefinition as FlowDefinition | null
    const hasFlow = flowDef && Array.isArray(flowDef.nodes) && flowDef.nodes.length > 0

    if (hasFlow) {
      await executeFlow(flowDef!, job, db, channel, {
        conversationId, contactId, recipientPhone, organizationId,
        resumeFromNodeId,
        // Store edges in flowState so wait-nodes can find the next node to queue
        flowState: { ...(flowState ?? {}), _edges: flowDef!.edges },
      }, stepsLog)
    } else {
      // Legacy single-action format
      const rec = automation as Record<string, unknown>
      const actionType = rec['action_type'] as string | undefined
      const actionConfig = (rec['action_config'] ?? {}) as Record<string, unknown>
      if (actionType) {
        await executeAction(
          { id: 'legacy', type: actionType, data: actionConfig },
          job, db, channel,
          { conversationId, contactId, recipientPhone, organizationId, flowState: {} },
          stepsLog
        )
      }
    }

    // 5. Mark run completed
    await db
      .update(automationRuns)
      .set({ status: 'completed', completedAt: new Date(), stepsLog })
      .where(eq(automationRuns.id, run.id))

    // 6. Update automation stats
    await db
      .update(automations)
      .set({
        lastRunAt: new Date(),
        runCount: sql`${automations.runCount} + 1`,
      })
      .where(eq(automations.id, automationId))

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[AutomationProcessor] Run failed for automation ${automationId}:`, msg)
    await db
      .update(automationRuns)
      .set({ status: 'failed', completedAt: new Date(), stepsLog, errorMessage: msg })
      .where(eq(automationRuns.id, run.id))
    throw err
  }
}

// ─── Flow executor ───────────────────────────────────────────────────────────

interface ExecContext {
  conversationId?: string
  contactId?: string
  recipientPhone?: string
  organizationId: string
  resumeFromNodeId?: string
  flowState: Record<string, unknown>
}

async function executeFlow(
  flow: FlowDefinition,
  job: Job<AutomationJobData>,
  db: Database,
  channel: ChannelRecord | null,
  ctx: ExecContext,
  stepsLog: StepLog[]
): Promise<void> {
  // Find entry node (trigger node or first node with no incoming edges)
  const nodeIds = new Set(flow.nodes.map((n) => n.id))
  const targetIds = new Set(flow.edges.map((e) => e.target))
  const entryNodes = flow.nodes.filter((n) => !targetIds.has(n.id) || n.type === 'trigger')

  if (entryNodes.length === 0) {
    console.warn('[AutomationProcessor] No entry node found in flow')
    return
  }

  // Start from entry or resume point
  const startNodeId = ctx.resumeFromNodeId ?? entryNodes[0].id
  const startNode = flow.nodes.find((n) => n.id === startNodeId)
  if (!startNode) return

  // Walk the graph
  let currentNode: FlowNode | undefined = startNode
  const visited = new Set<string>()

  while (currentNode) {
    if (visited.has(currentNode.id)) break // loop guard
    visited.add(currentNode.id)

    // Skip trigger node — it's just the entry point
    if (currentNode.type !== 'trigger') {
      const log = await executeAction(currentNode, job, db, channel, ctx, stepsLog)

      // If it's a wait node, the job will be re-queued — stop here
      if (currentNode.type === 'wait') break

      if (log.status === 'error') {
        console.error(`[AutomationProcessor] Node ${currentNode.id} failed, stopping flow`)
        break
      }
    }

    // Find next node(s)
    const outEdges = flow.edges.filter((e) => e.source === currentNode!.id)
    if (outEdges.length === 0) break

    // Follow first edge (condition branching can be extended later)
    const nextEdge = outEdges[0]
    currentNode = flow.nodes.find((n) => n.id === nextEdge.target)
  }
}

// ─── Action executor ─────────────────────────────────────────────────────────

async function executeAction(
  node: FlowNode,
  job: Job<AutomationJobData>,
  db: Database,
  channel: ChannelRecord | null,
  ctx: ExecContext,
  stepsLog: StepLog[]
): Promise<StepLog> {
  const log: StepLog = { nodeId: node.id, action: node.type, status: 'ok', at: new Date().toISOString() }
  stepsLog.push(log)

  try {
    switch (node.type) {
      // ── Send Message ──────────────────────────────────────────────────────
      case 'send_message': {
        const message = (node.data.message ?? node.data.text ?? '') as string
        if (!message) { log.status = 'skipped'; break }
        await sendMessage(channel, ctx.recipientPhone, message)
        break
      }

      // ── Add Tag ──────────────────────────────────────────────────────────
      case 'add_tag': {
        const tag = node.data.tag as string | undefined
        if (!tag || !ctx.contactId) { log.status = 'skipped'; break }
        await db.execute(sql`
          UPDATE contacts
          SET tags = CASE
            WHEN tags IS NULL THEN ARRAY[${tag}]
            WHEN NOT (${tag} = ANY(tags)) THEN array_append(tags, ${tag})
            ELSE tags
          END,
          updated_at = NOW()
          WHERE id = ${ctx.contactId}
        `)
        break
      }

      // ── Change Stage ─────────────────────────────────────────────────────
      case 'change_stage': {
        const stage = node.data.stage as string | undefined
        if (!stage || !ctx.contactId) { log.status = 'skipped'; break }
        await db.execute(sql`
          UPDATE contacts SET kanban_stage = ${stage}, updated_at = NOW()
          WHERE id = ${ctx.contactId}
        `)
        break
      }

      // ── Handoff ──────────────────────────────────────────────────────────
      case 'handoff': {
        if (!ctx.conversationId) { log.status = 'skipped'; break }
        await db.execute(sql`
          UPDATE conversations SET mode = 'human', updated_at = NOW()
          WHERE id = ${ctx.conversationId}
        `)
        break
      }

      // ── Send Webhook ─────────────────────────────────────────────────────
      case 'send_webhook': {
        const url = node.data.url as string | undefined
        if (!url) { log.status = 'skipped'; break }
        const payload = node.data.payload
          ? JSON.parse(node.data.payload as string)
          : { conversationId: ctx.conversationId, contactId: ctx.contactId, organizationId: ctx.organizationId }

        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        })
        break
      }

      // ── Wait ─────────────────────────────────────────────────────────────
      case 'wait': {
        const minutes = (node.data.minutes as number) ?? 60
        // Re-queue the same automation to resume from the NEXT node after this wait.
        // We pass the flow edges via ctx.flowState so we can find the next node id.
        const edges = (ctx.flowState._edges ?? []) as FlowEdge[]
        const edge = edges.find((e: FlowEdge) => e.source === node.id)
        if (edge) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { automationQueue } = await import('../index.js') as any
          await automationQueue.add(
            'automation-trigger',
            { ...job.data, resumeFromNodeId: edge.target },
            { delay: minutes * 60 * 1000 }
          )
        }
        break
      }

      default:
        log.status = 'skipped'
        console.warn(`[AutomationProcessor] Unknown action type: ${node.type}`)
    }
  } catch (err) {
    log.status = 'error'
    log.error = err instanceof Error ? err.message : String(err)
    console.error(`[AutomationProcessor] Action ${node.type} failed:`, log.error)
  }

  return log
}

// ─── Trigger evaluator ───────────────────────────────────────────────────────

/**
 * Avalia se uma automação deve ser disparada com base no evento recebido.
 * Retorna true se o trigger bate.
 */
export function evaluateTrigger(
  triggerType: string,
  triggerConfig: Record<string, unknown>,
  event: {
    messageContent?: string
    isFirstMessage?: boolean
    tagAdded?: string
    stageChanged?: string
    hourOfDay?: number
  }
): boolean {
  switch (triggerType) {
    case 'keyword': {
      const keywords = (triggerConfig.keywords as string[] | undefined) ?? []
      const matchAll = (triggerConfig.matchAll as boolean) ?? false
      const text = (event.messageContent ?? '').toLowerCase()
      if (keywords.length === 0) return false
      if (matchAll) return keywords.every((k) => text.includes(k.toLowerCase()))
      return keywords.some((k) => text.includes(k.toLowerCase()))
    }

    case 'first_message':
      return !!event.isFirstMessage

    case 'off_hours': {
      const startHour = (triggerConfig.startHour as number) ?? 18
      const endHour = (triggerConfig.endHour as number) ?? 8
      const hour = event.hourOfDay ?? new Date().getHours()
      // Handles overnight ranges (e.g. 18–8)
      if (startHour > endHour) return hour >= startHour || hour < endHour
      return hour >= startHour && hour < endHour
    }

    case 'stage_changed':
      return !!event.stageChanged &&
        (!triggerConfig.stage || event.stageChanged === triggerConfig.stage)

    case 'tag_added':
      return !!event.tagAdded &&
        (!triggerConfig.tag || event.tagAdded === triggerConfig.tag)

    case 'contact_created':
      return true // fired externally when contact is created

    default:
      return false
  }
}

/**
 * Busca e enfileira automações ativas que batem com o evento recebido.
 * Chamado no message.processor.ts após processar a mensagem.
 */
export async function dispatchMatchingAutomations(
  db: Database,
  params: {
    organizationId: string
    conversationId: string
    contactId?: string
    channelId: string
    recipientPhone: string
    messageContent: string
    isFirstMessage: boolean
  }
): Promise<void> {
  try {
    const result = await db.execute(sql`
      SELECT id, trigger_type, trigger_config, flow_definition, action_type, action_config
      FROM automations
      WHERE organization_id = ${params.organizationId}
        AND status = 'active'
    `)

    const hourOfDay = new Date().getHours()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((result as any).rows ?? result) as Record<string, unknown>[]

    for (const row of rows) {
      const triggerType = row['trigger_type'] as string
      const triggerConfig = (row['trigger_config'] ?? {}) as Record<string, unknown>

      const matches = evaluateTrigger(triggerType, triggerConfig, {
        messageContent: params.messageContent,
        isFirstMessage: params.isFirstMessage,
        hourOfDay,
      })

      if (matches) {
        // Import queue lazily to avoid circular deps
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { automationQueue } = await import('../index.js') as any
        await automationQueue.add('automation-trigger', {
          automationId: row['id'] as string,
          organizationId: params.organizationId,
          conversationId: params.conversationId,
          contactId: params.contactId,
          channelId: params.channelId,
          recipientPhone: params.recipientPhone,
          triggerType,
          triggerPayload: { messageContent: params.messageContent },
        })
      }
    }
  } catch (err) {
    // Non-fatal — automation dispatch should never break message processing
    console.error('[AutomationProcessor] dispatchMatchingAutomations failed:', err)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface ChannelRecord {
  type: string
  provider: string
  settings: Record<string, unknown>
  credentials: Record<string, unknown>
}

async function loadChannel(db: Database, channelId: string): Promise<ChannelRecord | null> {
  try {
    const result = await db.execute(sql`
      SELECT type, provider, settings, credentials
      FROM channels WHERE id = ${channelId} LIMIT 1
    `)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((result as any).rows ?? result) as ChannelRecord[]
    return rows[0] ?? null
  } catch {
    return null
  }
}

async function sendMessage(
  channel: ChannelRecord | null,
  recipientPhone: string | undefined,
  text: string
): Promise<void> {
  if (!channel || !recipientPhone) {
    console.warn('[AutomationProcessor] sendMessage: no channel or recipient')
    return
  }

  const evolutionUrl = process.env.EVOLUTION_API_URL
  const evolutionKey = process.env.EVOLUTION_API_KEY

  if (channel.provider === 'evolution' && evolutionUrl && evolutionKey) {
    const instanceName = (channel.credentials?.instance_name ?? channel.settings?.instanceName) as string
    const adapter = new EvolutionWhatsAppAdapter(evolutionUrl, evolutionKey, instanceName)
    await adapter.sendMessage({
      channelType: 'whatsapp',
      channelIdentifier: instanceName,
      recipientExternalId: recipientPhone,
      contentType: 'text',
      text,
    })
    return
  }

  if (channel.provider === 'meta-cloud') {
    const accessToken = channel.credentials?.access_token as string
    const phoneNumberId = channel.credentials?.phone_number_id as string
    if (accessToken && phoneNumberId) {
      const adapter = new MetaCloudWhatsAppAdapter(accessToken, phoneNumberId)
      await adapter.sendMessage({
        channelType: 'whatsapp',
        channelIdentifier: phoneNumberId,
        recipientExternalId: recipientPhone,
        contentType: 'text',
        text,
      })
    }
    return
  }

  console.warn(`[AutomationProcessor] Unsupported channel provider: ${channel.provider}`)
}
