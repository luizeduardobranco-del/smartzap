import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
  customType,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// pgvector custom type (drizzle-orm/pg-core doesn't export `vector` in v0.30)
const vector = customType<{ data: number[]; config: { dimensions: number }; driverData: string }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`
  },
  fromDriver(value: string): number[] {
    return value.slice(1, -1).split(',').map(Number)
  },
})
import { organizations } from './tenants'

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  description: text('description'),
  avatarUrl: text('avatar_url'),
  status: varchar('status', { length: 50 }).default('draft'), // draft|active|paused|archived
  personality: jsonb('personality').notNull().default({}),
  aiConfig: jsonb('ai_config').notNull().default({}),
  behaviorConfig: jsonb('behavior_config').notNull().default({}),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const agentKnowledgeSources = pgTable('agent_knowledge_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // document|url|faq|text
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).default('pending'), // pending|processing|ready|error
  metadata: jsonb('metadata').default({}),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const knowledgeChunks = pgTable(
  'knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => agentKnowledgeSources.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    agentIdx: index('knowledge_chunks_agent_idx').on(table.agentId),
  })
)

export const agentsRelations = relations(agents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [agents.organizationId],
    references: [organizations.id],
  }),
  knowledgeSources: many(agentKnowledgeSources),
}))

export const knowledgeSourcesRelations = relations(agentKnowledgeSources, ({ one, many }) => ({
  agent: one(agents, { fields: [agentKnowledgeSources.agentId], references: [agents.id] }),
  chunks: many(knowledgeChunks),
}))
