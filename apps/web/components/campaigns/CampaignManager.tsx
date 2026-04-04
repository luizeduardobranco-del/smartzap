'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Send, Plus, Trash2, Loader2, X, Play, Pause, CheckCircle2,
  AlertCircle, Clock, Users, Tag, Kanban, MessageSquare, ShieldAlert, List, Pencil, GitBranch,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type Campaign = {
  id: string
  name: string
  message: string
  channel_id: string
  target_type: string
  target_value: string | null
  delay_seconds: number
  business_hours_only: boolean
  start_hour: number | null
  end_hour: number | null
  status: string
  total_contacts: number
  sent_count: number
  failed_count: number
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  funnel_id: string | null
  funnel_stage_id: string | null
}

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  channelId: z.string().min(1, 'Selecione um canal'),
  message: z.string().min(5, 'Mensagem muito curta'),
  targetType: z.enum(['all', 'tag', 'stage', 'with_conversation', 'list']),
  targetValue: z.string().optional(),
  delaySeconds: z.number().min(3).max(30).default(5),
  businessHoursOnly: z.boolean().default(true),
  startHour: z.number().min(0).max(23).default(8),
  endHour: z.number().min(1).max(23).default(20),
  dailyLimit: z.number().min(1).max(500).optional(),
  funnelId: z.string().optional(),
  funnelStageId: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const TARGET_OPTIONS = [
  { value: 'with_conversation', label: 'Contatos que já conversaram', icon: MessageSquare, recommended: true },
  { value: 'list', label: 'Lista de contatos', icon: List },
  { value: 'all', label: 'Todos os contatos', icon: Users },
  { value: 'tag', label: 'Por tag', icon: Tag },
  { value: 'stage', label: 'Por etapa do CRM', icon: Kanban },
]

const CRM_STAGES = [
  { value: 'new', label: 'Novo' },
  { value: 'contacted', label: 'Contactado' },
  { value: 'qualified', label: 'Qualificado' },
  { value: 'proposal', label: 'Proposta' },
  { value: 'won', label: 'Ganho' },
  { value: 'lost', label: 'Perdido' },
]

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Rascunho', color: 'text-gray-600 bg-gray-100', icon: Clock },
  running: { label: 'Enviando', color: 'text-blue-600 bg-blue-100', icon: Loader2 },
  paused: { label: 'Pausada', color: 'text-yellow-600 bg-yellow-100', icon: Pause },
  completed: { label: 'Concluída', color: 'text-green-600 bg-green-100', icon: CheckCircle2 },
  failed: { label: 'Falha', color: 'text-red-600 bg-red-100', icon: AlertCircle },
}

// ─── Progress poller ──────────────────────────────────────────────────────────

