import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getStripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature or webhook secret' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    console.error('[webhook/stripe] signature verification failed:', err?.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = getSupabase()
  const stripe = getStripe()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orgId = session.metadata?.orgId
        if (!orgId) {
          console.error('[webhook/stripe] checkout.session.completed: missing orgId in metadata')
          break
        }

        // ── Credit package purchase (one-time payment) ──
        if (session.mode === 'payment' && session.metadata?.type === 'credit_purchase') {
          const credits = parseInt(session.metadata.credits ?? '0')
          const bonusCredits = parseInt(session.metadata.bonus_credits ?? '0')
          const totalCredits = credits + bonusCredits

          const { data: org } = await supabase
            .from('organizations')
            .select('credits_balance')
            .eq('id', orgId)
            .single()

          const newBalance = ((org?.credits_balance as number) ?? 0) + totalCredits

          await supabase
            .from('organizations')
            .update({ credits_balance: newBalance })
            .eq('id', orgId)

          await supabase.from('credit_transactions').insert({
            organization_id: orgId,
            type: 'purchase',
            amount: totalCredits,
            balance_after: newBalance,
            description: `Compra de ${totalCredits.toLocaleString('pt-BR')} créditos`,
            reference_id: session.id,
            reference_type: 'stripe_checkout',
          })

          console.log('[webhook/stripe] credit_purchase: added', totalCredits, 'credits to org', orgId)
          break
        }

        // ── Subscription checkout ──
        const subscriptionId = session.subscription as string
        const customerId = session.customer as string

        // Retrieve the subscription to get the price ID
        let priceId: string | null = null
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          priceId = subscription.items.data[0]?.price?.id ?? null
        }

        // Find plan by stripe_price_id
        let planId: string | null = null
        if (priceId) {
          const { data: planRow } = await supabase
            .from('plans')
            .select('id')
            .or(`stripe_price_monthly.eq.${priceId},stripe_price_yearly.eq.${priceId}`)
            .single()
          planId = planRow?.id ?? null
        }

        const updatePayload: Record<string, unknown> = {
          subscription_status: 'active',
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: customerId,
        }
        if (planId) updatePayload.plan_id = planId

        const { error } = await supabase
          .from('organizations')
          .update(updatePayload)
          .eq('id', orgId)

        if (error) {
          console.error('[webhook/stripe] checkout.session.completed update error:', error.message)
        } else {
          console.log('[webhook/stripe] checkout.session.completed: org updated', orgId)
        }
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        const { data: org } = await supabase
          .from('organizations')
          .select('id, plan_id, plans(credits_monthly)')
          .eq('stripe_customer_id', customerId)
          .single()

        if (!org) {
          console.error('[webhook/stripe] invoice.paid: org not found for customer', customerId)
          break
        }

        const creditsToAdd: number = (org.plans as any)?.credits_monthly ?? 0

        await supabase
          .from('organizations')
          .update({ subscription_status: 'active' })
          .eq('id', org.id)

        if (creditsToAdd > 0) {
          await supabase.from('credit_transactions').insert({
            organization_id: org.id,
            type: 'plan_renewal',
            amount: creditsToAdd,
            description: `Renovação do plano — ${creditsToAdd} créditos`,
          })
        }

        console.log('[webhook/stripe] invoice.paid: org updated', org.id)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        const { error } = await supabase
          .from('organizations')
          .update({ subscription_status: 'past_due' })
          .eq('stripe_customer_id', customerId)

        if (error) {
          console.error('[webhook/stripe] invoice.payment_failed update error:', error.message)
        } else {
          console.log('[webhook/stripe] invoice.payment_failed: status set to past_due for customer', customerId)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        const { error } = await supabase
          .from('organizations')
          .update({ subscription_status: 'canceled', stripe_subscription_id: null })
          .eq('stripe_customer_id', customerId)

        if (error) {
          console.error('[webhook/stripe] customer.subscription.deleted update error:', error.message)
        } else {
          console.log('[webhook/stripe] customer.subscription.deleted: status set to canceled for customer', customerId)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        let mappedStatus = subscription.status
        // Stripe statuses: active, past_due, canceled, unpaid, trialing, etc.
        const statusMap: Record<string, string> = {
          active: 'active',
          trialing: 'trialing',
          past_due: 'past_due',
          canceled: 'canceled',
          unpaid: 'past_due',
          incomplete: 'past_due',
          incomplete_expired: 'canceled',
          paused: 'past_due',
        }
        const normalizedStatus = statusMap[mappedStatus] ?? mappedStatus

        // Also sync price/plan if changed
        const priceId = subscription.items.data[0]?.price?.id ?? null
        let planId: string | null = null
        if (priceId) {
          const { data: planRow } = await supabase
            .from('plans')
            .select('id')
            .or(`stripe_price_monthly.eq.${priceId},stripe_price_yearly.eq.${priceId}`)
            .single()
          planId = planRow?.id ?? null
        }

        const updatePayload: Record<string, unknown> = {
          subscription_status: normalizedStatus,
          stripe_subscription_id: subscription.id,
        }
        if (planId) updatePayload.plan_id = planId

        const { error } = await supabase
          .from('organizations')
          .update(updatePayload)
          .eq('stripe_customer_id', customerId)

        if (error) {
          console.error('[webhook/stripe] customer.subscription.updated update error:', error.message)
        } else {
          console.log('[webhook/stripe] customer.subscription.updated:', normalizedStatus, 'for customer', customerId)
        }
        break
      }

      default:
        console.log('[webhook/stripe] unhandled event type:', event.type)
    }
  } catch (err: any) {
    console.error('[webhook/stripe] handler error:', err?.message ?? err)
    return NextResponse.json({ error: 'Internal handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
