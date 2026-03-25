'use client'

import { useState } from 'react'
import {
  Check,
  Loader2,
  AlertTriangle,
  Clock,
  CreditCard,
  Zap,
  Building2,
  Star,
  ShieldAlert,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type Interval = 'monthly' | 'yearly'
type PlanSlug = 'starter' | 'pro'

// ─── Plan definitions ─────────────────────────────────────────────────────────

const PLAN_FEATURES = {
  starter: [
    '3 agentes de IA',
    '3 canais (WhatsApp/Instagram)',
    '2.000 créditos/mês',
    '2 membros da equipe',
    '20 documentos por agente',
    'Automações',
    'Analytics',
    'Suporte por e-mail',
  ],
  pro: [
    '10 agentes de IA',
    '10 canais (WhatsApp/Instagram)',
    '10.000 créditos/mês',
    '10 membros da equipe',
    '100 documentos por agente',
    'Automações avançadas',
    'Analytics completo',
    'Marca personalizada',
    'Acesso à API',
    'Suporte prioritário',
  ],
  enterprise: [
    'Agentes ilimitados',
    'Canais ilimitados',
    'Créditos ilimitados',
    'Equipe ilimitada',
    'Documentos ilimitados',
    'Tudo do Pro',
    'Integração personalizada',
    'SLA garantido',
    'Gerente de conta dedicado',
    'Suporte 24/7',
  ],
}

const PLAN_PRICES = {
  starter: { monthly: 97, yearly: 72.5 },
  pro: { monthly: 297, yearly: 222.5 },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

function getTrialDaysLeft(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null
  const diff = new Date(trialEndsAt).getTime() - Date.now()
  if (diff <= 0) return 0
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: 'Ativo', className: 'bg-emerald-100 text-emerald-700' },
    trialing: { label: 'Trial', className: 'bg-blue-100 text-blue-700' },
    past_due: { label: 'Vencido', className: 'bg-red-100 text-red-700' },
    canceled: { label: 'Cancelado', className: 'bg-zinc-100 text-zinc-600' },
    free: { label: 'Grátis', className: 'bg-zinc-100 text-zinc-600' },
  }
  const { label, className } = map[status] ?? { label: status, className: 'bg-zinc-100 text-zinc-600' }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  slug,
  interval,
  currentPlanSlug,
  subscriptionStatus,
  onSubscribe,
  onManage,
  loadingSlug,
  loadingPortal,
}: {
  slug: 'starter' | 'pro' | 'enterprise'
  interval: Interval
  currentPlanSlug: string | null
  subscriptionStatus: string
  onSubscribe: (slug: PlanSlug, interval: Interval) => void
  onManage: () => void
  loadingSlug: string | null
  loadingPortal: boolean
}) {
  const isEnterprise = slug === 'enterprise'
  const isPro = slug === 'pro'
  const isCurrent = currentPlanSlug === slug
  const hasActiveSub = subscriptionStatus === 'active' || subscriptionStatus === 'trialing'
  const features = PLAN_FEATURES[slug]

  const monthlyPrice = isEnterprise ? null : PLAN_PRICES[slug as 'starter' | 'pro'].monthly
  const displayPrice = isEnterprise
    ? null
    : interval === 'yearly'
    ? PLAN_PRICES[slug as 'starter' | 'pro'].yearly
    : monthlyPrice

  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 transition-shadow ${
        isPro
          ? 'border-indigo-500 shadow-lg shadow-indigo-100 ring-2 ring-indigo-500'
          : 'border-zinc-200 hover:shadow-md'
      }`}
    >
      {isPro && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-0.5 text-xs font-semibold text-white">
            <Star className="h-3 w-3" />
            Mais popular
          </span>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center gap-2">
          {isEnterprise ? (
            <Building2 className="h-5 w-5 text-indigo-600" />
          ) : isPro ? (
            <Zap className="h-5 w-5 text-indigo-600" />
          ) : (
            <CreditCard className="h-5 w-5 text-indigo-600" />
          )}
          <h3 className="text-lg font-bold capitalize">{slug === 'starter' ? 'Starter' : slug === 'pro' ? 'Pro' : 'Enterprise'}</h3>
          {isCurrent && hasActiveSub && (
            <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Plano atual
            </span>
          )}
        </div>

        <div className="mt-3">
          {isEnterprise ? (
            <p className="text-2xl font-bold text-zinc-800">Personalizado</p>
          ) : (
            <div className="flex items-end gap-1">
              <span className="text-3xl font-bold text-zinc-900">{formatCurrency(displayPrice!)}</span>
              <span className="mb-1 text-sm text-zinc-500">/mês</span>
            </div>
          )}
          {!isEnterprise && interval === 'yearly' && (
            <p className="mt-0.5 text-xs text-emerald-600 font-medium">
              Cobrado anualmente — economia de {formatCurrency((monthlyPrice! - displayPrice!) * 12)}/ano
            </p>
          )}
        </div>
      </div>

      <ul className="mb-6 flex-1 space-y-2.5">
        {features.map((feat) => (
          <li key={feat} className="flex items-start gap-2 text-sm text-zinc-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
            {feat}
          </li>
        ))}
      </ul>

      {isEnterprise ? (
        <a
          href="mailto:contato@zapagent.com.br?subject=Enterprise"
          className="flex w-full items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
        >
          Fale conosco
        </a>
      ) : isCurrent && hasActiveSub ? (
        <button
          onClick={onManage}
          disabled={loadingPortal}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-60"
        >
          {loadingPortal && <Loader2 className="h-4 w-4 animate-spin" />}
          Gerenciar assinatura
        </button>
      ) : (
        <button
          onClick={() => onSubscribe(slug as PlanSlug, interval)}
          disabled={loadingSlug !== null || loadingPortal}
          className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 ${
            isPro
              ? 'bg-indigo-600 hover:bg-indigo-700'
              : 'bg-zinc-800 hover:bg-zinc-900'
          }`}
        >
          {loadingSlug === slug && <Loader2 className="h-4 w-4 animate-spin" />}
          Assinar
        </button>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PlansManager({ blocked }: { blocked?: boolean }) {
  const [interval, setInterval] = useState<Interval>('monthly')
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null)
  const [loadingPortal, setLoadingPortal] = useState(false)

  const { data: subscription, isLoading } = trpc.billing.getSubscription.useQuery()

  const createCheckout = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url
    },
    onError: (err) => {
      alert(err.message)
      setLoadingSlug(null)
    },
  })

  const createPortal = trpc.billing.createBillingPortal.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url
    },
    onError: (err) => {
      alert(err.message)
      setLoadingPortal(false)
    },
  })

  function handleSubscribe(planSlug: PlanSlug, planInterval: Interval) {
    setLoadingSlug(planSlug)
    createCheckout.mutate({ planSlug, interval: planInterval })
  }

  function handleManage() {
    setLoadingPortal(true)
    createPortal.mutate()
  }

  const currentPlanSlug = subscription?.plan?.slug ?? 'free'
  const subscriptionStatus = subscription?.subscription_status ?? 'free'
  const trialDaysLeft = getTrialDaysLeft(subscription?.trial_ends_at ?? null)
  const isPastDue = subscriptionStatus === 'past_due'
  const isCanceled = subscriptionStatus === 'canceled'
  const isTrialing = subscriptionStatus === 'trialing' && trialDaysLeft !== null && trialDaysLeft > 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Blocked access banner */}
      {blocked && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold text-red-800">Acesso suspenso</p>
            <p className="mt-0.5 text-sm text-red-700">
              Seu acesso foi suspenso por falta de pagamento. Regularize sua assinatura para continuar usando o White Zap.
            </p>
          </div>
        </div>
      )}

      {/* Past due warning */}
      {isPastDue && !blocked && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="flex-1">
            <p className="font-semibold text-red-800">Pagamento pendente</p>
            <p className="mt-0.5 text-sm text-red-700">Atualize seu método de pagamento para evitar a suspensão do acesso.</p>
          </div>
          <button
            onClick={handleManage}
            disabled={loadingPortal}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {loadingPortal && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Atualizar pagamento
          </button>
        </div>
      )}

      {/* Trial countdown banner */}
      {isTrialing && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <Clock className="h-5 w-5 shrink-0 text-blue-600" />
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Trial ativo —</span>{' '}
            {trialDaysLeft === 0
              ? 'Seu trial expira hoje!'
              : `${trialDaysLeft} ${trialDaysLeft === 1 ? 'dia restante' : 'dias restantes'} no período de teste.`}{' '}
            Assine um plano para continuar após o trial.
          </p>
        </div>
      )}

      {/* Success banner */}
      {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('success') === '1' && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-800">
            Assinatura ativada com sucesso! Bem-vindo ao White Zap.
          </p>
        </div>
      )}

      {/* Canceled info */}
      {isCanceled && (
        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <XCircle className="h-5 w-5 shrink-0 text-zinc-500" />
          <p className="text-sm text-zinc-700">
            Sua assinatura foi cancelada. Assine novamente para reativar o acesso.
          </p>
        </div>
      )}

      {/* Current plan summary */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-bold text-zinc-900">Plano atual</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-sm text-zinc-500">Plano</p>
            <p className="mt-0.5 text-xl font-bold capitalize text-zinc-900">{subscription?.plan?.name ?? 'Free'}</p>
          </div>
          <div>
            <p className="text-sm text-zinc-500">Status</p>
            <div className="mt-1">
              <StatusBadge status={subscriptionStatus} />
            </div>
          </div>
          <div>
            <p className="text-sm text-zinc-500">Créditos disponíveis</p>
            <p className="mt-0.5 text-xl font-bold text-zinc-900">
              {(subscription?.credits_balance ?? 0).toLocaleString('pt-BR')}
            </p>
          </div>
          {subscription?.trial_ends_at && (
            <div>
              <p className="text-sm text-zinc-500">Trial encerra em</p>
              <p className="mt-0.5 text-sm font-medium text-zinc-800">
                {new Date(subscription.trial_ends_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          )}
          {subscription?.stripe_subscription_id && (
            <div className="ml-auto">
              <button
                onClick={handleManage}
                disabled={loadingPortal}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              >
                {loadingPortal && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Gerenciar assinatura
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Interval toggle */}
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-xl font-bold text-zinc-900">Escolha seu plano</h2>
        <div className="mt-2 flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100 p-1">
          <button
            onClick={() => setInterval('monthly')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              interval === 'monthly' ? 'bg-white shadow text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Mensal
          </button>
          <button
            onClick={() => setInterval('yearly')}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition ${
              interval === 'yearly' ? 'bg-white shadow text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Anual
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
              -25%
            </span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {(['starter', 'pro', 'enterprise'] as const).map((slug) => (
          <PlanCard
            key={slug}
            slug={slug}
            interval={interval}
            currentPlanSlug={currentPlanSlug}
            subscriptionStatus={subscriptionStatus}
            onSubscribe={handleSubscribe}
            onManage={handleManage}
            loadingSlug={loadingSlug}
            loadingPortal={loadingPortal}
          />
        ))}
      </div>

      <p className="text-center text-xs text-zinc-400">
        Todos os planos incluem 7 dias de trial gratuito. Cancele a qualquer momento sem multa.
        Preços em BRL.
      </p>
    </div>
  )
}
