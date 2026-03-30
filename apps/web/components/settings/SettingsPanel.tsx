'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'next/navigation'
import { Building2, Key, CreditCard, Eye, EyeOff, Loader2, CheckCircle, Plug, Calendar, Mail, Trash2, ShieldCheck } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

const TABS = [
  { id: 'org', label: 'Organização', icon: Building2 },
  { id: 'ai', label: 'Chaves de IA', icon: Key },
  { id: 'integrations', label: 'Integrações', icon: Plug },
  { id: 'billing', label: 'Plano & Créditos', icon: CreditCard },
]

export function SettingsPanel() {
  const [tab, setTab] = useState('org')
  const { data: org, isLoading } = trpc.settings.getOrg.useQuery()
  const searchParams = useSearchParams()

  const integrationSuccess = searchParams?.get('integration_success') === '1'
  const integrationError = searchParams?.get('integration_error') === '1'

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie sua conta e integrações</p>
      </div>

      {integrationSuccess && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle className="h-4 w-4" />
          Google conectado com sucesso!
        </div>
      )}
      {integrationError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Erro ao conectar com o Google. Tente novamente.
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar */}
        <nav className="w-48 shrink-0 space-y-1">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            )
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 rounded-xl border bg-white p-6 shadow-sm">
          {tab === 'org' && <OrgTab org={org} />}
          {tab === 'ai' && <AIKeysTab org={org} />}
          {tab === 'integrations' && <IntegrationsTab />}
          {tab === 'billing' && <BillingTab org={org} />}
        </div>
      </div>
    </div>
  )
}

// ─── Org Tab ───────────────────────────────────────────────────────────────

function formatCpfCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 11) {
    return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 10) return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3')
}

