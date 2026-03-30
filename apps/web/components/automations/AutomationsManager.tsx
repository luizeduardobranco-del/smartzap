'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Zap, Plus, Pencil, Trash2, Loader2, X, ChevronDown, ChevronUp,
  MessageSquare, Tag, Kanban, UserCheck, Hash, Clock, Sparkles,
  Mail, Calendar, Webhook, Timer, UserPlus, TrendingUp, Info,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

// ─── Types ────────────────────────────────────────────────────────────────────

const TRIGGER_TYPES = [
  { value: 'keyword', label: 'Palavra-chave', description: 'Quando a mensagem contém palavras específicas', icon: Hash, color: 'text-blue-500 bg-blue-50' },
  { value: 'first_message', label: 'Primeira mensagem', description: 'Quando um novo contato envia a primeira mensagem', icon: Sparkles, color: 'text-purple-500 bg-purple-50' },
  { value: 'off_hours', label: 'Fora do horário', description: 'Quando a mensagem chega fora do horário de atendimento', icon: Clock, color: 'text-orange-500 bg-orange-50' },
  { value: 'no_response', label: 'Sem resposta', description: 'Quando o contato não responde em N horas', icon: Timer, color: 'text-red-500 bg-red-50' },
  { value: 'contact_created', label: 'Contato criado', description: 'Quando um novo contato é adicionado ao sistema', icon: UserPlus, color: 'text-green-500 bg-green-50' },
  { value: 'stage_changed', label: 'Etapa alterada', description: 'Quando o contato muda de etapa no CRM', icon: TrendingUp, color: 'text-indigo-500 bg-indigo-50' },
] as const

const ACTION_TYPES = [
  { value: 'send_message', label: 'Enviar mensagem', description: 'Responde automaticamente com um texto no WhatsApp', icon: MessageSquare },
  { value: 'add_tag', label: 'Adicionar tag', description: 'Adiciona uma tag ao contato no CRM', icon: Tag },
  { value: 'change_stage', label: 'Mover no CRM', description: 'Move o lead para outra etapa do Kanban', icon: Kanban },
  { value: 'handoff', label: 'Transferir para humano', description: 'Pausa o agente IA e sinaliza atendimento humano', icon: UserCheck },
  { value: 'send_email', label: 'Enviar e-mail', description: 'Envia e-mail via Gmail conectado nas Integrações', icon: Mail },
  { value: 'create_calendar_event', label: 'Criar evento', description: 'Cria evento no Google Calendar conectado', icon: Calendar },
  { value: 'send_webhook', label: 'Enviar webhook', description: 'Dispara uma requisição POST para URL externa', icon: Webhook },
  { value: 'wait', label: 'Aguardar', description: 'Pausa a sequência por N minutos antes da próxima ação', icon: Timer },
] as const

const AUTOMATION_RECIPES = [
  { trigger: 'first_message', action: 'send_message', label: 'Boas-vindas automáticas', desc: 'Recebe primeira msg → envia saudação' },
  { trigger: 'keyword', action: 'add_tag', label: 'Qualificar leads', desc: 'Palavra "preço" → adiciona tag "lead-quente"' },
  { trigger: 'off_hours', action: 'send_message', label: 'Mensagem fora de horário', desc: 'Msg fora do expediente → avisa retorno' },
  { trigger: 'no_response', action: 'send_email', label: 'Follow-up por e-mail', desc: 'Sem resposta 24h → envia e-mail de reengajamento' },
  { trigger: 'stage_changed', action: 'send_email', label: 'E-mail de proposta', desc: 'Lead chegou em Qualificado → envia proposta por e-mail' },
  { trigger: 'contact_created', action: 'create_calendar_event', label: 'Agendar onboarding', desc: 'Novo contato → cria evento de onboarding no calendário' },
  { trigger: 'keyword', action: 'send_webhook', label: 'Integração com ERP', desc: 'Palavra "pedido" → dispara webhook no ERP' },
]

