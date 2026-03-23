import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { createDb } from '@zapagent/database'
import { processMessage } from './processors/message.processor'
import type { MessageJobData } from './queues/message.queue'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const DATABASE_URL = process.env.DATABASE_URL!

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
const db = createDb(DATABASE_URL)

console.log('🚀 ZapAgent Worker starting...')
console.log(`📡 Redis: ${REDIS_URL}`)
console.log(`🗄️  Database: connected`)

// Message processing worker
const messageWorker = new Worker<MessageJobData>(
  'message-processing',
  async (job) => {
    console.log(`Processing message job ${job.id}: conversation=${job.data.conversationId}`)
    await processMessage(job, db)
    console.log(`✅ Message job ${job.id} completed`)
  },
  {
    connection: redis,
    concurrency: 10, // Process up to 10 messages simultaneously
  }
)

messageWorker.on('failed', (job, err) => {
  console.error(`❌ Message job ${job?.id} failed:`, err.message)
})

messageWorker.on('error', (err) => {
  console.error('Worker error:', err)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing worker gracefully...')
  await messageWorker.close()
  await redis.quit()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing worker gracefully...')
  await messageWorker.close()
  await redis.quit()
  process.exit(0)
})

console.log('✅ Workers started and listening for jobs')
