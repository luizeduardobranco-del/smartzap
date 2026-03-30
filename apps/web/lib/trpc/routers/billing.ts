import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { router, protectedProcedure } from '../init'
import { asaas } from '@/lib/asaas'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrgId(ctx: { supabase: any; user: { id: string } }) {
  const { data: member } = await ctx.supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', ctx.user.id)
    .single()
  if (!member) throw new TRPCError({ code: 'FORBIDDEN' })
  return member.organization_id as string
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
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

// Asaas plan prices (BRL — not centavos)
const ASAAS_PLAN_PRICES: Record<string, number> = {
  'starter:monthly': 97,
  'starter:yearly': 870, // 72.5 * 12
  'pro:monthly': 297,
  'pro:yearly': 2670, // 222.5 * 12
}

async function getOrCreateAsaasCustomer(
  orgId: string,
  orgName: string,
  userEmail: string | undefined,
): Promise<string> {
  const supabase = getServiceClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('asaas_customer_id, settings')
    .eq('id', orgId)
    .single()

  const fiscal = (org?.settings as any)?.fiscal
  const cpfCnpj: string | undefined = fiscal?.cpfCnpj
  const mobilePhone: string | undefined = fiscal?.mobilePhone
  const cpfDigits = cpfCnpj?.replace(/\D/g, '') ?? ''

  // Customer already exists — patch CPF if available in settings (handles customers created without CPF)
  if (org?.asaas_customer_id) {
    if (cpfDigits.length >= 11) {
      try {
        await asaas('POST', `/customers/${org.asaas_customer_id}`, {
          cpfCnpj: cpfDigits,
          ...(mobilePhone ? { mobilePhone: mobilePhone.replace(/\D/g, '') } : {}),
        })
        console.log('[billing] Asaas customer updated with CPF | customerId:', org.asaas_customer_id)
      } catch (err) {
        // Non-critical: log but continue — payment will fail with clear message if CPF still missing
        console.warn('[billing] Failed to update Asaas customer CPF:', err instanceof Error ? err.message : err)
      }
    }
    return org.asaas_customer_id as string
  }

  if (cpfDigits.length < 11) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'CPF_REQUIRED', // UI redirects to Settings → Organização
    })
  }

  console.log('[billing] creating Asaas customer | orgId:', orgId, '| cpfLength:', cpfDigits.length)

  const customer = await asaas<{ id: string }>('POST', '/customers', {
    name: orgName,
    email: userEmail,
    cpfCnpj: cpfDigits,
    mobilePhone: mobilePhone?.replace(/\D/g, '') || undefined,
    externalReference: orgId,
    notificationDisabled: false,
  })

  await supabase
    .from('organizations')
    .update({ asaas_customer_id: customer.id })
    .eq('id', orgId)

  return customer.id
}