const CRM_STAGES = [
  { value: 'new', label: 'Novo' },
  { value: 'contacted', label: 'Contactado' },
  { value: 'qualified', label: 'Qualificado' },
  { value: 'proposal', label: 'Proposta' },
  { value: 'won', label: 'Ganho' },
  { value: 'lost', label: 'Perdido' },
]

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  description: z.string().optional(),
  agentId: z.string().nullable(),
  triggerType: z.enum(['keyword', 'first_message', 'off_hours', 'no_response', 'contact_created', 'stage_changed']),
  keywords: z.string().optional(),
  matchAll: z.boolean().default(false),
  startHour: z.number().min(0).max(23).default(18),
  endHour: z.number().min(0).max(23).default(8),
  noResponseHours: z.number().min(1).max(168).default(24),
  stageChangedStage: z.string().default('new'),
  actionType: z.enum(['send_message', 'add_tag', 'change_stage', 'handoff', 'send_email', 'create_calendar_event', 'send_webhook', 'wait']),
  message: z.string().optional(),
  tag: z.string().optional(),
  stage: z.string().optional(),
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
  calendarTitle: z.string().optional(),
  calendarDuration: z.number().default(60),
  webhookUrl: z.string().optional(),
  waitMinutes: z.number().default(30),
})

type FormData = z.infer<typeof schema>

