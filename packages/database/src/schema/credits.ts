import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { organizations } from './tenants'

export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    // credit types: plan_renewal|purchase|bonus|refund
    // debit types: message_ai|training_document|automation_run
    amount: integer('amount').notNull(), // positive=credit, negative=debit
    balanceAfter: integer('balance_after').notNull(),
    description: text('description'),
    referenceId: uuid('reference_id'),
    referenceType: varchar('reference_type', { length: 100 }),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    orgTimeIdx: index('credit_transactions_org_time_idx').on(
      table.organizationId,
      table.createdAt
    ),
  })
)

export const creditPackages = pgTable('credit_packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  credits: integer('credits').notNull(),
  bonusCredits: integer('bonus_credits').default(0),
  price: integer('price').notNull(), // in cents (BRL)
  stripePriceId: varchar('stripe_price_id', { length: 255 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  organization: one(organizations, {
    fields: [creditTransactions.organizationId],
    references: [organizations.id],
  }),
}))
