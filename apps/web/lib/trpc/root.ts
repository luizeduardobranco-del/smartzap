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
import { billingRouter } from './routers/billing'
import { integrationsRouter } from './routers/integrations'
import { funnelsRouter } from './routers/funnels'
import { onboardingRouter } from './routers/onboarding'
import { couponsRouter } from './routers/coupons'
import { referralsRouter } from './routers/referrals'
import { storiesRouter } from './routers/stories'
import { membersRouter } from './routers/members'

export const appRouter = router({
  members: membersRouter,
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
  billing: billingRouter,
  integrations: integrationsRouter,
  funnels: funnelsRouter,
  onboarding: onboardingRouter,
  coupons: couponsRouter,
  referrals: referralsRouter,
  stories: storiesRouter,
})

export type AppRouter = typeof appRouter