// ─── Router ───────────────────────────────────────────────────────────────────

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
        asaas_subscription_id,
        asaas_customer_id,
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
      asaas_subscription_id: org.asaas_subscription_id as string | null,
      asaas_customer_id: org.asaas_customer_id as string | null,
      plan: (Array.isArray(org.plans) ? org.plans[0] : org.plans) as {
        name: string
        slug: string
        limits: Record<string, unknown>
      } | null,
    }
  }),

  // ── Asaas: create subscription checkout ─────────────────────────────────────
  createAsaasCheckout: protectedProcedure
    .input(z.object({
      planSlug: z.enum(['starter', 'pro']),
      interval: z.enum(['monthly', 'yearly']),
      billingType: z.enum(['CREDIT_CARD', 'PIX']).default('CREDIT_CARD'),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const supabase = getServiceClient()

      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single()

      const orgName = (org?.name as string) ?? 'Organização'
      const userEmail = ctx.user.email ?? undefined

      const customerId = await getOrCreateAsaasCustomer(orgId, orgName, userEmail)

      const priceKey = `${input.planSlug}:${input.interval}`
      const value = ASAAS_PLAN_PRICES[priceKey]
      if (!value) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Plano inválido.' })
      }

      const cycle = input.interval === 'monthly' ? 'MONTHLY' : 'ANNUAL'
      const planLabel = input.planSlug === 'starter' ? 'Starter' : 'Pro'
      const intervalLabel = input.interval === 'monthly' ? 'Mensal' : 'Anual'
      const today = new Date().toISOString().split('T')[0]

      let subscription: { id: string }
      try {
        subscription = await asaas<{ id: string }>('POST', '/subscriptions', {
          customer: customerId,
          billingType: input.billingType,
          value,
          nextDueDate: today,
          cycle,
          description: `Plano ${planLabel} — ${intervalLabel}`,
          externalReference: orgId,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[billing] Asaas subscription creation failed:', msg)
        if (msg.toLowerCase().includes('cpf') || msg.toLowerCase().includes('cnpj')) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'CPF_REQUIRED' })
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro ao criar assinatura: ${msg}` })
      }

      // Get first payment invoiceUrl
      const payments = await asaas<{ data: Array<{ invoiceUrl: string }> }>(
        'GET',
        `/subscriptions/${subscription.id}/payments`
      )

      const invoiceUrl = payments.data?.[0]?.invoiceUrl
      if (!invoiceUrl) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'URL de pagamento não gerada. Tente novamente.',
        })
      }

      return { url: invoiceUrl }
    }),

  // ── Asaas: buy credit package ────────────────────────────────────────────────
  createAsaasCreditCheckout: protectedProcedure
    .input(z.object({
      packageId: z.string().uuid(),
      billingType: z.enum(['CREDIT_CARD', 'PIX']).default('CREDIT_CARD'),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const supabase = getServiceClient()

      const { data: pkg } = await supabase
        .from('credit_packages')
        .select('id, name, credits, bonus_credits, price')
        .eq('id', input.packageId)
        .eq('is_active', true)
        .single()

      if (!pkg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pacote não encontrado.' })

      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single()

      const orgName = (org?.name as string) ?? 'Organização'
      const userEmail = ctx.user.email ?? undefined
      let customerId: string
      try {
        customerId = await getOrCreateAsaasCustomer(orgId, orgName, userEmail)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[billing] getOrCreateAsaasCustomer failed:', msg, '| orgId:', orgId)
        throw err
      }

      const totalCredits = (pkg.credits as number) + ((pkg.bonus_credits as number) ?? 0)
      const value = (pkg.price as number) / 100 // centavos → reais
      const today = new Date().toISOString().split('T')[0]
      const externalRef = `credit:${orgId}:${input.packageId}:${pkg.credits}:${pkg.bonus_credits ?? 0}`

      console.log('[billing] creating Asaas payment | customer:', customerId, '| value:', value, '| pkg:', pkg.name)

      let payment: { id: string; invoiceUrl: string }
      try {
        payment = await asaas<{ id: string; invoiceUrl: string }>('POST', '/payments', {
          customer: customerId,
          billingType: input.billingType,
          value,
          dueDate: today,
          description: `${totalCredits.toLocaleString('pt-BR')} créditos — ${pkg.name}`,
          externalReference: externalRef,
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[billing] Asaas payment creation failed:', msg, '| customer:', customerId, '| value:', value)
        // CPF missing on Asaas side → direct user to settings
        if (msg.toLowerCase().includes('cpf') || msg.toLowerCase().includes('cnpj')) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'CPF_REQUIRED' })
        }
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro ao criar pagamento: ${msg}` })
      }

      if (!payment.invoiceUrl) {
        console.error('[billing] invoiceUrl missing from Asaas response | payment id:', payment.id)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'URL de pagamento não gerada. Tente novamente.',
        })
      }

      return { url: payment.invoiceUrl }
    }),

  // ── Asaas: cancel subscription ───────────────────────────────────────────────
  cancelAsaasSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const orgId = await getOrgId(ctx)
    const supabase = getServiceClient()

    const { data: org } = await supabase
      .from('organizations')
      .select('asaas_subscription_id')
      .eq('id', orgId)
      .single()

    if (!org?.asaas_subscription_id) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Nenhuma assinatura Asaas ativa encontrada.',
      })
    }

    await asaas('DELETE', `/subscriptions/${org.asaas_subscription_id}`)

    await supabase
      .from('organizations')
      .update({ subscription_status: 'canceled', asaas_subscription_id: null })
      .eq('id', orgId)

    return { success: true }
  }),

  // ── Stripe legacy: create checkout session ───────────────────────────────────
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        planSlug: z.enum(['starter', 'pro']),
        interval: z.enum(['monthly', 'yearly']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe()
      const orgId = await getOrgId(ctx)

      const PRICE_ID_MAP: Record<string, string | undefined> = {
        'starter:monthly': process.env.STRIPE_PRICE_STARTER_MONTHLY,
        'starter:yearly': process.env.STRIPE_PRICE_STARTER_YEARLY,
        'pro:monthly': process.env.STRIPE_PRICE_PRO_MONTHLY,
        'pro:yearly': process.env.STRIPE_PRICE_PRO_YEARLY,
      }

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

  // ── Stripe legacy: billing portal ────────────────────────────────────────────
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

  // ── Credit packages (query) ──────────────────────────────────────────────────
  getCreditPackages: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('credit_packages')
      .select('id, name, credits, bonus_credits, price')
      .eq('is_active', true)
      .order('price', { ascending: true })

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return (data ?? []) as {
      id: string
      name: string
      credits: number
      bonus_credits: number
      price: number
    }[]
  }),

  // ── Stripe legacy: buy credits package ──────────────────────────────────────
  buyCreditsPackage: protectedProcedure
    .input(z.object({ packageId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe()
      const orgId = await getOrgId(ctx)

      const { data: pkg } = await ctx.supabase
        .from('credit_packages')
        .select('id, name, credits, bonus_credits, price')
        .eq('id', input.packageId)
        .eq('is_active', true)
        .single()

      if (!pkg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pacote não encontrado.' })

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      const totalCredits = (pkg.credits as number) + ((pkg.bonus_credits as number) ?? 0)

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'brl',
              unit_amount: pkg.price as number,
              product_data: {
                name: pkg.name as string,
                description: `${totalCredits.toLocaleString('pt-BR')} créditos`,
              },
            },
            quantity: 1,
          },
        ],
        success_url: `${appUrl}/credits?credits_success=1`,
        cancel_url: `${appUrl}/credits`,
        metadata: {
          orgId,
          packageId: input.packageId,
          type: 'credit_purchase',
          credits: String(pkg.credits),
          bonus_credits: String((pkg.bonus_credits as number) ?? 0),
        },
      })

      return { url: session.url! }
    }),

  // ── Stripe legacy: cancel subscription ──────────────────────────────────────
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
