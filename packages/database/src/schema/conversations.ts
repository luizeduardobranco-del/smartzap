import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { organizations } from './tenants'
import { agents } from './agents'

export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // whatsapp|instagram|widget
  status: varchar('status', { length: 50 }).default('disconnected'),
  credentials: jsonb('credentials'), // encrypted at app level
  config: jsonb('config').default({}),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  externalId: varchar('external_id', { length: 255 }),
  channelType: varchar('channel_type', { length: 50 }),
  name: varchar('name', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  avatarUrl: text('avatar_url'),
  tags: text('tags').array().default(sql`'{}'`),
  customFields: jsonb('custom_fields').default({}),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id),
    agentId: uuid('agent_id').references(() => agents.id),
    assignedTo: uuid('assigned_to'), // human user id
    status: varchar('status', { length: 50 }).default('open'), // open|in_progress|resolved|archived
    kanbanStage: varchar('kanban_stage', { length: 100 }).default('new'),
    // new|contacted|qualified|proposal|closed_won|closed_lost
    mode: varchar('mode', { length: 50 }).default('ai'), // ai|human|hybrid
    subject: text('subject'),
    tags: text('tags').array().default(sql`'{}'`),
    metadata: jsonb('metadata').default({}),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    statusStageIdx: index('conversations_status_stage_idx').on(
      table.organizationId,
      table.status,
      table.kanbanStage
    ),
    lastMessageIdx: index('conversations_last_message_idx').on(
      table.organizationId,
      table.lastMessageAt
    ),
  })
)

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }).notNull(), // user|assistant|system
    content: text('content'),
    contentType: varchar('content_type', { length: 50 }).default('text'),
    // text|image|audio|document|template
    mediaUrl: text('media_url'),
    senderType: varchar('sender_type', { length: 50 }), // contact|agent_ai|agent_human
    senderId: uuid('sender_id'),
    // AI tracking
    aiModel: varchar('ai_model', { length: 100 }),
    tokensInput: integer('tokens_input').default(0),
    tokensOutput: integer('tokens_output').default(0),
    creditsUsed: integer('credits_used').default(0),
    // Delivery
    deliveryStatus: varchar('delivery_status', { length: 50 }), // sent|delivered|read|failed
    externalId: varchar('external_id', { length: 255 }),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    conversationTimeIdx: index('messages_conversation_time_idx').on(
      table.conversationId,
      table.createdAt
    ),
  })
)

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  contact: one(contacts, { fields: [conversations.contactId], references: [contacts.id] }),
  channel: one(channels, { fields: [conversations.channelId], references: [channels.id] }),
  agent: one(agents, { fields: [conversations.agentId], references: [agents.id] }),
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}))
