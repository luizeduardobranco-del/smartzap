import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import Stripe from 'stripe'
import { router, protectedProcedure } from '../init'

async function getOrgId(ctx: { supabase: any; user: { id: string } }) {
  const { data: member } = await ctx.supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', ctx.user.id)
    .single()
  if (!member) throw new TRPCError({ code: 'FORBIDDEN' })
  return member.organization_id as string
}

function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Stripe não configurado. Contate o suporte.',
    })
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })
}

const PRICE_ID_MAP: Record<string, string | undefined> = {
  'starter:monthly': process.env.STRIPE_PRICE_STARTER_MONTHLY,
  'starter:yearly': process.env.STRIPE_PRICE_STARTER_YEARLY,
  'pro:monthly': process.env.STRIPE_PRICE_PRO_MONTHLY,
  'pro:yearly': process.env.STRIPE_PRICE_PRO_YEARLY,
}

export const billingRouter = router({
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx)

    const { data: org, error } = await ctx.supabase
      .from('organizations')
      .select(`
        plan_id,
        credits_balance,
        subscription_status,
        trial_ends_at,
        stripe_subscription_id,
        stripe_customer_id,
        plans(name, slug, limits)
      `)
      .eq('id', orgId)
      .single()

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

    return {
      plan_id: org.plan_id as string | null,
      credits_balance: (org.credits_balance as number) ?? 0,
      subscription_status: (org.subscription_status as string) ?? 'free',
      trial_ends_at: org.trial_ends_at as string | null,
      stripe_subscription_id: org.stripe_subscription_id as string | null,
      stripe_customer_id: org.stripe_customer_id as string | null,
      plan: (Array.isArray(org.plans) ? org.plans[0] : org.plans) as { name: string; slug: string; limits: Record<string, unknown> } | null,
    }
  }),

  createCheckoutSession: protectedProcedure
    .input(z.object({
      planSlug: z.enum(['starter', 'pro']),
      interval: z.enum(['monthly', 'yearly']),
    }))
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe()
      const orgId = await getOrgId(ctx)

      const priceKey = `${input.planSlug}:${input.interval}`
      const priceId = PRICE_ID_MAP[priceKey]

      if (!priceId) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Stripe não configurado. Contate o suporte.',
        })
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/credits?success=1`,
        cancel_url: `${appUrl}/credits`,
        metadata: { orgId },
        subscription_data: { metadata: { orgId } },
      })

      return { url: session.url! }
    }),

  createBillingPortal: protectedProcedure.mutation(async ({ ctx }) => {
    const stripe = getStripe()
    const orgId = await getOrgId(ctx)

    const { data: org } = await ctx.supabase
      .from('organizations')
      .select('stripe_customer_id')
      .eq('id', orgId)
      .single()

    if (!org?.stripe_customer_id) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Nenhuma assinatura ativa encontrada.',
      })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${appUrl}/credits`,
    })

    return { url: session.url }
  }),

  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const stripe = getStripe()
    const orgId = await getOrgId(ctx)

    const { data: org } = await ctx.supabase
      .from('organizations')
      .select('stripe_subscription_id')
      .eq('id', orgId)
      .single()

    if (!org?.stripe_subscription_id) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Nenhuma assinatura ativa encontrada.',
      })
    }

    await stripe.subscriptions.update(org.stripe_subscription_id, {
      cancel_at_period_end: true,
    })

    return { success: true }
  }),
})
