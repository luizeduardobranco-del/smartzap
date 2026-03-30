import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  // Validate webhook token
  const authToken = request.headers.get('asaas-access-token')
  if (!process.env.ASAAS_WEBHOOK_TOKEN || authToken !== process.env.ASAAS_WEBHOOK_TOKEN) {
    console.error('[webhook/asaas] invalid or missing asaas-access-token')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType: string = body.event
  const payment = body.payment
  const subscription = body.subscription

  const supabase = getSupabase()

  try {
    switch (eventType) {
      // ── Subscription created → store asaas_subscription_id ──────────────────
      case 'SUBSCRIPTION_CREATED': {
        if (!subscription) break

        const orgId = subscription.externalReference as string | undefined
        if (!orgId) {
          console.error('[webhook/asaas] SUBSCRIPTION_CREATED: missing externalReference')
          break
        }

        // Find plan by checking subscription description or just update status
        const { error } = await supabase
          .from('organizations')
          .update({
            asaas_subscription_id: subscription.id,
            subscription_status: 'active',
          })
          .eq('id', orgId)

        if (error) {
          console.error('[webhook/asaas] SUBSCRIPTION_CREATED update error:', error.message)
        } else {
          console.log('[webhook/asaas] SUBSCRIPTION_CREATED: stored sub', subscription.id, 'for org', orgId)
        }
        break
      }

      // ── Payment received → activate + add credits ─────────────────────────
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED': {
        if (!payment) break

        const hasSubscription = !!payment.subscription
        const externalRef: string = payment.externalReference ?? ''

        // Credit package purchase (no subscription, externalRef starts with 'credit:')
        if (!hasSubscription && externalRef.startsWith('credit:')) {
          const parts = externalRef.split(':')
          // format: credit:{orgId}:{pkgId}:{credits}:{bonus}
          const orgId = parts[1]
          const credits = parseInt(parts[3] ?? '0')
          const bonus = parseInt(parts[4] ?? '0')
          const totalCredits = credits + bonus

          if (!orgId || totalCredits <= 0) {
            console.error('[webhook/asaas] credit purchase: invalid externalReference', externalRef)
            break
          }

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
            reference_id: payment.id,
            reference_type: 'asaas_payment',
          })

          console.log('[webhook/asaas] credit purchase: added', totalCredits, 'credits to org', orgId)
          break
        }

        // Subscription payment (renewal or first payment)
        if (hasSubscription) {
          const asaasSubscriptionId: string = payment.subscription

          const { data: org } = await supabase
            .from('organizations')
            .select('id, plan_id, credits_balance, plans(credits_monthly)')
            .eq('asaas_subscription_id', asaasSubscriptionId)
            .single()

          // If org not found by sub ID, try by externalReference (first payment race condition)
          if (!org && externalRef) {
            const { data: orgByRef } = await supabase
              .from('organizations')
              .select('id, plan_id, credits_balance, asaas_subscription_id, plans(credits_monthly)')
              .eq('id', externalRef)
              .single()

            if (orgByRef) {
              // Store the subscription ID if not stored yet
              if (!orgByRef.asaas_subscription_id) {
                await supabase
                  .from('organizations')
                  .update({ asaas_subscription_id: asaasSubscriptionId })
                  .eq('id', externalRef)
              }

              const creditsToAdd: number = (orgByRef.plans as any)?.credits_monthly ?? 0
              const newBalance = ((orgByRef.credits_balance as number) ?? 0) + creditsToAdd

              await supabase
                .from('organizations')
                .update({ subscription_status: 'active', credits_balance: newBalance })
                .eq('id', externalRef)

              if (creditsToAdd > 0) {
                await supabase.from('credit_transactions').insert({
                  organization_id: orgByRef.id,
                  type: 'plan_renewal',
                  amount: creditsToAdd,
                  balance_after: newBalance,
                  description: `Renovação do plano — ${creditsToAdd} créditos`,
                  reference_id: payment.id,
                  reference_type: 'asaas_payment',
                })
              }

              console.log('[webhook/asaas] subscription payment (by ref): org', externalRef)
            }
            break
          }

          if (!org) {
            console.error('[webhook/asaas] PAYMENT_RECEIVED: org not found for sub', asaasSubscriptionId)
            break
          }

          const creditsToAdd: number = (org.plans as any)?.credits_monthly ?? 0
          const newBalance = ((org.credits_balance as number) ?? 0) + creditsToAdd

          await supabase
            .from('organizations')
            .update({ subscription_status: 'active', credits_balance: newBalance })
            .eq('id', org.id)

          if (creditsToAdd > 0) {
            await supabase.from('credit_transactions').insert({
              organization_id: org.id,
              type: 'plan_renewal',
              amount: creditsToAdd,
              balance_after: newBalance,
              description: `Renovação do plano — ${creditsToAdd} créditos`,
              reference_id: payment.id,
              reference_type: 'asaas_payment',
            })
          }

          console.log('[webhook/asaas] subscription payment: added', creditsToAdd, 'credits to org', org.id)
        }
        break
      }

      // ── Payment overdue / failed → set past_due ───────────────────────────
      case 'PAYMENT_OVERDUE':
      case 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED': {
        if (!payment?.subscription) break

        const { error } = await supabase
          .from('organizations')
          .update({ subscription_status: 'past_due' })
          .eq('asaas_subscription_id', payment.subscription)

        if (error) {
          console.error('[webhook/asaas]', eventType, 'update error:', error.message)
        } else {
          console.log('[webhook/asaas]', eventType, ': set past_due for sub', payment.subscription)
        }
        break
      }

      // ── Subscription deleted/inactivated → cancel ─────────────────────────
      case 'SUBSCRIPTION_DELETED':
      case 'SUBSCRIPTION_INACTIVATED': {
        if (!subscription?.id) break

        const { error } = await supabase
          .from('organizations')
          .update({ subscription_status: 'canceled', asaas_subscription_id: null })
          .eq('asaas_subscription_id', subscription.id)

        if (error) {
          console.error('[webhook/asaas]', eventType, 'update error:', error.message)
        } else {
          console.log('[webhook/asaas]', eventType, ': canceled org with sub', subscription.id)
        }
        break
      }

      default:
        console.log('[webhook/asaas] unhandled event:', eventType)
    }
  } catch (err: any) {
    console.error('[webhook/asaas] handler error:', err?.message ?? err)
    return NextResponse.json({ error: 'Internal handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
