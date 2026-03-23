import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { organizations } from './tenants'
import { agents } from './agents'
import { conversations } from './conversations'

export const automations = pgTable('automations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('draft'), // draft|active|paused
  triggerType: varchar('trigger_type', { length: 100 }).notNull(),
  // conversation_started|keyword_match|tag_added|schedule_cron|webhook_received|stage_changed
  triggerConfig: jsonb('trigger_config').default({}),
  flowDefinition: jsonb('flow_definition').notNull(), // ReactFlow nodes + edges
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  runCount: integer('run_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const automationRuns = pgTable('automation_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  automationId: uuid('automation_id')
    .notNull()
    .references(() => automations.id),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  conversationId: uuid('conversation_id').references(() => conversations.id),
  status: varchar('status', { length: 50 }), // running|completed|failed
  stepsLog: jsonb('steps_log').default([]),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
})

export const automationsRelations = relations(automations, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [automations.organizationId],
    references: [organizations.id],
  }),
  agent: one(agents, { fields: [automations.agentId], references: [agents.id] }),
  runs: many(automationRuns),
}))
