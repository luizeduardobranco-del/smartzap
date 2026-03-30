'use client'

import { useState, useRef, useCallback } from 'react'
import { X, Plus, Phone, MessageSquare, Edit2, Check, Pencil, Save, ChevronDown, ChevronUp } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

// ─── Stage config ───────────────────────────────────────────────────────────

const STAGES = [
  { id: 'new',        label: 'Novo Lead',    headerClass: 'bg-blue-50 border-blue-200',    dotClass: 'bg-blue-500',    countClass: 'bg-blue-100 text-blue-700' },
  { id: 'contacted',  label: 'Em Contato',   headerClass: 'bg-yellow-50 border-yellow-200', dotClass: 'bg-yellow-500',  countClass: 'bg-yellow-100 text-yellow-700' },
  { id: 'qualified',  label: 'Qualificado',  headerClass: 'bg-purple-50 border-purple-200', dotClass: 'bg-purple-500',  countClass: 'bg-purple-100 text-purple-700' },
  { id: 'proposal',   label: 'Proposta',     headerClass: 'bg-orange-50 border-orange-200', dotClass: 'bg-orange-500',  countClass: 'bg-orange-100 text-orange-700' },
  { id: 'won',        label: 'Fechado',      headerClass: 'bg-green-50 border-green-200',   dotClass: 'bg-green-500',   countClass: 'bg-green-100 text-green-700' },
  { id: 'lost',       label: 'Perdido',      headerClass: 'bg-red-50 border-red-200',       dotClass: 'bg-red-500',     countClass: 'bg-red-100 text-red-700' },
] as const

type StageId = (typeof STAGES)[number]['id']

// ─── Tag config ─────────────────────────────────────────────────────────────

const PRESET_TAGS = [
  { label: 'Hot Lead',    class: 'bg-red-100 text-red-700 border-red-200' },
  { label: 'Cold Lead',   class: 'bg-slate-100 text-slate-600 border-slate-200' },
  { label: 'VIP',         class: 'bg-amber-100 text-amber-700 border-amber-200' },
  { label: 'Suporte',     class: 'bg-blue-100 text-blue-700 border-blue-200' },
  { label: 'Venda',       class: 'bg-green-100 text-green-700 border-green-200' },
  { label: 'Reclamação',  class: 'bg-orange-100 text-orange-700 border-orange-200' },
  { label: 'Parceiro',    class: 'bg-purple-100 text-purple-700 border-purple-200' },
  { label: 'Inativo',     class: 'bg-gray-100 text-gray-500 border-gray-200' },
]

function getTagClass(tag: string) {
  return PRESET_TAGS.find((t) => t.label === tag)?.class ?? 'bg-indigo-100 text-indigo-700 border-indigo-200'
}

