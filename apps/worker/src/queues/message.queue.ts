import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'

export interface MessageJobData {
  messageId: string
  conversationId: string
  organizationId: string
  agentId: string
  channelId: string
  userMessageContent: string
}

export function createMessageQueue(redis: Redis) {
  return new Queue<MessageJobData>('message-processing', {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  })
}
