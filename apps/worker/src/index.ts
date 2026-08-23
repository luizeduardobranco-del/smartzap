import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { createDb } from '@zapagent/database'
import { processMessage } from './processors/message.processor'
import { processAutomation } from './processors/automation.processor'
import { processFunnelScheduler } from './processors/funnel-scheduler.processor'
import { createMessageQueue } from './queues/message.queue'
import { createAutomationQueue, createFunnelSchedulerQueue } from './queues/automation.queue'
import type { MessageJobData } from './queues/message.queue'
import type { AutomationJobData, FunnelSchedulerJobData } from './queues/automation.queue'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const DATABASE_URL = process.env.DATABASE_URL!

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
const db = createDb(DATABASE_URL)

// ─── Queues (exported for use in processors) ─────────────────────────────────
export const messageQueue      = createMessageQueue(redis)
export const automationQueue   = createAutomationQueue(redis)
export const funnelSchedulerQueue = createFunnelSchedulerQueue(redis)

console.log('🚀 WHITE CHAT Worker starting...')
console.log(`📡 Redis: ${REDIS_URL}`)
console.log(`🗄️  Database: connected`)

// Shared connection options — suppresses ioredis version mismatch between bullmq's bundled ioredis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const conn = redis as any

// ─── Worker: Message processing ──────────────────────────────────────────────
const messageWorker = new Worker<MessageJobData>(
  'message-processing',
  async (job) => {
    console.log(`Processing message job ${job.id}: conversation=${job.data.conversationId}`)
    await processMessage(job, db)
    console.log(`✅ Message job ${job.id} completed`)
  },
  { connection: conn, concurrency: 10 }
)

messageWorker.on('failed', (job, err) => {
  console.error(`❌ Message job ${job?.id} failed:`, err.message)
})

// ─── Worker: Automation trigger ──────────────────────────────────────────────
const automationWorker = new Worker<AutomationJobData>(
  'automation-trigger',
  async (job) => {
    console.log(`Processing automation job ${job.id}: automation=${job.data.automationId}`)
    await processAutomation(job, db)
    console.log(`✅ Automation job ${job.id} completed`)
  },
  { connection: conn, concurrency: 5 }
)

automationWorker.on('failed', (job, err) => {
  console.error(`❌ Automation job ${job?.id} failed:`, err.message)
})

// ─── Worker: Funnel scheduler (runs every 60s) ───────────────────────────────
const funnelWorker = new Worker<FunnelSchedulerJobData>(
  'funnel-scheduler',
  async (job) => {
    await processFunnelScheduler(job, db)
  },
  { connection: conn, concurrency: 1 } // serial — avoid race conditions on same row
)

funnelWorker.on('failed', (job, err: Error) => {
  console.error(`❌ Funnel scheduler job ${job?.id} failed:`, err.message)
})

// Register repeatable funnel scheduler job (every 60 seconds)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(funnelSchedulerQueue as any).add(
  'funnel-scheduler-tick',
  { tick: Date.now() },
  {
    repeat: { every: 60_000 }, // every 60 seconds
    jobId: 'funnel-scheduler-recurring',
  }
).then(() => {
  console.log('⏱️  Funnel scheduler registered (every 60s)')
}).catch((err: Error) => {
  console.error('Failed to register funnel scheduler:', err)
})

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown() {
  console.log('Shutting down workers gracefully...')
  await Promise.all([
    messageWorker.close(),
    automationWorker.close(),
    funnelWorker.close(),
  ])
  await redis.quit()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log('✅ Workers started: message-processing, automation-trigger, funnel-scheduler')
