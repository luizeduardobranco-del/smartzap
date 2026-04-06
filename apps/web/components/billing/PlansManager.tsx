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
  Plus,
  Coins,
  X,
  ShieldCheck,
  QrCode,
  Tag,
  ChevronDown,
} from 'lucide-react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { PendingPayments } from './PendingPayments'

// ─── Types ────────────────────────────────────────────────────────────────────

type Interval = 'monthly' | 'yearly'
type PlanSlug = 'starter' | 'pro'
type BillingType = 'CREDIT_CARD' | 'PIX'

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


// ─── Cancel Confirmation Modal ────────────────────────────────────────────────

function CancelModal({
  onConfirm,
  onClose,
  loading,
}: {
  onConfirm: () => void
  onClose: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative mx-4 w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded p-1 hover:bg-zinc-100"
        >
          <X className="h-4 w-4 text-zinc-500" />
        </button>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-6 w-6 text-red-600" />
          </div>
          <div>
            <p className="text-base font-bold text-zinc-900">Cancelar assinatura?</p>
            <p className="mt-1.5 text-sm text-zinc-600">
              Sua assinatura será cancelada imediatamente. Você perderá acesso aos recursos do plano.
            </p>
          </div>
          <div className="flex w-full gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            >
              Manter plano
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  slug,
  interval,
  currentPlanSlug,
  subscriptionStatus,
  hasAsaasSub,
  hasStripeSub,
  onSubscribe,
  onManage,
  loadingSlug,
  loadingPortal,
  appliedCoupon,
}: {
  slug: 'starter' | 'pro' | 'enterprise'
  interval: Interval
  currentPlanSlug: string | null
  subscriptionStatus: string
  hasAsaasSub: boolean
  hasStripeSub: boolean
  onSubscribe: (slug: PlanSlug, interval: Interval, billingType: BillingType) => void
  onManage: () => void
  loadingSlug: string | null
  loadingPortal: boolean
  appliedCoupon: AppliedCoupon | null
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

  const manageLabel = hasAsaasSub ? 'Cancelar assinatura' : 'Gerenciar assinatura'

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
          <h3 className="text-lg font-bold capitalize">
            {slug === 'starter' ? 'Starter' : slug === 'pro' ? 'Pro' : 'Enterprise'}
          </h3>
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
            <>
              {appliedCoupon ? (
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-indigo-600">
                    {formatCurrency(calcDiscount(displayPrice!, appliedCoupon))}
                  </span>
                  <span className="mb-1 text-sm text-zinc-400 line-through">{formatCurrency(displayPrice!)}</span>
                  <span className="mb-1 text-sm text-zinc-500">/mês</span>
                </div>
              ) : (
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-bold text-zinc-900">{formatCurrency(displayPrice!)}</span>
                  <span className="mb-1 text-sm text-zinc-500">/mês</span>
                </div>
              )}
            </>
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
          className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
            hasAsaasSub
              ? 'border-red-200 bg-white text-red-600 hover:bg-red-50'
              : 'border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50'
          }`}
        >
          {loadingPortal && <Loader2 className="h-4 w-4 animate-spin" />}
          {manageLabel}
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onSubscribe(slug as PlanSlug, interval, 'CREDIT_CARD')}
            disabled={loadingSlug !== null || loadingPortal}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60 ${
              isPro ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-zinc-800 hover:bg-zinc-900'
            }`}
          >
            {loadingSlug === `${slug}:CREDIT_CARD` ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Cartão de crédito
          </button>
          <button
            onClick={() => onSubscribe(slug as PlanSlug, interval, 'PIX')}
            disabled={loadingSlug !== null || loadingPortal}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
          >
            {loadingSlug === `${slug}:PIX` ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <QrCode className="h-4 w-4" />
            )}
            PIX
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type AppliedCoupon = { id: string; code: string; type: 'percentage' | 'fixed'; value: number; description?: string }