function useProcessCampaign(campaignId: string | null, isRunning: boolean, onUpdate: () => void) {
  const activeRef = useRef(false)

  useEffect(() => {
    if (!campaignId || !isRunning) { activeRef.current = false; return }
    activeRef.current = true

    async function loop() {
      while (activeRef.current) {
        try {
          const res = await fetch(`/api/campaigns/${campaignId}/process`, { method: 'POST' })
          const data = await res.json()
          onUpdate()
          if (data.done || !activeRef.current) break
          // Wait for the delay before next request (server already slept, just small buffer)
          await new Promise((r) => setTimeout(r, 500))
        } catch {
          await new Promise((r) => setTimeout(r, 5000))
        }
      }
    }
    loop()
    return () => { activeRef.current = false }
  }, [campaignId, isRunning])
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CampaignManager() {
  const [showForm, setShowForm] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const utils = trpc.useUtils()

  const { data: campaigns = [], isLoading } = trpc.campaigns.list.useQuery(undefined, {
    refetchInterval: 3000,
  })
  const { data: channels = [] } = trpc.channels.list.useQuery()

  const create = trpc.campaigns.create.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); setShowForm(false) },
  })
  const update = trpc.campaigns.update.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); setEditingCampaign(null) },
  })
  const start = trpc.campaigns.start.useMutation({
    onSuccess: (_, vars) => { utils.campaigns.list.invalidate(); setActiveCampaignId(vars.id) },
  })
  const pause = trpc.campaigns.pause.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); setActiveCampaignId(null) },
  })
  const del = trpc.campaigns.delete.useMutation({
    onSuccess: () => { utils.campaigns.list.invalidate(); setDeleteId(null) },
  })

  const runningCampaign = (campaigns as Campaign[]).find((c) => c.status === 'running')
  useProcessCampaign(
    activeCampaignId ?? runningCampaign?.id ?? null,
    !!(activeCampaignId || runningCampaign),
    () => utils.campaigns.list.invalidate(),
  )

  const whatsappChannels = (channels as any[]).filter(
    (c) => c.type === 'whatsapp' && c.status === 'connected'
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Disparos em Massa</h1>
          <p className="text-sm text-muted-foreground">Envie mensagens para grupos de contatos com proteção anti-bloqueio</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Nova campanha
        </button>
      </div>

      {/* Anti-block notice */}
      <div className="flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
        <div className="text-sm">
          <p className="font-medium text-yellow-800">Proteção anti-bloqueio ativa</p>
          <p className="text-yellow-700">
            Intervalo mínimo de 5s entre envios · Jitter aleatório ±2s · Limite de 200 msgs/dia ·
            Personalização com <code className="rounded bg-yellow-100 px-1">{'{{nome}}'}</code> · Horário comercial (8h–20h)
          </p>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (campaigns as Campaign[]).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Send className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">Nenhuma campanha criada</h3>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">
            Crie campanhas para enviar mensagens personalizadas para seus contatos via WhatsApp.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Criar campanha
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {(campaigns as Campaign[]).map((c) => {
            const statusCfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.draft
            const StatusIcon = statusCfg.icon
            const progress = c.total_contacts > 0
              ? Math.round(((c.sent_count + c.failed_count) / c.total_contacts) * 100)
              : 0

            return (
              <div key={c.id} className="rounded-xl border bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{c.name}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.color}`}>
                        <StatusIcon className={`h-3 w-3 ${c.status === 'running' ? 'animate-spin' : ''}`} />
                        {statusCfg.label}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{c.message}</p>

                    {/* Stats */}
                    {c.total_contacts > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{c.sent_count} enviados · {c.failed_count} falhas · {c.total_contacts - c.sent_count - c.failed_count} pendentes</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {(() => {
                        const ch = (channels as any[]).find((ch) => ch.id === c.channel_id)
                        const agentName = ch?.agents?.name ?? ch?.name
                        return agentName ? <span className="font-medium text-slate-600">Agente: {agentName} · </span> : null
                      })()}
                      {c.delay_seconds}s entre envios · {c.business_hours_only ? 'Horário comercial' : 'Qualquer horário'} ·{' '}
                      {TARGET_OPTIONS.find((t) => t.value === c.target_type)?.label ?? c.target_type}
                      {c.target_value ? ` (${c.target_value})` : ''}
                    </p>
                    {c.funnel_id && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-blue-600">
                        <GitBranch className="h-3 w-3" />
                        Contatos entram no funil ao iniciar
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {c.status === 'draft' && (
                      <>
                        <button
                          onClick={() => setEditingCampaign(c)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => start.mutate({ id: c.id })}
                          disabled={start.isPending}
                          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                        >
                          {start.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                          Iniciar
                        </button>
                      </>
                    )}
                    {c.status === 'paused' && (
                      <>
                        <button
                          onClick={() => setEditingCampaign(c)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => start.mutate({ id: c.id })}
                          disabled={start.isPending}
                          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                        >
                          <Play className="h-3.5 w-3.5" />
                          Retomar
                        </button>
                      </>
                    )}
                    {c.status === 'running' && (
                      <button
                        onClick={() => { pause.mutate({ id: c.id }); setActiveCampaignId(null) }}
                        disabled={pause.isPending}
                        className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
                      >
                        <Pause className="h-3.5 w-3.5" />
                        Pausar
                      </button>
                    )}
                    {['draft', 'paused', 'completed', 'failed'].includes(c.status) && (
                      <button
                        onClick={() => setDeleteId(c.id)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 font-semibold">Excluir campanha?</h3>
            <p className="mb-4 text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
              <button
                onClick={() => del.mutate({ id: deleteId })}
                disabled={del.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60"
              >
                {del.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create form modal */}
      {showForm && (
        <CampaignForm
          channels={whatsappChannels}
          onClose={() => setShowForm(false)}
          onSave={(data) => create.mutate(data)}
          isSaving={create.isPending}
        />
      )}

      {/* Edit form modal */}
      {editingCampaign && (
        <CampaignForm
          channels={whatsappChannels}
          onClose={() => setEditingCampaign(null)}
          onSave={(data) => update.mutate({ id: editingCampaign.id, ...data })}
          isSaving={update.isPending}
          initialValues={{
            name: editingCampaign.name,
            channelId: editingCampaign.channel_id,
            message: editingCampaign.message,
            targetType: editingCampaign.target_type as FormData['targetType'],
            targetValue: editingCampaign.target_value ?? undefined,
            delaySeconds: editingCampaign.delay_seconds,
            businessHoursOnly: editingCampaign.business_hours_only,
            startHour: editingCampaign.start_hour ?? 8,
            endHour: editingCampaign.end_hour ?? 20,
            dailyLimit: (editingCampaign as any).daily_limit ?? undefined,
            funnelId: editingCampaign.funnel_id ?? undefined,
            funnelStageId: editingCampaign.funnel_stage_id ?? undefined,
          }}
          title="Editar campanha"
          submitLabel="Salvar alterações"
        />
      )}
    </div>
  )
}

// ─── Create form ──────────────────────────────────────────────────────────────

function CampaignForm({
  channels,
  onClose,
  onSave,
  isSaving,
  initialValues,
  title = 'Nova campanha',
  submitLabel = 'Criar campanha',
}: {
  channels: any[]
  onClose: () => void
  onSave: (data: FormData) => void
  isSaving: boolean
  initialValues?: Partial<FormData>
  title?: string
  submitLabel?: string
}) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      targetType: 'with_conversation',
      delaySeconds: 5,
      businessHoursOnly: true,
      startHour: 8,
      endHour: 20,
      ...initialValues,
    },
  })

  const targetType = watch('targetType')
  const funnelId = watch('funnelId')
  const businessHoursOnly = watch('businessHoursOnly')
  const { data: contactLists = [] } = trpc.contacts.getLists.useQuery()
  const { data: funnels = [] } = trpc.funnels.list.useQuery()
  const { data: orgTags = [] } = trpc.crm.getOrgTags.useQuery()
  const message = watch('message') ?? ''
  const preview = message.replace(/\{\{nome\}\}/gi, 'João').replace(/\{\{name\}\}/gi, 'João')

  // Multi-tag selection state (parsed from targetValue when targetType==='tag')
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    if (initialValues?.targetType === 'tag' && initialValues?.targetValue) {
      try { return JSON.parse(initialValues.targetValue) } catch { return [initialValues.targetValue] }
    }
    return []
  })

  function toggleTag(tag: string) {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag]
    setSelectedTags(next)
    setValue('targetValue', next.length > 0 ? JSON.stringify(next) : undefined)
  }

  const selectedFunnel = (funnels as any[]).find((f: any) => f.id === funnelId)
  const funnelStages = selectedFunnel?.funnel_stages
    ? [...selectedFunnel.funnel_stages].sort((a: any, b: any) => a.position - b.position)
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit(onSave)} className="space-y-5 p-6">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Nome da campanha *</label>
            <input
              {...register('name')}
              placeholder="Ex: Promoção de março"
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
          </div>

          {/* Channel */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Canal WhatsApp *</label>
            {channels.length === 0 ? (
              <p className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
                Nenhum canal WhatsApp conectado. Conecte um canal primeiro em Agentes → Canais.
              </p>
            ) : (
              <select
                {...register('channelId')}
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Selecione...</option>
                {channels.map((ch: any) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.agents?.name ?? ch.name ?? 'Agente sem nome'}
                  </option>
                ))}
              </select>
            )}
            {errors.channelId && <p className="mt-1 text-xs text-red-500">{errors.channelId.message}</p>}
          </div>

          {/* Target */}
          <div>
            <label className="mb-2 block text-sm font-medium">Público-alvo</label>
            <div className="space-y-2">
              {TARGET_OPTIONS.map((t) => {
                const Icon = t.icon
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setValue('targetType', t.value as FormData['targetType'], { shouldDirty: true })}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      targetType === t.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="text-sm">{t.label}</span>
                    {t.recommended && (
                      <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Recomendado</span>
                    )}
                    <div className={`ml-auto h-4 w-4 shrink-0 rounded-full border-2 ${targetType === t.value ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`} />
                  </button>
                )
              })}
            </div>
            {targetType === 'tag' && (
              <div className="mt-2 rounded-xl border p-3 space-y-2">
                <p className="text-xs font-medium text-slate-500">Selecione uma ou mais tags:</p>
                {orgTags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma tag cadastrada ainda.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
                    {(orgTags as string[]).map((tag) => {
                      const active = selectedTags.includes(tag)
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                            active
                              ? 'bg-primary text-white border-primary shadow-sm'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {active && <span className="mr-1">✓</span>}
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                )}
                {selectedTags.length > 0 && (
                  <p className="text-xs text-primary font-medium">
                    {selectedTags.length} tag{selectedTags.length > 1 ? 's' : ''} selecionada{selectedTags.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}
            {targetType === 'stage' && (
              <select
                {...register('targetValue')}
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                {CRM_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            )}
            {targetType === 'list' && (
              contactLists.length === 0 ? (
                <p className="mt-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
                  Nenhuma lista criada. Crie uma lista em <strong>Contatos → Listas</strong> primeiro.
                </p>
              ) : (
                <select
                  {...register('targetValue')}
                  className="mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Selecione uma lista...</option>
                  {(contactLists as any[]).map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.member_count} contatos)
                    </option>
                  ))}
                </select>
              )
            )}
          </div>

          {/* Message */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Mensagem *
              <span className="ml-2 font-normal text-muted-foreground text-xs">use {'{{nome}}'} para personalizar</span>
            </label>
            <textarea
              {...register('message')}
              rows={5}
              placeholder={'Olá {{nome}}! Temos uma novidade especial para você...'}
              className="w-full resize-none rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.message && <p className="mt-1 text-xs text-red-500">{errors.message.message}</p>}
            {/* Preview */}
            {preview && (
              <div className="mt-2 rounded-lg bg-green-50 border border-green-200 p-3">
                <p className="text-xs font-medium text-green-700 mb-1">Prévia (para "João"):</p>
                <p className="text-sm text-green-900 whitespace-pre-wrap">{preview}</p>
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="rounded-xl border p-4 space-y-4">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Configurações anti-bloqueio</p>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Intervalo entre envios: <span className="text-primary">{watch('delaySeconds')}s</span>
              </label>
              <input
                type="range" min={3} max={30} step={1}
                {...register('delaySeconds', { valueAsNumber: true })}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>3s (arriscado)</span>
                <span>30s (mais seguro)</span>
              </div>
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input type="checkbox" {...register('businessHoursOnly')} className="h-4 w-4 rounded border" />
                <div>
                  <p className="text-sm font-medium">Restringir horário de envio</p>
                  <p className="text-xs text-muted-foreground">Reduz risco de bloqueio e denúncias</p>
                </div>
              </label>
              {businessHoursOnly && (
                <div className="ml-7 flex items-center gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Início</label>
                    <select
                      {...register('startHour', { valueAsNumber: true })}
                      className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                  <span className="text-sm text-slate-400 mt-4">até</span>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Fim</label>
                    <select
                      {...register('endHour', { valueAsNumber: true })}
                      className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Daily limit */}
            <div className="border-t pt-3">
              <label className="mb-1.5 block text-sm font-medium">
                Limite diário de disparos
                <span className="ml-2 font-normal text-muted-foreground text-xs">(opcional)</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={500}
                  placeholder="Ex: 25"
                  {...register('dailyLimit', { valueAsNumber: true })}
                  className="w-32 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-xs text-muted-foreground">
                  disparos por dia. Ao atingir o limite, retoma automaticamente no dia seguinte.
                </p>
              </div>
            </div>
          </div>

          {/* Funnel */}
          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-blue-600" />
              <p className="text-sm font-semibold">Direcionar para funil <span className="font-normal text-muted-foreground">(opcional)</span></p>
            </div>
            <p className="text-xs text-muted-foreground">Ao iniciar a campanha, todos os contatos entram automaticamente na etapa selecionada.</p>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Funil</label>
              <select
                {...register('funnelId')}
                onChange={(e) => { setValue('funnelId', e.target.value); setValue('funnelStageId', '') }}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Nenhum funil selecionado</option>
                {(funnels as any[]).map((f: any) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            {funnelId && funnelStages.length > 0 && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Etapa de entrada</label>
                <select
                  {...register('funnelStageId')}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Selecione a etapa...</option>
                  {funnelStages.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
            <button
              type="submit"
              disabled={isSaving || channels.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
