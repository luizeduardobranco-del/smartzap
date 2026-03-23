import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as tenantSchema from './schema/tenants'
import * as agentSchema from './schema/agents'
import * as conversationSchema from './schema/conversations'
import * as creditSchema from './schema/credits'
import * as automationSchema from './schema/automations'

export const schema = {
  ...tenantSchema,
  ...agentSchema,
  ...conversationSchema,
  ...creditSchema,
  ...automationSchema,
}

export type Database = ReturnType<typeof createDb>

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 10 })
  return drizzle(client, { schema })
}

// Re-export all schema types
export * from './schema/tenants'
export * from './schema/agents'
export * from './schema/conversations'
export * from './schema/credits'
export * from './schema/automations'
