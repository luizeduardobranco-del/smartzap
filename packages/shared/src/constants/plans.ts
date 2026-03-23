export const PLANS = {
  free: {
    name: 'Free',
    slug: 'free',
    priceMonthly: 0,
    priceYearly: 0,
    creditsMonthly: 100,
    limits: {
      maxAgents: 1,
      maxChannels: 1,
      maxTeamMembers: 1,
      maxDocumentsPerAgent: 3,
      hasCustomBranding: false,
      hasApiAccess: false,
      hasAutomations: false,
      hasAnalytics: false,
    },
  },
  starter: {
    name: 'Starter',
    slug: 'starter',
    priceMonthly: 9700, // R$ 97,00 em centavos
    priceYearly: 87000, // R$ 870,00/ano
    creditsMonthly: 2000,
    limits: {
      maxAgents: 3,
      maxChannels: 3,
      maxTeamMembers: 2,
      maxDocumentsPerAgent: 20,
      hasCustomBranding: false,
      hasApiAccess: false,
      hasAutomations: true,
      hasAnalytics: true,
    },
  },
  pro: {
    name: 'Pro',
    slug: 'pro',
    priceMonthly: 29700, // R$ 297,00
    priceYearly: 267000, // R$ 2.670,00/ano
    creditsMonthly: 10000,
    limits: {
      maxAgents: 10,
      maxChannels: 10,
      maxTeamMembers: 10,
      maxDocumentsPerAgent: 100,
      hasCustomBranding: true,
      hasApiAccess: true,
      hasAutomations: true,
      hasAnalytics: true,
    },
  },
  enterprise: {
    name: 'Enterprise',
    slug: 'enterprise',
    priceMonthly: -1, // custom pricing
    priceYearly: -1,
    creditsMonthly: -1, // unlimited
    limits: {
      maxAgents: -1, // -1 = unlimited
      maxChannels: -1,
      maxTeamMembers: -1,
      maxDocumentsPerAgent: -1,
      hasCustomBranding: true,
      hasApiAccess: true,
      hasAutomations: true,
      hasAnalytics: true,
    },
  },
} as const

export type PlanSlug = keyof typeof PLANS
