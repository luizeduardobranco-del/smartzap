'use client'

import { useState } from 'react'
import { X, Loader2, Ban, CheckCircle, CreditCard, Users, Calendar, Coins, Link, AlertTriangle, ToggleLeft, ToggleRight } from 'lucide-react'

interface Plan {
  id: string
  name: string
  slug: string
}

interface Org {
  id: string
  name: string
  slug: string
  subscription_status: string | null
  credits_balance: number | null
  created_at: string
  trial_ends_at: string | null
  stripe_subscription_id: string | null
  asaas_subscription_id: string | null
  asaas_customer_id: string | null
  plans: Plan | Plan[] | null
  settings?: { enabled_modules?: string[] } | null
}

const ALL_MODULES = [
  { key: 'affiliates', label: 'Programa de Afiliados', description: 'Gerar links de indicação e acompanhar comissões.' },
]

interface Props {
  org: Org
  allPlans: Plan[]
  memberCount: number
}

const statusLabels: Record<string, string> = {
  active: 'Ativo',
  trialing: 'Em trial',
  past_due: 'Pagamento atrasado',
  canceled: 'Cancelado',
  free: 'Free',
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  trialing: 'bg-amber-100 text-amber-700',
  past_due: 'bg-red-100 text-red-700',
  canceled: 'bg-gray-100 text-gray-600',
  free: 'bg-blue-100 text-blue-700',
}