function OrgTab({ org }: { org: any }) {
  const utils = trpc.useUtils()
  const [saved, setSaved] = useState(false)
  const [fiscalSaved, setFiscalSaved] = useState(false)
  const [cpfCnpj, setCpfCnpj] = useState((org?.settings as any)?.fiscal?.cpfCnpj ?? '')
  const [mobilePhone, setMobilePhone] = useState((org?.settings as any)?.fiscal?.mobilePhone ?? '')

  const { register, handleSubmit, formState: { isDirty } } = useForm({
    values: { name: org?.name ?? '' },
  })

  const update = trpc.settings.updateOrg.useMutation({
    onSuccess: () => { utils.settings.getOrg.invalidate(); setSaved(true); setTimeout(() => setSaved(false), 2000) },
  })

  const updateFiscal = trpc.settings.updateOrgFiscal.useMutation({
    onSuccess: () => { utils.settings.getOrg.invalidate(); setFiscalSaved(true); setTimeout(() => setFiscalSaved(false), 2000) },
  })

  const hasFiscal = !!(org?.settings as any)?.fiscal?.cpfCnpj

  return (
    <div className="space-y-8 max-w-lg">
      {/* Nome */}
      <form onSubmit={handleSubmit((d) => update.mutate(d))} className="space-y-5">
        <h2 className="font-semibold">Dados da organização</h2>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Nome da empresa</label>
          <input
            {...register('name')}
            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Slug</label>
          <input
            value={org?.slug ?? ''}
            disabled
            className="w-full rounded-lg border bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground"
          />
          <p className="mt-1 text-xs text-muted-foreground">Identificador único, não pode ser alterado.</p>
        </div>
        <button
          type="submit"
          disabled={!isDirty || update.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : null}
          {saved ? 'Salvo!' : 'Salvar'}
        </button>
        {update.error && <p className="text-sm text-red-500">{update.error.message}</p>}
      </form>

      {/* CPF/CNPJ */}
      <div className="border-t pt-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Dados fiscais para pagamento</h2>
          {hasFiscal && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Cadastrado</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Necessário para assinar um plano ou comprar créditos. O CPF/CNPJ é enviado diretamente ao processador de pagamento (Asaas).
        </p>
        <div>
          <label className="mb-1.5 block text-sm font-medium">CPF ou CNPJ <span className="text-red-500">*</span></label>
          <input
            type="text"
            inputMode="numeric"
            value={cpfCnpj}
            onChange={(e) => setCpfCnpj(formatCpfCnpj(e.target.value))}
            placeholder="000.000.000-00"
            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Celular <span className="text-muted-foreground font-normal text-xs">(opcional)</span></label>
          <input
            type="text"
            inputMode="numeric"
            value={mobilePhone}
            onChange={(e) => setMobilePhone(formatPhone(e.target.value))}
            placeholder="(11) 99999-9999"
            className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          type="button"
          disabled={cpfCnpj.replace(/\D/g, '').length < 11 || updateFiscal.isPending}
          onClick={() => updateFiscal.mutate({ cpfCnpj, mobilePhone })}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {updateFiscal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : fiscalSaved ? <CheckCircle className="h-4 w-4" /> : null}
          {fiscalSaved ? 'Salvo!' : 'Salvar dados fiscais'}
        </button>
        {updateFiscal.error && <p className="text-sm text-red-500">{updateFiscal.error.message}</p>}
      </div>
    </div>
  )
}

// ─── AI Keys Tab ───────────────────────────────────────────────────────────

function AIKeysTab({ org }: { org: any }) {
  const utils = trpc.useUtils()
  const [saved, setSaved] = useState(false)
  const [show, setShow] = useState<Record<string, boolean>>({})
  const savedKeys = (org?.settings as any)?.aiKeys ?? {}

  const { register, handleSubmit, formState: { isDirty } } = useForm({
    defaultValues: {
      openaiApiKey: savedKeys.openaiApiKey ?? '',
      anthropicApiKey: savedKeys.anthropicApiKey ?? '',
      groqApiKey: savedKeys.groqApiKey ?? '',
    },
  })

  const update = trpc.settings.updateAIKeys.useMutation({
    onSuccess: () => {
      utils.settings.getOrg.invalidate()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const fields = [
    { key: 'openaiApiKey', label: 'OpenAI API Key', placeholder: 'sk-proj-...', hint: 'Usado para GPT-4o e embeddings' },
    { key: 'anthropicApiKey', label: 'Anthropic API Key', placeholder: 'sk-ant-...', hint: 'Usado para Claude' },
    { key: 'groqApiKey', label: 'Groq API Key', placeholder: 'gsk_...', hint: 'Usado para Llama e outros modelos open source' },
  ]

  return (
    <form onSubmit={handleSubmit((d) => update.mutate(d))} className="space-y-5 max-w-lg">
      <div>
        <h2 className="font-semibold">Chaves de API dos provedores de IA</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Suas chaves ficam armazenadas de forma segura e são usadas pelos seus agentes.
        </p>
      </div>

      {fields.map((f) => (
        <div key={f.key}>
          <label className="mb-1.5 block text-sm font-medium">{f.label}</label>
          <div className="relative">
            <input
              {...register(f.key as any)}
              type={show[f.key] ? 'text' : 'password'}
              placeholder={f.placeholder}
              className="w-full rounded-lg border px-3 py-2.5 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="button"
              onClick={() => setShow((s) => ({ ...s, [f.key]: !s[f.key] }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {show[f.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{f.hint}</p>
        </div>
      ))}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Se não configurar suas chaves, os agentes usarão as chaves da plataforma e o consumo será descontado dos seus créditos.
      </div>

      <button
        type="submit"
        disabled={!isDirty || update.isPending}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
      >
        {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4" /> : null}
        {saved ? 'Salvo!' : 'Salvar chaves'}
      </button>
      {update.error && <p className="text-sm text-red-500">{update.error.message}</p>}
    </form>
  )
}

// ─── Integrations Tab ───────────────────────────────────────────────────────

function IntegrationsTab() {
  const utils = trpc.useUtils()
  const { data: integrations, isLoading } = trpc.integrations.list.useQuery()
  const revoke = trpc.integrations.revoke.useMutation({
    onSuccess: () => utils.integrations.list.invalidate(),
  })

  const googleIntegration = integrations?.find((i: any) => i.provider === 'google_calendar')

  const INTEGRATIONS = [
    {
      id: 'google',
      provider: 'google_calendar',
      label: 'Google Calendar & Gmail',
      desc: 'Crie eventos no Google Calendar e envie e-mails via Gmail nas suas automações.',
      icon: Calendar,
      connectUrl: '/api/auth/google',
      connected: !!googleIntegration,
      email: googleIntegration?.email,
    },
  ]

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h2 className="font-semibold">Integrações externas</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Conecte serviços externos para usar em suas automações.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {INTEGRATIONS.map((integration) => {
            const Icon = integration.icon
            return (
              <div key={integration.id} className="flex items-center justify-between rounded-xl border p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{integration.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {integration.connected
                        ? `Conectado como ${integration.email ?? '—'}`
                        : integration.desc}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {integration.connected && (
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      Conectado
                    </span>
                  )}
                  {integration.connected ? (
                    <button
                      onClick={() => revoke.mutate({ provider: integration.provider })}
                      disabled={revoke.isPending}
                      className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Desconectar
                    </button>
                  ) : (
                    <a
                      href={integration.connectUrl}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
                    >
                      Conectar
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
        <strong>Como funciona:</strong> Ao conectar o Google, você pode usar as ações &quot;Criar evento no Google Calendar&quot; e &quot;Enviar e-mail via Gmail&quot; nas suas automações.
      </div>
    </div>
  )
}

// ─── Billing Tab ───────────────────────────────────────────────────────────

function BillingTab({ org }: { org: any }) {
  const plan = (org as any)?.plans
  const trialEnds = org?.trial_ends_at ? new Date(org.trial_ends_at) : null
  const daysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86400000)) : 0

  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="font-semibold">Plano e créditos</h2>

      <div className="rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-medium">{plan?.name ?? 'Free'}</p>
            <p className="text-sm text-muted-foreground capitalize">{org?.subscription_status}</p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            {plan?.slug ?? 'free'}
          </span>
        </div>
        {trialEnds && daysLeft > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
            Trial expira em <strong>{daysLeft} dias</strong> ({trialEnds.toLocaleDateString('pt-BR')})
          </div>
        )}
      </div>

      <div className="rounded-xl border p-4">
        <p className="text-sm font-medium mb-1">Créditos disponíveis</p>
        <p className="text-3xl font-bold">{(org?.credits_balance ?? 0).toLocaleString('pt-BR')}</p>
        <p className="text-xs text-muted-foreground mt-1">Cada mensagem processada pela IA consome créditos</p>
      </div>

      <a
        href="/credits"
        className="block w-full rounded-lg border border-primary px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-primary/5"
      >
        Gerenciar plano e créditos
      </a>
    </div>
  )
}
