import type { PlanSlug } from '../constants/plans'

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'

export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface Organization {
  id: string
  name: string
  slug: string
  planSlug: PlanSlug
  creditsBalance: number
  creditsUsed: number
  subscriptionStatus: SubscriptionStatus
  trialEndsAt: Date | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  createdAt: Date
}

export interface OrganizationMember {
  id: string
  organizationId: string
  userId: string
  role: MemberRole
  joinedAt: Date
}
