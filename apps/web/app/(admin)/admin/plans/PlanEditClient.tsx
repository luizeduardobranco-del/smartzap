'use client'

import { useState } from 'react'
import { Loader2, Pencil, X, Check, ToggleLeft, ToggleRight } from 'lucide-react'

interface Plan {
  id: string
  name: string
  slug: string
  price_monthly: number
  price_yearly: number
  credits_monthly: number
  is_active: boolean
  limits: {
    // Limites numéricos
    maxAgents?: number
    maxChannels?: number
    maxTeamMembers?: number
    maxDocumentsPerAgent?: number
    // Módulos
    hasAutomations?: boolean
    hasAnalytics?: boolean
    hasCrm?: boolean
    hasCampaigns?: boolean
    hasKnowledgeBase?: boolean
    // IA & Mídia
    hasAudioTranscription?: boolean
    hasImageVision?: boolean
    hasGoogleMapsSearch?: boolean
    // Avançado
    hasCustomBranding?: boolean
    hasApiAccess?: boolean
    // Cobrança
    no_billing_block?: boolean
  }
}

interface Props {
  plan: Plan
}

type LimitsState = {
  maxAgents: string
  maxChannels: string
  maxTeamMembers: string
  maxDocumentsPerAgent: string
  hasAutomations: boolean
  hasAnalytics: boolean
  hasCrm: boolean
  hasCampaigns: boolean
  hasKnowledgeBase: boolean
  hasAudioTranscription: boolean
  hasImageVision: boolean
  hasGoogleMapsSearch: boolean
  hasCustomBranding: boolean
  hasApiAccess: boolean
  no_billing_block: boolean
}

const FEATURE_GROUPS: { label: string; features: { key: keyof LimitsState; label: string; description: string }[] }[] = [
  {
    label: 'Módulos',
    features: [
      { key: 'hasAutomations', label: 'Automações', description: 'Gatilhos e ações automáticas' },
      { key: 'hasAnalytics', label: 'Analytics', description: 'Painel de métricas e uso' },
      { key: 'hasCrm', label: 'CRM Kanban', description: 'Gestão de pipeline de vendas' },
      { key: 'hasCampaigns', label: 'Campanhas', description: 'Disparo de mensagens em massa' },
      { key: 'hasKnowledgeBase', label: 'Base de conhecimento', description: 'Texto, FAQ, URL e imagens de produtos' },
    ],
  },
  {
    label: 'IA & Mídia',
    features: [
      { key: 'hasAudioTranscription', label: 'Transcrição de áudio', description: 'Leitura de mensagens de voz com Whisper (3 créditos)' },
      { key: 'hasImageVision', label: 'Visão de imagem', description: 'Leitura de fotos e documentos com GPT-4o (10 créditos)' },
      { key: 'hasGoogleMapsSearch', label: 'Extração de leads — Google Maps', description: 'Busca e importação de leads pelo Maps (25 créditos/busca)' },
    ],
  },
  {
    label: 'Avançado',
    features: [
      { key: 'hasCustomBranding', label: 'Marca personalizada', description: 'Logo e cores da organização' },
      { key: 'hasApiAccess', label: 'Acesso à API', description: 'Integração via API REST' },
    ],
  },
  {
    label: 'Cobrança',
    features: [
      { key: 'no_billing_block', label: 'Isentar bloqueio por inadimplência', description: 'Planos de permuta/parceria — não bloqueia acesso mesmo sem pagamento' },
    ],
  },
]

