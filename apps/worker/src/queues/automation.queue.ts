import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

export interface AutomationJobData {
  automationId: string
  organizationId: string
  conversationId?: string
  contactId?: string
  channelId?: string
  recipientPhone?: string      // número destino para envio de mensagem
  triggerType: string
  triggerPayload: Record<string, unknown> // dados do evento que disparou
  // Para retomar flows com wait nodes
  resumeFromNodeId?: string
  flowState?: Record<string, unknown>
}

export interface FunnelSchedulerJobData {
  tick: number // timestamp do tick, apenas para identificar o job
}

export function createAutomationQueue(redis: Redis) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Queue<AutomationJobData>('automation-trigger', {
    connection: redis as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1000 },
    },
  })
}

export function createFunnelSchedulerQueue(redis: Redis) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Queue<FunnelSchedulerJobData>('funnel-scheduler', {
    connection: redis as any,
    defaultJobOptions: {
      attempts: 2,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  })
}