const CHANNEL_EMOJI: Record<string, string> = {
  whatsapp: '📱',
  instagram: '📸',
  widget: '💬',
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  return `${Math.floor(days / 30)}m`
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Lead {
  id: string
  name: string | null
  phone: string | null
  channel_type: string | null
  kanban_stage: string | null
  tags: string[] | null
  created_at: string
  conversations: { id: string; last_message_at: string | null; status: string; mode: string; agents: { id: string; name: string }[] | null }[]
}

// ─── Card Detail Modal ───────────────────────────────────────────────────────

function LeadModal({
  lead,
  lists,
  onClose,
}: {
  lead: Lead
  lists: { id: string; name: string }[]
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(lead.name ?? '')
  const [customTag, setCustomTag] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [editingContact, setEditingContact] = useState(false)
  const [editFields, setEditFields] = useState({
    phone: lead.phone ?? '',
    company_name: '',
    address: '',
    website: '',
    specialties: '',
  })

  // Local optimistic state
  const [localStage, setLocalStage] = useState<StageId>((lead.kanban_stage ?? 'new') as StageId)
  const [localTags, setLocalTags] = useState<string[]>(lead.tags ?? [])

  const currentTags = localTags.filter((t) => !t.startsWith('_list:'))
  const currentStage = localStage
  const stageConfig = STAGES.find((s) => s.id === currentStage) ?? STAGES[0]

  // Resolve list tags to names
  const listTags = localTags
    .filter((t) => t.startsWith('_list:'))
    .map((t) => {
      const id = t.replace('_list:', '')
      const list = lists.find((l) => l.id === id)
      return list?.name ?? null
    })
    .filter(Boolean) as string[]

  const latestConv = lead.conversations
    .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))
    .at(0)

  const updateStage = trpc.crm.updateStage.useMutation({
    onMutate: ({ stage }) => setLocalStage(stage as StageId),
    onError: () => setLocalStage((lead.kanban_stage ?? 'new') as StageId),
    onSettled: () => utils.crm.listLeads.invalidate(),
  })
  const updateTags = trpc.crm.updateTags.useMutation({
    onMutate: ({ tags }) => setLocalTags(tags),
    onError: () => setLocalTags(lead.tags ?? []),
    onSettled: () => utils.crm.listLeads.invalidate(),
  })
  const updateName = trpc.crm.updateName.useMutation({
    onSuccess: () => { utils.crm.listLeads.invalidate(); setEditingName(false) },
  })
  const updateContact = trpc.crm.updateContact.useMutation({
    onSuccess: () => { utils.crm.listLeads.invalidate(); setEditingContact(false) },
  })

  const toggleTag = (tag: string) => {
    const allTags = lead.tags ?? []
    const listTagsRaw = allTags.filter((t) => t.startsWith('_list:'))
    const userTags = allTags.filter((t) => !t.startsWith('_list:'))
    const newUserTags = userTags.includes(tag)
      ? userTags.filter((t) => t !== tag)
      : [...userTags, tag]
    updateTags.mutate({ contactId: lead.id, tags: [...newUserTags, ...listTagsRaw] })
  }

  const addCustomTag = () => {
    const t = customTag.trim()
    if (!t || currentTags.includes(t)) return
    const listTagsRaw = (lead.tags ?? []).filter((t) => t.startsWith('_list:'))
    updateTags.mutate({ contactId: lead.id, tags: [...currentTags, t, ...listTagsRaw] })
    setCustomTag('')
    setShowCustomInput(false)
  }

  const saveContact = () => {
    updateContact.mutate({
      contactId: lead.id,
      phone: editFields.phone || undefined,
      company_name: editFields.company_name || undefined,
      address: editFields.address || undefined,
      website: editFields.website || undefined,
      specialties: editFields.specialties || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
              {(lead.name ?? lead.phone ?? '?').charAt(0).toUpperCase()}
            </div>
            <div>
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && updateName.mutate({ contactId: lead.id, name: nameInput })}
                    className="rounded border px-2 py-0.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/30"
                    autoFocus
                  />
                  <button onClick={() => updateName.mutate({ contactId: lead.id, name: nameInput })} className="text-primary">
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold">{lead.name ?? lead.phone ?? 'Sem nome'}</p>
                  <button onClick={() => setEditingName(true)} className="text-muted-foreground hover:text-foreground">
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {lead.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {lead.phone}
                  </span>
                )}
                {lead.channel_type && (
                  <span>{CHANNEL_EMOJI[lead.channel_type] ?? '💬'} {lead.channel_type}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditingContact(!editingContact)}
              title="Editar contato"
              className={`rounded-lg p-1.5 transition-colors ${editingContact ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground'}`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Edit contact form */}
        {editingContact && (
          <div className="border-b bg-blue-50/50 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Editar dados do contato</p>
            {[
              { key: 'phone', label: 'Telefone' },
              { key: 'company_name', label: 'Empresa' },
              { key: 'address', label: 'Endereço' },
              { key: 'website', label: 'Website' },
              { key: 'specialties', label: 'Especialidades / Obs.' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="mb-0.5 block text-xs font-medium text-muted-foreground">{label}</label>
                <input
                  value={editFields[key as keyof typeof editFields]}
                  onChange={(e) => setEditFields((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={`${label}...`}
                  className="w-full rounded-lg border bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingContact(false)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
                Cancelar
              </button>
              <button
                onClick={saveContact}
                disabled={updateContact.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                Salvar
              </button>
            </div>
          </div>
        )}

        {/* List badges */}
        {listTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b px-5 py-2">
            {listTags.map((name) => (
              <span key={name} className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                📋 {name}
              </span>
            ))}
          </div>
        )}

        {/* Collapsible details */}
        <button
          onClick={() => setDetailsOpen(!detailsOpen)}
          className="flex w-full items-center justify-between px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/30 transition-colors"
        >
          Detalhes do lead
          {detailsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {detailsOpen && (
          <div className="space-y-5 px-5 pb-5">
            {/* Stage selector */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Estágio</p>
              <div className="grid grid-cols-3 gap-1.5">
                {STAGES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => updateStage.mutate({ contactId: lead.id, stage: s.id })}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
                      currentStage === s.id
                        ? s.headerClass + ' border-current shadow-sm'
                        : 'border-transparent hover:bg-muted/50'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${s.dotClass}`} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_TAGS.map((t) => {
                  const active = currentTags.includes(t.label)
                  return (
                    <button
                      key={t.label}
                      onClick={() => toggleTag(t.label)}
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
                        active ? t.class : 'border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground'
                      }`}
                    >
                      {active && '✓ '}{t.label}
                    </button>
                  )
                })}
                {/* Custom tags already added */}
                {currentTags
                  .filter((t) => !PRESET_TAGS.find((p) => p.label === t))
                  .map((t) => (
                    <button
                      key={t}
                      onClick={() => toggleTag(t)}
                      className="rounded-full border border-indigo-200 bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
                    >
                      ✓ {t}
                    </button>
                  ))}
                {/* Add custom */}
                {showCustomInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={customTag}
                      onChange={(e) => setCustomTag(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
                      placeholder="Nova tag..."
                      className="w-24 rounded-full border px-2.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                      autoFocus
                    />
                    <button onClick={addCustomTag} className="text-primary">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setShowCustomInput(false)} className="text-muted-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCustomInput(true)}
                    className="flex items-center gap-0.5 rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                  >
                    <Plus className="h-3 w-3" />
                    Tag
                  </button>
                )}
              </div>
            </div>

            {/* Conversation info */}
            {latestConv && (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Última conversa</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {(Array.isArray(latestConv.agents) ? latestConv.agents[0]?.name : (latestConv.agents as any)?.name) ?? 'Sem agente'} ·{' '}
                    {latestConv.mode === 'ai' ? '🤖 IA' : '👤 Humano'}
                  </span>
                  <span className="text-muted-foreground">
                    {latestConv.last_message_at ? timeAgo(latestConv.last_message_at) : '—'}
                  </span>
                </div>
              </div>
            )}

            {/* Link to conversation */}
            {lead.id && (
              <a
                href={`/conversations/${lead.id}`}
                className="flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                <MessageSquare className="h-4 w-4" />
                Ver conversa completa
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Lead Card ───────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  lists,
  onDragStart,
  onClick,
}: {
  lead: Lead
  lists: { id: string; name: string }[]
  onDragStart: (e: React.DragEvent) => void
  onClick: () => void
}) {
  // Separate user tags from list/campaign tags
  const allTags: string[] = lead.tags ?? []
  const userTags = allTags.filter((t) => !t.startsWith('_list:'))
  const listNames = allTags
    .filter((t) => t.startsWith('_list:'))
    .map((t) => lists.find((l) => l.id === t.replace('_list:', ''))?.name)
    .filter(Boolean) as string[]

  const displayTags = userTags.slice(0, 2)
  const displayLists = listNames.slice(0, 1)
  const extraCount = userTags.length + listNames.length - displayTags.length - displayLists.length

  const latestConv = lead.conversations
    .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''))
    .at(0)

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="cursor-pointer rounded-xl border bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md active:opacity-70 select-none"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {(lead.name ?? lead.phone ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {lead.name ?? lead.phone ?? 'Sem nome'}
            </p>
            {lead.name && lead.phone && (
              <p className="truncate text-xs text-muted-foreground">{lead.phone}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {lead.channel_type && (
            <span className="text-sm" title={lead.channel_type}>
              {CHANNEL_EMOJI[lead.channel_type] ?? '💬'}
            </span>
          )}
        </div>
      </div>

      {(displayTags.length > 0 || displayLists.length > 0) && (
        <div className="mb-2 flex flex-wrap gap-1">
          {displayTags.map((tag) => (
            <span
              key={tag}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getTagClass(tag)}`}
            >
              {tag}
            </span>
          ))}
          {displayLists.map((name) => (
            <span
              key={name}
              className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600"
            >
              📋 {name}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
              +{extraCount}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{Array.isArray(latestConv?.agents) ? latestConv.agents[0]?.name : (latestConv?.agents as any)?.name ?? '—'}</span>
        <span>
          {latestConv?.last_message_at
            ? timeAgo(latestConv.last_message_at)
            : timeAgo(lead.created_at)}
        </span>
      </div>
    </div>
  )
}

// ─── Kanban Column ───────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  label,
  leads,
  lists,
  onDrop,
  onCardClick,
  onRenameLabel,
}: {
  stage: (typeof STAGES)[number]
  label: string
  leads: Lead[]
  lists: { id: string; name: string }[]
  onDrop: (contactId: string, toStage: StageId) => void
  onCardClick: (lead: Lead) => void
  onRenameLabel: (stageId: string, newLabel: string) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(label)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setEditValue(label)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitEdit() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== label) onRenameLabel(stage.id, trimmed)
    setEditing(false)
  }

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border">
      {/* Sticky column header */}
      <div className={`group sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b px-4 py-3 ${stage.headerClass}`}>
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${stage.dotClass}`} />
          {editing ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
              className="flex-1 rounded border bg-white/80 px-1.5 py-0.5 text-sm font-semibold outline-none focus:ring-1 focus:ring-current"
              autoFocus
            />
          ) : (
            <span className="truncate text-sm font-semibold">{label}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!editing && (
            <button
              onClick={startEdit}
              title="Renomear coluna"
              className="hidden rounded p-0.5 text-current opacity-40 hover:opacity-100 group-hover:flex"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stage.countClass}`}>
            {leads.length}
          </span>
        </div>
      </div>

      {/* Drop zone — no overflow-y, parent board handles scroll */}
      <div
        className={`flex-1 space-y-2.5 p-3 transition-colors min-h-[120px] ${
          isDragOver ? 'bg-muted/40' : 'bg-muted/10'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragOver(false)
          const contactId = e.dataTransfer.getData('contactId')
          if (contactId) onDrop(contactId, stage.id)
        }}
      >
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            lists={lists}
            onDragStart={(e) => {
              e.dataTransfer.setData('contactId', lead.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onClick={() => onCardClick(lead)}
          />
        ))}
        {leads.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-lg border-2 border-dashed text-xs text-muted-foreground">
            Arraste um lead aqui
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Board ───────────────────────────────────────────────────────────────

export function KanbanBoard() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const utils = trpc.useUtils()

  const boardRef = useRef<HTMLDivElement>(null)
  const topScrollRef = useRef<HTMLDivElement>(null)
  const isSyncing = useRef(false)

  const syncFromTop = useCallback(() => {
    if (isSyncing.current) return
    isSyncing.current = true
    if (boardRef.current && topScrollRef.current) {
      boardRef.current.scrollLeft = topScrollRef.current.scrollLeft
    }
    isSyncing.current = false
  }, [])

  const syncFromBoard = useCallback(() => {
    if (isSyncing.current) return
    isSyncing.current = true
    if (boardRef.current && topScrollRef.current) {
      topScrollRef.current.scrollLeft = boardRef.current.scrollLeft
    }
    isSyncing.current = false
  }, [])

  const { data: leads = [], isLoading } = trpc.crm.listLeads.useQuery(
    {},
    { refetchInterval: 15000 }
  )

  // Load contact lists to resolve _list: tags to names
  const { data: lists = [] } = trpc.contacts.getLists.useQuery()
  const typedLists = (lists as any[]).map((l) => ({ id: l.id, name: l.name }))

  const { data: orgData } = trpc.settings.getOrg.useQuery()
  const savedLabels = (orgData?.settings as any)?.crmStages as Record<string, string> | undefined

  const [localLabels, setLocalLabels] = useState<Record<string, string>>({})
  const stageLabel = (stageId: string, defaultLabel: string) =>
    localLabels[stageId] ?? savedLabels?.[stageId] ?? defaultLabel

  const updateCrmStages = trpc.settings.updateCrmStages.useMutation()

  const handleRenameLabel = (stageId: string, newLabel: string) => {
    const updated = { ...savedLabels, ...localLabels, [stageId]: newLabel }
    setLocalLabels(updated)
    updateCrmStages.mutate({ stages: updated })
  }

  const updateStage = trpc.crm.updateStage.useMutation({
    onMutate: async ({ contactId, stage }) => {
      await utils.crm.listLeads.cancel()
      const prev = utils.crm.listLeads.getData({})
      utils.crm.listLeads.setData({}, (old) =>
        old?.map((l) => l.id === contactId ? { ...l, kanban_stage: stage } : l) ?? []
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.crm.listLeads.setData({}, ctx.prev)
    },
    onSettled: () => utils.crm.listLeads.invalidate(),
  })

  const handleDrop = (contactId: string, toStage: StageId) => {
    updateStage.mutate({ contactId, stage: toStage })
    if (selectedLead?.id === contactId) {
      setSelectedLead((prev) => prev ? { ...prev, kanban_stage: toStage } : prev)
    }
  }

  const leadsByStage = STAGES.reduce<Record<string, Lead[]>>((acc, s) => {
    acc[s.id] = (leads as unknown as Lead[]).filter((l) => (l.kanban_stage ?? 'new') === s.id)
    return acc
  }, {})

  const totalLeads = leads.length
  // board content width: 6 columns × (288px + 16px gap) - 16px last gap + padding
  const BOARD_CONTENT_WIDTH = STAGES.length * 288 + (STAGES.length - 1) * 16 + 32

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <>
      {/* Stats bar */}
      <div className="mb-4 flex items-center gap-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{totalLeads} leads</span>
        {STAGES.map((s) => {
          const count = leadsByStage[s.id]?.length ?? 0
          if (count === 0) return null
          return (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${s.dotClass}`} />
              {stageLabel(s.id, s.label)}: {count}
            </span>
          )
        })}
        <span className="ml-auto text-xs text-muted-foreground/60">
          Passe o mouse sobre a coluna e clique no lápis para renomear
        </span>
      </div>

      {/* Top horizontal scrollbar mirror */}
      <div
        ref={topScrollRef}
        className="overflow-x-auto overflow-y-hidden mb-1"
        style={{ height: 12 }}
        onScroll={syncFromTop}
      >
        <div style={{ width: BOARD_CONTENT_WIDTH, height: 1 }} />
      </div>

      {/* Board: direction rtl moves vertical scrollbar to left side */}
      <div
        ref={boardRef}
        style={{ direction: 'rtl', maxHeight: 'calc(100vh - 280px)' }}
        className="overflow-auto rounded-xl"
        onScroll={syncFromBoard}
      >
        {/* Reset direction so content is ltr */}
        <div style={{ direction: 'ltr' }} className="flex gap-4 pb-4 px-0.5 pt-0.5 min-w-max">
          {STAGES.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              label={stageLabel(stage.id, stage.label)}
              leads={leadsByStage[stage.id] ?? []}
              lists={typedLists}
              onDrop={handleDrop}
              onCardClick={setSelectedLead}
              onRenameLabel={handleRenameLabel}
            />
          ))}
        </div>
      </div>

      {/* Detail modal */}
      {selectedLead && (
        <LeadModal
          lead={
            (leads as unknown as Lead[]).find((l) => l.id === selectedLead.id) ?? selectedLead
          }
          lists={typedLists}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </>
  )
}