export function OrgDetailDrawerButton({ org, allPlans, memberCount }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
      >
        Detalhes
      </button>
      {open && (
        <OrgDetailDrawer
          org={org}
          allPlans={allPlans}
          memberCount={memberCount}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function OrgDetailDrawer({
  org,
  allPlans,
  memberCount,
  onClose,
}: Props & { onClose: () => void }) {
  const currentPlan = Array.isArray(org.plans) ? org.plans[0] : org.plans
  const status = org.subscription_status ?? 'free'

  const [selectedPlanId, setSelectedPlanId] = useState(currentPlan?.id ?? '')
  const [creditsToAdd, setCreditsToAdd] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [enabledModules, setEnabledModules] = useState<string[]>(
    org.settings?.enabled_modules ?? []
  )

  async function patchOrg(updates: Record<string, any>) {
    const res = await fetch('/api/admin/orgs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: org.id, ...updates }),
    })
    return res.ok
  }

  async function handleChangePlan() {
    if (!selectedPlanId) return
    setLoading('plan')
    const ok = await patchOrg({ plan_id: selectedPlanId })
    setLoading(null)
    setMessage(ok ? { type: 'success', text: 'Plano atualizado!' } : { type: 'error', text: 'Erro ao atualizar plano.' })
    if (ok) setTimeout(() => window.location.reload(), 1000)
  }

  async function handleAddCredits() {
    const amount = parseInt(creditsToAdd)
    if (!amount || amount <= 0) return
    setLoading('credits')
    const res = await fetch('/api/admin/credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: org.id, amount }),
    })
    setLoading(null)
    if (res.ok) {
      setMessage({ type: 'success', text: `${amount} créditos adicionados!` })
      setCreditsToAdd('')
      setTimeout(() => window.location.reload(), 1000)
    } else {
      setMessage({ type: 'error', text: 'Erro ao adicionar créditos.' })
    }
  }

  async function handleToggleModule(moduleKey: string) {
    const isEnabled = enabledModules.includes(moduleKey)
    const next = isEnabled
      ? enabledModules.filter((m) => m !== moduleKey)
      : [...enabledModules, moduleKey]
    setEnabledModules(next)
    setLoading(`module_${moduleKey}`)
    const currentSettings = org.settings ?? {}
    const ok = await patchOrg({ settings: { ...currentSettings, enabled_modules: next } })
    setLoading(null)
    if (!ok) {
      setEnabledModules(enabledModules) // revert
      setMessage({ type: 'error', text: 'Erro ao atualizar módulo.' })
    }
  }

  async function handleToggleBlock() {
    const isCurrentlyBlocked = status === 'canceled'
    setLoading('block')
    const ok = await patchOrg({ subscription_status: isCurrentlyBlocked ? 'active' : 'canceled' })
    setLoading(null)
    setMessage(
      ok
        ? { type: 'success', text: isCurrentlyBlocked ? 'Organização desbloqueada!' : 'Organização bloqueada!' }
        : { type: 'error', text: 'Erro ao alterar status.' }
    )
    if (ok) setTimeout(() => window.location.reload(), 1000)
  }

  async function handleCancelAsaas() {
    if (!org.asaas_subscription_id) return
    setLoading('asaas_cancel')
    const res = await fetch('/api/admin/asaas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: org.id, asaasSubscriptionId: org.asaas_subscription_id }),
    })
    setLoading(null)
    setShowCancelConfirm(false)
    if (res.ok) {
      setMessage({ type: 'success', text: 'Assinatura Asaas cancelada!' })
      setTimeout(() => window.location.reload(), 1200)
    } else {
      const data = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: data?.error ?? 'Erro ao cancelar assinatura Asaas.' })
    }
  }

  const isBlocked = status === 'canceled'

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-semibold text-lg">{org.name}</h2>
            <p className="text-xs text-muted-foreground">/{org.slug}</p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status & info */}
          <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[status] ?? statusColors.free}`}>
                {statusLabels[status] ?? status}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" />
                Plano atual
              </span>
              <span className="text-sm font-medium">{currentPlan?.name ?? 'Free'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5" />
                Créditos
              </span>
              <span className="text-sm font-bold">{(org.credits_balance ?? 0).toLocaleString('pt-BR')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Membros
              </span>
              <span className="text-sm">{memberCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Cadastro
              </span>
              <span className="text-sm">{new Date(org.created_at).toLocaleDateString('pt-BR')}</span>
            </div>
            {org.trial_ends_at && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Trial expira</span>
                <span className="text-sm">{new Date(org.trial_ends_at).toLocaleDateString('pt-BR')}</span>
              </div>
            )}
          </div>

          {/* Asaas subscription info */}
          {(org.asaas_subscription_id || org.asaas_customer_id) && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Link className="h-3.5 w-3.5 text-indigo-600" />
                Asaas
              </p>
              {org.asaas_customer_id && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Customer ID</span>
                  <span className="text-xs font-mono text-zinc-700">{org.asaas_customer_id}</span>
                </div>
              )}
              {org.asaas_subscription_id && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Subscription ID</span>
                  <span className="text-xs font-mono text-zinc-700">{org.asaas_subscription_id}</span>
                </div>
              )}
              {org.asaas_subscription_id && (
                <>
                  {showCancelConfirm ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
                      <p className="text-xs font-medium text-red-800 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Confirmar cancelamento?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowCancelConfirm(false)}
                          disabled={loading === 'asaas_cancel'}
                          className="flex-1 rounded border px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
                        >
                          Manter
                        </button>
                        <button
                          onClick={handleCancelAsaas}
                          disabled={loading === 'asaas_cancel'}
                          className="flex flex-1 items-center justify-center gap-1 rounded bg-red-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {loading === 'asaas_cancel' && <Loader2 className="h-3 w-3 animate-spin" />}
                          Cancelar assinatura
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Cancelar assinatura Asaas
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Change plan */}
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <p className="text-sm font-semibold">Alterar plano</p>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Selecione um plano</option>
              {allPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleChangePlan}
              disabled={!!loading || !selectedPlanId}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {loading === 'plan' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar plano
            </button>
          </div>

          {/* Add credits */}
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <p className="text-sm font-semibold">Adicionar créditos</p>
            <div className="flex gap-2">
              <input
                type="number"
                value={creditsToAdd}
                onChange={(e) => setCreditsToAdd(e.target.value)}
                placeholder="Quantidade"
                min="1"
                className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={handleAddCredits}
                disabled={!!loading || !creditsToAdd}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {loading === 'credits' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Adicionar
              </button>
            </div>
          </div>

          {/* Modules */}
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <p className="text-sm font-semibold">Módulos</p>
            <p className="text-xs text-muted-foreground">Habilite funcionalidades extras por organização.</p>
            <div className="space-y-2">
              {ALL_MODULES.map((mod) => {
                const isOn = enabledModules.includes(mod.key)
                const isLoading = loading === `module_${mod.key}`
                return (
                  <div key={mod.key} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{mod.label}</p>
                      <p className="text-xs text-muted-foreground">{mod.description}</p>
                    </div>
                    <button
                      onClick={() => handleToggleModule(mod.key)}
                      disabled={isLoading}
                      className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        isOn ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      } disabled:opacity-50`}
                    >
                      {isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : isOn ? (
                        <ToggleRight className="h-3.5 w-3.5" />
                      ) : (
                        <ToggleLeft className="h-3.5 w-3.5" />
                      )}
                      {isOn ? 'Ativo' : 'Inativo'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Block/unblock */}
          <div className="rounded-xl border bg-white p-4 space-y-3">
            <p className="text-sm font-semibold">Controle de acesso</p>
            <p className="text-xs text-muted-foreground">
              {isBlocked
                ? 'Esta organização está bloqueada. Reativar devolve o acesso ao sistema.'
                : 'Bloquear cancela o acesso desta organização ao sistema imediatamente.'}
            </p>
            <button
              onClick={handleToggleBlock}
              disabled={!!loading}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                isBlocked
                  ? 'border-green-200 text-green-700 hover:bg-green-50'
                  : 'border-red-200 text-red-600 hover:bg-red-50'
              }`}
            >
              {loading === 'block' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isBlocked ? (
                <CheckCircle className="h-3.5 w-3.5" />
              ) : (
                <Ban className="h-3.5 w-3.5" />
              )}
              {isBlocked ? 'Reativar organização' : 'Bloquear organização'}
            </button>
          </div>

          {/* Feedback */}
          {message && (
            <div
              className={`rounded-lg px-4 py-3 text-sm font-medium ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