type Automation = {
  id: string; name: string; description: string
  agent_id: string | null; trigger_type: string
  trigger_config: Record<string, unknown>; action_type: string
  action_config: Record<string, unknown>; is_active: boolean
  executions_count: number; agents: { name: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTriggerConfig(data: FormData) {
  if (data.triggerType === 'keyword') {
    const keywords = (data.keywords ?? '').split('\n').map((k) => k.trim()).filter(Boolean)
    return { keywords, matchAll: data.matchAll }
  }
  if (data.triggerType === 'off_hours') return { startHour: data.startHour, endHour: data.endHour }
  if (data.triggerType === 'no_response') return { hours: data.noResponseHours }
  if (data.triggerType === 'stage_changed') return { stage: data.stageChangedStage }
  return {}
}

function buildActionConfig(data: FormData) {
  if (data.actionType === 'send_message') return { message: data.message ?? '' }
  if (data.actionType === 'add_tag') return { tag: data.tag ?? '' }
  if (data.actionType === 'change_stage') return { stage: data.stage ?? 'new' }
  if (data.actionType === 'send_email') return { subject: data.emailSubject ?? '', body: data.emailBody ?? '' }
  if (data.actionType === 'create_calendar_event') return { title: data.calendarTitle ?? '', duration: data.calendarDuration }
  if (data.actionType === 'send_webhook') return { url: data.webhookUrl ?? '' }
  if (data.actionType === 'wait') return { minutes: data.waitMinutes }
  return {}
}

function formFromAutomation(a: Automation): Partial<FormData> {
  const tc = a.trigger_config as Record<string, unknown>
  const ac = a.action_config as Record<string, unknown>
  return {
    name: a.name, description: a.description, agentId: a.agent_id,
    triggerType: a.trigger_type as FormData['triggerType'],
    keywords: Array.isArray(tc.keywords) ? (tc.keywords as string[]).join('\n') : '',
    matchAll: (tc.matchAll as boolean) ?? false,
    startHour: (tc.startHour as number) ?? 18,
    endHour: (tc.endHour as number) ?? 8,
    noResponseHours: (tc.hours as number) ?? 24,
    stageChangedStage: (tc.stage as string) ?? 'new',
    actionType: a.action_type as FormData['actionType'],
    message: (ac.message as string) ?? '',
    tag: (ac.tag as string) ?? '',
    stage: (ac.stage as string) ?? 'new',
    emailSubject: (ac.subject as string) ?? '',
    emailBody: (ac.body as string) ?? '',
    calendarTitle: (ac.title as string) ?? '',
    calendarDuration: (ac.duration as number) ?? 60,
    webhookUrl: (ac.url as string) ?? '',
    waitMinutes: (ac.minutes as number) ?? 30,
  }
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AutomationsManager() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Automation | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const utils = trpc.useUtils()

  const { data: automations = [], isLoading } = trpc.automations.list.useQuery()
  const { data: agents = [] } = trpc.agents.list.useQuery()

  const create = trpc.automations.create.useMutation({ onSuccess: () => { utils.automations.list.invalidate(); setModalOpen(false) } })
  const update = trpc.automations.update.useMutation({ onSuccess: () => { utils.automations.list.invalidate(); setModalOpen(false); setEditing(null) } })
  const toggle = trpc.automations.toggle.useMutation({ onSuccess: () => utils.automations.list.invalidate() })
  const del = trpc.automations.delete.useMutation({ onSuccess: () => { utils.automations.list.invalidate(); setDeleteId(null) } })

  const triggerLabel = (type: string) => TRIGGER_TYPES.find((t) => t.value === type)?.label ?? type
  const actionLabel = (type: string) => ACTION_TYPES.find((t) => t.value === type)?.label ?? type
  const triggerStyle = (type: string) => TRIGGER_TYPES.find((t) => t.value === type)?.color ?? 'text-gray-500 bg-gray-50'
  const TriggerIcon = (type: string) => TRIGGER_TYPES.find((t) => t.value === type)?.icon ?? Hash
  const ActionIcon = (type: string) => ACTION_TYPES.find((t) => t.value === type)?.icon ?? Zap

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automações</h1>
          <p className="text-sm text-muted-foreground">Gatilhos automáticos que executam ações quando certas condições são atendidas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGuideOpen(!guideOpen)}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            <Info className="h-4 w-4" />
            {guideOpen ? 'Ocultar guia' : 'Ver receitas'}
            {guideOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => { setEditing(null); setModalOpen(true) }}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Nova automação
          </button>
        </div>
      </div>

      {/* Recipes guide */}
      {guideOpen && (
        <div className="rounded-xl border bg-muted/20 p-5 space-y-4">
          <div>
            <h3 className="mb-3 text-sm font-semibold">Gatilhos disponíveis</h3>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {TRIGGER_TYPES.map((t) => {
                const Icon = t.icon
                return (
                  <div key={t.value} className="flex items-start gap-2 rounded-lg border bg-white p-2.5">
                    <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${t.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{t.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">Ações disponíveis</h3>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {ACTION_TYPES.map((a) => {
                const Icon = a.icon
                return (
                  <div key={a.value} className="flex items-start gap-2 rounded-lg border bg-white p-2.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <p className="text-xs font-medium">{a.label}</p>
                      <p className="text-xs text-muted-foreground">{a.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">Receitas prontas</h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {AUTOMATION_RECIPES.map((r, i) => {
                const TIcon = TRIGGER_TYPES.find((t) => t.value === r.trigger)?.icon ?? Hash
                const AIcon = ACTION_TYPES.find((a) => a.value === r.action)?.icon ?? Zap
                const tColor = TRIGGER_TYPES.find((t) => t.value === r.trigger)?.color ?? ''
                return (
                  <div key={i} className="flex items-center gap-3 rounded-lg border bg-white p-3">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tColor}`}>
                      <TIcon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs text-muted-foreground">→</span>
                    <AIcon className="h-4 w-4 shrink-0 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{r.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.desc}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : automations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Zap className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">Nenhuma automação criada</h3>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">
            Crie gatilhos automáticos para responder mensagens, classificar leads, enviar e-mails e muito mais.
          </p>
          <button onClick={() => { setEditing(null); setModalOpen(true) }} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Criar primeira automação
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {(automations as Automation[]).map((a) => {
            const TIcon = TriggerIcon(a.trigger_type)
            const AIcon = ActionIcon(a.action_type)
            return (
              <div key={a.id} className={`flex items-center gap-4 rounded-xl border bg-white p-4 transition-opacity ${!a.is_active ? 'opacity-60' : ''}`}>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${triggerStyle(a.trigger_type)}`}>
                  <TIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{a.name}</p>
                    {a.agents && <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{(a.agents as any)?.name}</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${triggerStyle(a.trigger_type)}`}>{triggerLabel(a.trigger_type)}</span>
                    <span>→</span>
                    <span className="flex items-center gap-1"><AIcon className="h-3 w-3" />{actionLabel(a.action_type)}</span>
                    {a.executions_count > 0 && <span className="ml-2 text-muted-foreground/60">{a.executions_count} execuções</span>}
                  </div>
                  {a.description && <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggle.mutate({ id: a.id, isActive: !a.is_active })}
                    disabled={toggle.isPending}
                    className={`relative inline-flex h-6 w-11 cursor-pointer rounded-full transition-colors ${a.is_active ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${a.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                  <button onClick={() => { setEditing(a); setModalOpen(true) }} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleteId(a.id)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-xl bg-white p-6 shadow-xl w-80">
            <h3 className="mb-2 font-semibold">Excluir automação?</h3>
            <p className="mb-4 text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
              <button onClick={() => del.mutate({ id: deleteId })} disabled={del.isPending} className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60">
                {del.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <AutomationModal
          editing={editing}
          agents={agents as { id: string; name: string }[]}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          onSave={(data) => {
            const payload = {
              name: data.name, description: data.description, agentId: data.agentId ?? null,
              triggerType: data.triggerType, triggerConfig: buildTriggerConfig(data),
              actionType: data.actionType, actionConfig: buildActionConfig(data),
            }
            if (editing) update.mutate({ ...payload, id: editing.id })
            else create.mutate(payload)
          }}
          isSaving={create.isPending || update.isPending}
        />
      )}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function AutomationModal({ editing, agents, onClose, onSave, isSaving }: {
  editing: Automation | null; agents: { id: string; name: string }[]
  onClose: () => void; onSave: (data: FormData) => void; isSaving: boolean
}) {
  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: editing ? formFromAutomation(editing) : {
      agentId: null, triggerType: 'keyword', matchAll: false,
      startHour: 18, endHour: 8, noResponseHours: 24, stageChangedStage: 'new',
      actionType: 'send_message', calendarDuration: 60, waitMinutes: 30,
    },
  })

  const triggerType = watch('triggerType')
  const actionType = watch('actionType')

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-semibold">{editing ? 'Editar automação' : 'Nova automação'}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit(onSave)} className="space-y-5 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Nome da automação *</label>
            <input {...register('name')} placeholder="Ex: Resposta fora do horário" className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Aplicar em</label>
            <Controller control={control} name="agentId" render={({ field }) => (
              <select value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value || null)} className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">Todos os agentes</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )} />
          </div>

          {/* Trigger */}
          <div className="rounded-xl border p-4 space-y-3">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Gatilho — quando executar</p>
            <div className="grid grid-cols-1 gap-2">
              {TRIGGER_TYPES.map((t) => {
                const Icon = t.icon
                return (
                  <button key={t.value} type="button" onClick={() => setValue('triggerType', t.value, { shouldDirty: true })}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${triggerType === t.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.color}`}><Icon className="h-4 w-4" /></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{t.description}</p>
                    </div>
                    <div className={`h-4 w-4 shrink-0 rounded-full border-2 ${triggerType === t.value ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`} />
                  </button>
                )
              })}
            </div>

            {triggerType === 'keyword' && (
              <div className="space-y-3 pt-1">
                <div>
                  <label className="mb-1 block text-xs font-medium">Palavras-chave (uma por linha)</label>
                  <textarea {...register('keywords')} rows={3} placeholder={'preço\nvalor\norçamento'} className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...register('matchAll')} className="h-4 w-4 rounded border" />
                  Exigir todas as palavras (E) — padrão é qualquer uma (OU)
                </label>
              </div>
            )}
            {triggerType === 'off_hours' && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="mb-1 block text-xs font-medium">Início do atendimento (hora)</label>
                  <input type="number" min={0} max={23} {...register('endHour', { valueAsNumber: true })} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                  <p className="mt-0.5 text-xs text-muted-foreground">Ex: 8 = 08:00</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Fim do atendimento (hora)</label>
                  <input type="number" min={0} max={23} {...register('startHour', { valueAsNumber: true })} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                  <p className="mt-0.5 text-xs text-muted-foreground">Ex: 18 = 18:00</p>
                </div>
              </div>
            )}
            {triggerType === 'no_response' && (
              <div className="pt-1">
                <label className="mb-1 block text-xs font-medium">Sem resposta há quantas horas?</label>
                <input type="number" min={1} max={168} {...register('noResponseHours', { valueAsNumber: true })} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                <p className="mt-0.5 text-xs text-muted-foreground">Ex: 24 = disparar após 1 dia sem resposta</p>
              </div>
            )}
            {triggerType === 'stage_changed' && (
              <div className="pt-1">
                <label className="mb-1 block text-xs font-medium">Quando mover para a etapa</label>
                <select {...register('stageChangedStage')} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30">
                  {CRM_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Action */}
          <div className="rounded-xl border p-4 space-y-3">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Ação — o que fazer</p>
            <div className="grid grid-cols-2 gap-2">
              {ACTION_TYPES.map((a) => {
                const Icon = a.icon
                return (
                  <button key={a.value} type="button" onClick={() => setValue('actionType', a.value, { shouldDirty: true })}
                    className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${actionType === a.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <p className="text-xs font-medium">{a.label}</p>
                  </button>
                )
              })}
            </div>

            {actionType === 'send_message' && (
              <div>
                <label className="mb-1 block text-xs font-medium">Mensagem a enviar *</label>
                <textarea {...register('message')} rows={4} placeholder="Olá! Nosso horário de atendimento é de seg a sex, das 8h às 18h." className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            )}
            {actionType === 'add_tag' && (
              <div>
                <label className="mb-1 block text-xs font-medium">Nome da tag</label>
                <input {...register('tag')} placeholder="Ex: lead-quente" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            )}
            {actionType === 'change_stage' && (
              <div>
                <label className="mb-1 block text-xs font-medium">Mover para etapa</label>
                <select {...register('stage')} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30">
                  {CRM_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            )}
            {actionType === 'send_email' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                  Requer Gmail conectado em <strong>Configurações → Integrações</strong>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Assunto do e-mail</label>
                  <input {...register('emailSubject')} placeholder="Ex: Seguimento do nosso contato" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Corpo do e-mail</label>
                  <textarea {...register('emailBody')} rows={4} placeholder="Olá! Notamos que você entrou em contato conosco e gostaríamos de retomar a conversa..." className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            )}
            {actionType === 'create_calendar_event' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                  Requer Google Calendar conectado em <strong>Configurações → Integrações</strong>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Título do evento</label>
                  <input {...register('calendarTitle')} placeholder="Ex: Reunião de onboarding" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Duração (minutos)</label>
                  <input type="number" min={15} max={480} {...register('calendarDuration', { valueAsNumber: true })} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            )}
            {actionType === 'send_webhook' && (
              <div>
                <label className="mb-1 block text-xs font-medium">URL do webhook</label>
                <input {...register('webhookUrl')} placeholder="https://seu-sistema.com.br/webhook" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                <p className="mt-0.5 text-xs text-muted-foreground">Receberá um POST com dados do contato e da conversa</p>
              </div>
            )}
            {actionType === 'wait' && (
              <div>
                <label className="mb-1 block text-xs font-medium">Aguardar quantos minutos?</label>
                <input type="number" min={1} max={10080} {...register('waitMinutes', { valueAsNumber: true })} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                <p className="mt-0.5 text-xs text-muted-foreground">Útil para sequências de mensagens espaçadas no tempo</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={isSaving} className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60">
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editing ? 'Salvar' : 'Criar automação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
