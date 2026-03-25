import { router } from './init'
import { agentsRouter } from './routers/agents'
import { knowledgeRouter } from './routers/knowledge'
import { channelsRouter } from './routers/channels'
import { settingsRouter } from './routers/settings'
import { conversationsRouter } from './routers/conversations'
import { crmRouter } from './routers/crm'
import { automationsRouter } from './routers/automations'
import { analyticsRouter } from './routers/analytics'
import { campaignsRouter } from './routers/campaigns'
import { contactsRouter } from './routers/contacts'

export const appRouter = router({
  agents: agentsRouter,
  knowledge: knowledgeRouter,
  channels: channelsRouter,
  settings: settingsRouter,
  conversations: conversationsRouter,
  crm: crmRouter,
  automations: automationsRouter,
  analytics: analyticsRouter,
  campaigns: campaignsRouter,
  contacts: contactsRouter,
})

export type AppRouter = typeof appRouter