function calcDiscount(price: number, coupon: AppliedCoupon): number {
  if (coupon.type === 'percentage') return Math.max(0, price * (1 - coupon.value / 100))
  return Math.max(0, price - coupon.value)
}

export function PlansManager({ blocked }: { blocked?: boolean }) {
  const [interval, setInterval] = useState<Interval>('monthly')
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null)
  const [loadingPortal, setLoadingPortal] = useState(false)
  const [loadingPackageId, setLoadingPackageId] = useState<string | null>(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelSuccess, setCancelSuccess] = useState(false)
  const [showCpfRequired, setShowCpfRequired] = useState(false)

  // Coupon state
  const [showCouponInput, setShowCouponInput] = useState(false)
  const [couponInput, setCouponInput] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null)
  const [couponLoading, setCouponLoading] = useState(false)
  const [couponError, setCouponError] = useState<string | null>(null)

  const { data: subscription, isLoading, refetch } = trpc.billing.getSubscription.useQuery()
  const { data: creditPackages = [] } = trpc.billing.getCreditPackages.useQuery()
  const utils = trpc.useUtils()

  // ── Asaas (primary) ────────────────────────────────────────────────────────
  const createAsaasCheckout = trpc.billing.createAsaasCheckout.useMutation({
    onSuccess: ({ url }) => {
      setLoadingSlug(null)
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    onError: (err) => {
      setLoadingSlug(null)
      if (err.message === 'CPF_REQUIRED') { setShowCpfRequired(true) } else { alert(`Erro: ${err.message}`) }
    },
  })

  const createAsaasCreditCheckout = trpc.billing.createAsaasCreditCheckout.useMutation({
    onSuccess: ({ url }) => {
      setLoadingPackageId(null)
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    onError: (err) => {
      setLoadingPackageId(null)
      if (err.message === 'CPF_REQUIRED') { setShowCpfRequired(true) } else { alert(err.message) }
    },
  })

  const cancelAsaasSub = trpc.billing.cancelAsaasSubscription.useMutation({
    onSuccess: () => { setShowCancelModal(false); setLoadingPortal(false); setCancelSuccess(true); refetch() },
    onError: (err) => { alert(err.message); setLoadingPortal(false) },
  })

  const createStripPortal = trpc.billing.createBillingPortal.useMutation({
    onSuccess: ({ url }) => { window.location.href = url },
    onError: (err) => { alert(err.message); setLoadingPortal(false) },
  })

  async function handleApplyCoupon() {
    const code = couponInput.trim()
    if (!code) return
    setCouponLoading(true)
    setCouponError(null)
    try {
      const result = await utils.coupons.validate.fetch({ code, applicableTo: 'all' })
      if (result.valid && result.coupon) {
        setAppliedCoupon(result.coupon as AppliedCoupon)
        setCouponError(null)
      } else {
        setAppliedCoupon(null)
        setCouponError((result as any).reason ?? 'Cupom inválido')
      }
    } catch {
      setAppliedCoupon(null)
      setCouponError('Erro ao validar cupom. Tente novamente.')
    } finally {
      setCouponLoading(false)
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null)
    setCouponInput('')
    setCouponError(null)
    setShowCouponInput(false)
  }

  function handleSubscribe(planSlug: PlanSlug, planInterval: Interval, billingType: BillingType) {
    setShowCpfRequired(false)
    setLoadingSlug(`${planSlug}:${billingType}`)
    createAsaasCheckout.mutate({ planSlug, interval: planInterval, billingType, couponCode: appliedCoupon?.code })
  }

  function handleManage() {
    if (subscription?.asaas_subscription_id) { setShowCancelModal(true); return }
    if (subscription?.stripe_subscription_id) { setLoadingPortal(true); createStripPortal.mutate() }
  }

  function handleConfirmCancel() {
    setLoadingPortal(true)
    cancelAsaasSub.mutate()
  }

  function handleBuyCredits(packageId: string, billingType: BillingType) {
    setShowCpfRequired(false)
    setLoadingPackageId(`${packageId}:${billingType}`)
    createAsaasCreditCheckout.mutate({ packageId, billingType, couponCode: appliedCoupon?.code })
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const currentPlanSlug = subscription?.plan?.slug ?? 'free'
  const subscriptionStatus = subscription?.subscription_status ?? 'free'
  const trialDaysLeft = getTrialDaysLeft(subscription?.trial_ends_at ?? null)
  const isPastDue = subscriptionStatus === 'past_due'
  const isCanceled = subscriptionStatus === 'canceled'
  const isTrialing = subscriptionStatus === 'trialing' && trialDaysLeft !== null && trialDaysLeft > 0
  const hasAsaasSub = !!subscription?.asaas_subscription_id
  const hasStripeSub = !!subscription?.stripe_subscription_id
  const hasAnySub = hasAsaasSub || hasStripeSub

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* CPF required banner */}
      {showCpfRequired && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900">CPF ou CNPJ necessário</p>
            <p className="mt-0.5 text-sm text-amber-800">
              Cadastre seu CPF ou CNPJ antes de continuar. Acesse{' '}
              <Link href="/settings" className="font-semibold underline underline-offset-2 hover:opacity-80">
                Configurações → Organização
              </Link>{' '}
              e preencha os dados fiscais. Após salvar, volte aqui e tente novamente.
            </p>
          </div>
          <button onClick={() => setShowCpfRequired(false)} className="rounded p-1 hover:bg-amber-100">
            <X className="h-4 w-4 text-amber-600" />
          </button>
        </div>
      )}

      {/* Cancel modal */}
      {showCancelModal && (
        <CancelModal
          onConfirm={handleConfirmCancel}
          onClose={() => setShowCancelModal(false)}
          loading={loadingPortal}
        />
      )}

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
            <p className="mt-0.5 text-sm text-red-700">
              Seu pagamento está em atraso. Acesse o link de pagamento enviado por e-mail para regularizar sua situação.
            </p>
          </div>
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

      {/* Subscription success banner */}
      {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('success') === '1' && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-800">
            Assinatura ativada com sucesso! Bem-vindo ao White Zap.
          </p>
        </div>
      )}

      {/* Cancel success banner */}
      {cancelSuccess && (
        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-zinc-500" />
          <p className="text-sm font-medium text-zinc-700">Assinatura cancelada com sucesso.</p>
        </div>
      )}

      {/* Canceled info */}
      {isCanceled && !cancelSuccess && (
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
            <p className="mt-0.5 text-xl font-bold capitalize text-zinc-900">
              {subscription?.plan?.name ?? 'Free'}
            </p>
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
          {hasAnySub && (
            <div className="ml-auto">
              <button
                onClick={handleManage}
                disabled={loadingPortal}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
                  hasAsaasSub
                    ? 'border-red-200 bg-white text-red-600 hover:bg-red-50'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                {loadingPortal && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {hasAsaasSub ? 'Cancelar assinatura' : 'Gerenciar assinatura'}
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

      {/* Coupon input */}
      <div className="flex flex-col items-center gap-2">
        {appliedCoupon ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm">
            <Tag className="h-4 w-4 text-emerald-600" />
            <span className="font-semibold text-emerald-800">{appliedCoupon.code}</span>
            <span className="text-emerald-700">
              — {appliedCoupon.type === 'percentage' ? `${appliedCoupon.value}% de desconto` : `R$ ${appliedCoupon.value} de desconto`}
            </span>
            <button onClick={handleRemoveCoupon} className="ml-1 rounded p-0.5 hover:bg-emerald-100">
              <X className="h-3.5 w-3.5 text-emerald-600" />
            </button>
          </div>
        ) : showCouponInput ? (
          <div className="flex w-full max-w-sm flex-col gap-1.5">
            <div className="flex gap-2">
              <input
                value={couponInput}
                onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                placeholder="CÓDIGO DO CUPOM"
                className="flex-1 rounded-xl border px-3 py-2 text-sm font-mono uppercase tracking-wider outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <button
                onClick={handleApplyCoupon}
                disabled={couponLoading || !couponInput.trim()}
                className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {couponLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Aplicar'}
              </button>
              <button onClick={() => { setShowCouponInput(false); setCouponError(null) }} className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50">
                <X className="h-4 w-4 text-zinc-500" />
              </button>
            </div>
            {couponError && <p className="text-xs text-red-600">{couponError}</p>}
          </div>
        ) : (
          <button
            onClick={() => setShowCouponInput(true)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-indigo-600 transition-colors"
          >
            <Tag className="h-3.5 w-3.5" />
            Tem um cupom de desconto?
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
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
            hasAsaasSub={hasAsaasSub}
            hasStripeSub={hasStripeSub}
            onSubscribe={handleSubscribe}
            onManage={handleManage}
            loadingSlug={loadingSlug}
            loadingPortal={loadingPortal}
            appliedCoupon={appliedCoupon}
          />
        ))}
      </div>

      <p className="text-center text-xs text-zinc-400">
        Aceita PIX e cartão de crédito. Cancele a qualquer momento sem multa. Preços em BRL.
      </p>

      {/* Pending payments */}
      <PendingPayments />

      {/* Credit packages */}
      {creditPackages.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="text-lg font-bold text-zinc-900">Comprar créditos adicionais</h2>
              <p className="text-sm text-zinc-500">
                Adquira créditos extras via PIX ou cartão de crédito. Sem renovação automática.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {creditPackages.map((pkg) => {
              const total = pkg.credits + (pkg.bonus_credits ?? 0)
              const priceReais = (pkg.price / 100).toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
                minimumFractionDigits: 0,
              })
              const isLoadingCard = loadingPackageId === `${pkg.id}:CREDIT_CARD`
              const isLoadingPix = loadingPackageId === `${pkg.id}:PIX`
              const anyLoading = loadingPackageId !== null

              return (
                <div
                  key={pkg.id}
                  className="flex flex-col rounded-xl border border-zinc-200 p-4 hover:border-indigo-300 hover:shadow-sm transition-all"
                >
                  <p className="text-sm font-semibold text-zinc-800">{pkg.name}</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-900">
                    {pkg.credits.toLocaleString('pt-BR')}
                    <span className="text-sm font-normal text-zinc-500"> créditos</span>
                  </p>
                  {(pkg.bonus_credits ?? 0) > 0 && (
                    <p className="mt-0.5 text-xs font-medium text-emerald-600">
                      + {pkg.bonus_credits.toLocaleString('pt-BR')} bônus = {total.toLocaleString('pt-BR')} total
                    </p>
                  )}
                  <p className="mt-3 text-lg font-bold text-indigo-600">{priceReais}</p>
                  <div className="mt-3 flex flex-col gap-2">
                    <button
                      onClick={() => handleBuyCredits(pkg.id, 'CREDIT_CARD')}
                      disabled={anyLoading}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                    >
                      {isLoadingCard ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CreditCard className="h-3.5 w-3.5" />
                      )}
                      Cartão
                    </button>
                    <button
                      onClick={() => handleBuyCredits(pkg.id, 'PIX')}
                      disabled={anyLoading}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 transition-colors"
                    >
                      {isLoadingPix ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <QrCode className="h-3.5 w-3.5" />
                      )}
                      PIX
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-zinc-400">
            Créditos adicionados automaticamente após confirmação do pagamento.
          </p>
        </div>
      )}

      {/* Credits purchased success banner */}
      {typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('credits_success') === '1' && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm font-medium text-emerald-800">
              Créditos adicionados com sucesso! O saldo será atualizado em instantes.
            </p>
          </div>
        )}
    </div>
  )
}