export function PlanEditClient({ plan }: Props) {
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)

  const [name, setName] = useState(plan.name)
  const [priceMonthly, setPriceMonthly] = useState((plan.price_monthly / 100).toFixed(2))
  const [priceYearly, setPriceYearly] = useState((plan.price_yearly / 100).toFixed(2))
  const [credits, setCredits] = useState(String(plan.credits_monthly))
  const [limits, setLimits] = useState<LimitsState>({
    maxAgents: String(plan.limits?.maxAgents ?? ''),
    maxChannels: String(plan.limits?.maxChannels ?? ''),
    maxTeamMembers: String(plan.limits?.maxTeamMembers ?? ''),
    maxDocumentsPerAgent: String(plan.limits?.maxDocumentsPerAgent ?? ''),
    hasAutomations: plan.limits?.hasAutomations ?? false,
    hasAnalytics: plan.limits?.hasAnalytics ?? false,
    hasCrm: plan.limits?.hasCrm ?? false,
    hasCampaigns: plan.limits?.hasCampaigns ?? false,
    hasKnowledgeBase: plan.limits?.hasKnowledgeBase ?? false,
    hasAudioTranscription: plan.limits?.hasAudioTranscription ?? false,
    hasImageVision: plan.limits?.hasImageVision ?? false,
    hasGoogleMapsSearch: plan.limits?.hasGoogleMapsSearch ?? false,
    hasCustomBranding: plan.limits?.hasCustomBranding ?? false,
    hasApiAccess: plan.limits?.hasApiAccess ?? false,
    no_billing_block: (plan.limits as any)?.no_billing_block ?? false,
  })

  async function handleSave() {
    setLoading(true)
    const payload = {
      id: plan.id,
      name,
      price_monthly: Math.round(parseFloat(priceMonthly) * 100),
      price_yearly: Math.round(parseFloat(priceYearly) * 100),
      credits_monthly: parseInt(credits),
      limits: {
        maxAgents: limits.maxAgents ? parseInt(limits.maxAgents) : null,
        maxChannels: limits.maxChannels ? parseInt(limits.maxChannels) : null,
        maxTeamMembers: limits.maxTeamMembers ? parseInt(limits.maxTeamMembers) : null,
        maxDocumentsPerAgent: limits.maxDocumentsPerAgent ? parseInt(limits.maxDocumentsPerAgent) : null,
        hasAutomations: limits.hasAutomations,
        hasAnalytics: limits.hasAnalytics,
        hasCrm: limits.hasCrm,
        hasCampaigns: limits.hasCampaigns,
        hasKnowledgeBase: limits.hasKnowledgeBase,
        hasAudioTranscription: limits.hasAudioTranscription,
        hasImageVision: limits.hasImageVision,
        hasGoogleMapsSearch: limits.hasGoogleMapsSearch,
        hasCustomBranding: limits.hasCustomBranding,
        hasApiAccess: limits.hasApiAccess,
        no_billing_block: limits.no_billing_block,
      },
    }
    await fetch('/api/admin/plans', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setLoading(false)
    setEditing(false)
    window.location.reload()
  }

  async function toggleActive() {
    setTogglingActive(true)
    await fetch('/api/admin/plans', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: plan.id, is_active: !plan.is_active }),
    })
    setTogglingActive(false)
    window.location.reload()
  }

  function toggleBool(key: keyof LimitsState) {
    setLimits((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          <Pencil className="h-3 w-3" />
          Editar
        </button>
        <button
          onClick={toggleActive}
          disabled={togglingActive}
          title={plan.is_active ? 'Desativar plano' : 'Ativar plano'}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
            plan.is_active
              ? 'border-green-200 text-green-700 hover:bg-green-50'
              : 'border-gray-200 text-gray-500 hover:bg-muted'
          }`}
        >
          {togglingActive ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : plan.is_active ? (
            <ToggleRight className="h-3.5 w-3.5" />
          ) : (
            <ToggleLeft className="h-3.5 w-3.5" />
          )}
          {plan.is_active ? 'Ativo' : 'Inativo'}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-xl border bg-muted/20 p-4 space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Editar plano</h4>
        <button onClick={() => setEditing(false)} className="rounded p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Preço e créditos */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Créditos/mês</label>
          <input
            type="number"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Preço mensal (R$)</label>
          <input
            type="number"
            step="0.01"
            value={priceMonthly}
            onChange={(e) => setPriceMonthly(e.target.value)}
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Preço anual (R$)</label>
          <input
            type="number"
            step="0.01"
            value={priceYearly}
            onChange={(e) => setPriceYearly(e.target.value)}
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Limites numéricos */}
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Limites</p>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { key: 'maxAgents', label: 'Máx. agentes' },
              { key: 'maxChannels', label: 'Máx. canais' },
              { key: 'maxTeamMembers', label: 'Máx. membros' },
              { key: 'maxDocumentsPerAgent', label: 'Docs por agente' },
            ] as { key: keyof LimitsState; label: string }[]
          ).map(({ key, label }) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
              <input
                type="number"
                value={limits[key] as string}
                onChange={(e) => setLimits((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder="Ilimitado"
                className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Funcionalidades por grupo */}
      {FEATURE_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.label}</p>
          <div className="space-y-1.5">
            {group.features.map(({ key, label, description }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleBool(key)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                  limits[key]
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${limits[key] ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`}>
                  {limits[key] && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-none">{label}</p>
                  <p className="mt-0.5 text-xs opacity-70">{description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-end gap-2 pt-2 border-t">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Salvar alterações
        </button>
      </div>
    </div>
  )
}
