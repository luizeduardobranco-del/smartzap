'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import {
  ArrowLeft, Plus, Settings, Trash2, Loader2, X, Check,
  GripVertical, UserPlus, Pause, Play, ChevronDown, ChevronUp,
  Clock, MessageSquare, Image, Volume2, Pencil, HelpCircle, Bot, UserCheck,
  Tag, Phone, Edit2, Save,
} from 'lucide-react'
import Link from 'next/link'
import { FunnelHelpModal } from '@/components/funnels/FunnelHelpModal'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type StageMessage = { type: 'text' | 'image' | 'audio'; content: string; delay_minutes: number }

// ─── Tag / Stage config ────────────────────────────────────────────────────
const PRESET_TAGS = [
  { label: 'Hot Lead',   cls: 'bg-red-100 text-red-700 border-red-200' },
  { label: 'Cold Lead',  cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  { label: 'VIP',        cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  { label: 'Suporte',    cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  { label: 'Venda',      cls: 'bg-green-100 text-green-700 border-green-200' },
  { label: 'Reclamação', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  { label: 'Parceiro',   cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  { label: 'Inativo',    cls: 'bg-gray-100 text-gray-500 border-gray-200' },
]

const CRM_STAGES = [
  { id: 'new',       label: 'Novo Lead',   color: 'bg-blue-500' },
  { id: 'contacted', label: 'Em Contato',  color: 'bg-yellow-500' },
  { id: 'qualified', label: 'Qualificado', color: 'bg-purple-500' },
  { id: 'proposal',  label: 'Proposta',    color: 'bg-orange-500' },
  { id: 'won',       label: 'Fechado',     color: 'bg-green-500' },
  { id: 'lost',      label: 'Perdido',     color: 'bg-red-500' },
]

function getTagCls(tag: string) {
  return PRESET_TAGS.find((t) => t.label === tag)?.cls ?? 'bg-indigo-100 text-indigo-700 border-indigo-200'
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function FunnelDetailPage() {
  const { id } = useParams<{ id: string }>()
  const utils = trpc.useUtils()

  const { data: funnel, isLoading } = trpc.funnels.get.useQuery({ id })

  const [editingStageId, setEditingStageId] = useState<string | null>(null)
  const [addingContact, setAddingContact] = useState<string | null>(null)
  const [contactSearch, setContactSearch] = useState('')
  const [renamingFunnel, setRenamingFunnel] = useState(false)
  const [newFunnelName, setNewFunnelName] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [selectedContact, setSelectedContact] = useState<{ fc: any; contact: any } | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const moveMutation = trpc.funnels.moveContact.useMutation({ onSuccess: () => utils.funnels.get.invalidate({ id }) })
  const removeContactMutation = trpc.funnels.removeContact.useMutation({ onSuccess: () => utils.funnels.get.invalidate({ id }) })
  const toggleStatusMutation = trpc.funnels.toggleContactStatus.useMutation({ onSuccess: () => utils.funnels.get.invalidate({ id }) })
  const addContactMutation = trpc.funnels.addContact.useMutation({
    onSuccess: () => { utils.funnels.get.invalidate({ id }); setAddingContact(null); setContactSearch('') },
  })
  const deleteStage = trpc.funnels.deleteStage.useMutation({ onSuccess: () => utils.funnels.get.invalidate({ id }) })
  const updateFunnel = trpc.funnels.update.useMutation({
    onSuccess: () => { utils.funnels.get.invalidate({ id }); utils.funnels.list.invalidate(); setRenamingFunnel(false) },
  })
  const createStage = trpc.funnels.createStage.useMutation({ onSuccess: () => utils.funnels.get.invalidate({ id }) })

  const { data: contacts } = trpc.contacts.list.useQuery(
    { search: contactSearch },
    { enabled: !!addingContact }
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!funnel) {
    return (
      <div className="p-6 text-center text-slate-500">
        Funil não encontrado.{' '}
        <Link href="/funnels" className="text-primary hover:underline">Voltar</Link>
      </div>
    )
  }

  const stages = [...(funnel.funnel_stages ?? [])].sort((a: any, b: any) => a.position - b.position)
  const allContacts = funnel.contacts ?? []

  function contactsForStage(stageId: string) {
    return allContacts.filter((c: any) => c.stage_id === stageId)
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    // active.id = fc.id (funnel_contact id), over.id could be a stage id or another fc.id
    const draggedFcId = active.id as string

    // Try to find the target stage id
    // If dropped on a stage column (over.id is a stage id), move there
    // If dropped on another card, find which stage that card is in
    const isStage = stages.some((s: any) => s.id === over.id)
    if (isStage) {
      moveMutation.mutate({ contactFunnelId: draggedFcId, newStageId: over.id as string })
      return
    }

    // Dropped on another contact card — find its stage
    const targetFc = allContacts.find((c: any) => c.id === over.id)
    if (targetFc) {
      moveMutation.mutate({ contactFunnelId: draggedFcId, newStageId: targetFc.stage_id })
    }
  }

  const activeFc = activeId ? allContacts.find((c: any) => c.id === activeId) : null

  return (
    <div className="flex h-full flex-col">
      {showHelp && <FunnelHelpModal onClose={() => setShowHelp(false)} />}

      {/* Contact detail modal */}
      {selectedContact && (
        <ContactDetailModal
          fc={selectedContact.fc}
          contact={selectedContact.contact}
          funnelStages={stages}
          onMove={(newStageId) => {
            moveMutation.mutate({ contactFunnelId: selectedContact.fc.id, newStageId })
            setSelectedContact((prev) => prev ? { ...prev, fc: { ...prev.fc, stage_id: newStageId } } : null)
          }}
          onRemove={() => { removeContactMutation.mutate({ contactFunnelId: selectedContact.fc.id }); setSelectedContact(null) }}
          onClose={() => setSelectedContact(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 border-b bg-white px-6 py-4">
        <Link href="/funnels" className="rounded-lg p-1.5 hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>

        {renamingFunnel ? (
          <form
            onSubmit={(e) => { e.preventDefault(); updateFunnel.mutate({ id, name: newFunnelName }) }}
            className="flex items-center gap-2"
          >
            <input
              autoFocus
              value={newFunnelName}
              onChange={(e) => setNewFunnelName(e.target.value)}
              className="rounded-lg border px-2 py-1 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary"
            />
            <button type="submit" className="rounded p-1 hover:bg-muted"><Check className="h-4 w-4 text-primary" /></button>
            <button type="button" onClick={() => setRenamingFunnel(false)} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
          </form>
        ) : (
          <button
            onClick={() => { setNewFunnelName(funnel.name); setRenamingFunnel(true) }}
            className="flex items-center gap-1.5 text-lg font-bold text-slate-900 hover:text-primary transition-colors"
          >
            {funnel.name}
            <Pencil className="h-3.5 w-3.5 opacity-40" />
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">{allContacts.length} leads · {stages.length} etapas</span>
          <button
            onClick={() => setShowHelp(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border text-slate-400 hover:bg-muted hover:text-slate-600 transition-colors"
            title="Como funciona"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <button
            onClick={() => createStage.mutate({ funnelId: id, name: 'Nova etapa' })}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
            Etapa
          </button>
        </div>
      </div>

      {/* Kanban board with DnD */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto">
          <div className="flex h-full gap-4 p-6" style={{ minWidth: `${stages.length * 280 + 48}px` }}>
            {stages.map((stage: any) => {
              const stageContacts = contactsForStage(stage.id)
              const isEditing = editingStageId === stage.id

              return (
                <div key={stage.id} className="flex w-64 flex-shrink-0 flex-col rounded-xl border bg-slate-50/80">
                  {/* Stage header */}
                  <div
                    className="flex items-center gap-2 rounded-t-xl px-3 py-2.5"
                    style={{ borderTop: `3px solid ${stage.color}` }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                    <span className="flex-1 text-sm font-semibold text-slate-800 truncate">{stage.name}</span>
                    <span className="text-xs font-medium text-slate-400">{stageContacts.length}</span>
                    <button
                      onClick={() => setEditingStageId(isEditing ? null : stage.id)}
                      className="rounded p-0.5 hover:bg-slate-200 transition-colors"
                    >
                      <Settings className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  </div>

                  {/* Stage settings panel */}
                  {isEditing && (
                    <StageEditor
                      stage={stage}
                      funnelId={id}
                      onClose={() => setEditingStageId(null)}
                      onDelete={() => {
                        if (confirm(`Excluir etapa "${stage.name}"? Os leads serão removidos do funil.`)) {
                          deleteStage.mutate({ id: stage.id })
                          setEditingStageId(null)
                        }
                      }}
                    />
                  )}

                  {/* Drop zone — stage id as droppable */}
                  <SortableContext
                    items={stageContacts.map((fc: any) => fc.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px]">
                      {stageContacts.map((fc: any) => (
                        <SortableContactCard
                          key={fc.id}
                          fc={fc}
                          stages={stages}
                          onOpen={() => setSelectedContact({ fc, contact: fc.contacts })}
                          onMove={(newStageId) => moveMutation.mutate({ contactFunnelId: fc.id, newStageId })}
                          onRemove={() => removeContactMutation.mutate({ contactFunnelId: fc.id })}
                          onToggle={() => toggleStatusMutation.mutate({ contactFunnelId: fc.id })}
                        />
                      ))}
                    </div>
                  </SortableContext>

                  {/* Add contact */}
                  <div className="border-t p-2">
                    {addingContact === stage.id ? (
                      <div className="space-y-2">
                        <input
                          autoFocus
                          value={contactSearch}
                          onChange={(e) => setContactSearch(e.target.value)}
                          placeholder="Buscar contato..."
                          className="w-full rounded-lg border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary"
                        />
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {contacts?.contacts?.slice(0, 20).map((c: any) => (
                            <button
                              key={c.id}
                              onClick={() => addContactMutation.mutate({
                                funnelId: id,
                                stageId: stage.id,
                                contactId: c.id,
                                channelId: funnel.channel_id ?? undefined,
                              })}
                              disabled={addContactMutation.isPending}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-blue-50 transition-colors"
                            >
                              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                                {(c.name ?? c.phone ?? '?')[0].toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium truncate">{c.name ?? c.phone}</p>
                                {c.name && <p className="text-slate-400 truncate">{c.phone}</p>}
                              </div>
                            </button>
                          ))}
                          {contacts?.contacts?.length === 0 && (
                            <p className="py-2 text-center text-xs text-slate-400">Nenhum contato encontrado</p>
                          )}
                        </div>
                        <button
                          onClick={() => { setAddingContact(null); setContactSearch('') }}
                          className="w-full rounded-lg border py-1 text-xs text-slate-500 hover:bg-muted"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingContact(stage.id)}
                        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 transition-colors"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Adicionar lead
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Add stage */}
            <button
              onClick={() => createStage.mutate({ funnelId: id, name: 'Nova etapa' })}
              className="flex h-12 w-52 flex-shrink-0 items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 text-sm font-medium text-slate-400 hover:border-primary hover:text-primary transition-colors self-start"
            >
              <Plus className="h-4 w-4" />
              Nova etapa
            </button>
          </div>
        </div>

        {/* Drag overlay — ghost card */}
        <DragOverlay>
          {activeFc ? (
            <div className="rounded-xl border bg-white p-3 shadow-2xl opacity-90 w-60">
              <p className="text-xs font-semibold text-slate-800 truncate">
                {(activeFc.contacts as any)?.name ?? (activeFc.contacts as any)?.phone ?? 'Contato'}
              </p>
              <p className="text-xs text-slate-400 truncate">{(activeFc.contacts as any)?.phone}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

// ── Sortable contact card wrapper ───────────────────────────────────────────
function SortableContactCard(props: {
  fc: any; stages: any[]; onOpen: () => void
  onMove: (stageId: string) => void; onRemove: () => void; onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.fc.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <ContactCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  )
}

// ── Stage Editor ────────────────────────────────────────────────────────────
function StageEditor({ stage, funnelId, onClose, onDelete }: {
  stage: any; funnelId: string; onClose: () => void; onDelete: () => void
}) {
  const utils = trpc.useUtils()
  const [name, setName] = useState(stage.name)
  const [color, setColor] = useState(stage.color)
  const [messages, setMessages] = useState<StageMessage[]>(stage.messages ?? [])

  const updateStage = trpc.funnels.updateStage.useMutation({
    onSuccess: () => { utils.funnels.get.invalidate({ id: funnelId }); onClose() },
  })

  const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#f97316', '#6366f1']

  function addMessage() {
    setMessages((prev) => [...prev, { type: 'text', content: '', delay_minutes: 0 }])
  }

  function removeMessage(idx: number) {
    setMessages((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateMessage(idx: number, patch: Partial<StageMessage>) {
    setMessages((prev) => prev.map((m, i) => i === idx ? { ...m, ...patch } : m))
  }

  return (
    <div className="border-b bg-white p-3 space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Nome da etapa</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Cor</label>
        <div className="flex flex-wrap gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${color === c ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : ''}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-slate-500">Sequência de mensagens</label>
          <button onClick={addMessage} className="text-xs text-primary hover:underline">+ Adicionar</button>
        </div>
        <div className="space-y-2">
          {messages.map((msg, idx) => (
            <div key={idx} className="rounded-lg border bg-slate-50 p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <select
                  value={msg.type}
                  onChange={(e) => updateMessage(idx, { type: e.target.value as any })}
                  className="rounded border px-1.5 py-1 text-xs outline-none"
                >
                  <option value="text">Texto</option>
                  <option value="image">Imagem (URL)</option>
                  <option value="audio">Áudio (URL)</option>
                </select>
                <div className="flex items-center gap-1 rounded border bg-white px-1.5 py-1 text-xs">
                  <Clock className="h-3 w-3 text-slate-400" />
                  <input
                    type="number"
                    min={0}
                    value={msg.delay_minutes}
                    onChange={(e) => updateMessage(idx, { delay_minutes: parseInt(e.target.value) || 0 })}
                    className="w-12 outline-none text-xs"
                  />
                  <span className="text-slate-400">min</span>
                </div>
                <button onClick={() => removeMessage(idx)} className="ml-auto text-slate-400 hover:text-red-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                value={msg.content}
                onChange={(e) => updateMessage(idx, { content: e.target.value })}
                placeholder={msg.type === 'text' ? 'Olá {nome}, vi que você se interessou...' : 'https://...'}
                rows={msg.type === 'text' ? 2 : 1}
                className="w-full resize-none rounded border bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          ))}
          {messages.length === 0 && (
            <p className="py-2 text-center text-xs text-slate-400">Nenhuma mensagem — leads entram sem disparo automático</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-1 border-t">
        <button
          onClick={onDelete}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Excluir etapa
        </button>
        <div className="flex-1" />
        <button onClick={onClose} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">Cancelar</button>
        <button
          onClick={() => updateStage.mutate({ id: stage.id, name, color, messages })}
          disabled={updateStage.isPending}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {updateStage.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Salvar
        </button>
      </div>
    </div>
  )
}

// ── Contact Card ────────────────────────────────────────────────────────────
function ContactCard({ fc, stages, onOpen, onMove, onRemove, onToggle, dragHandleProps }: {
  fc: any; stages: any[]; onOpen: () => void
  onMove: (stageId: string) => void; onRemove: () => void; onToggle: () => void
  dragHandleProps?: Record<string, any>
}) {
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const contact = fc.contacts as any
  const name = contact?.name ?? contact?.phone ?? 'Contato'
  const phone = contact?.phone
  const isPaused = fc.status === 'paused'
  const isWaiting = fc.status === 'waiting'
  const timeInStage = fc.entered_stage_at ? formatTimeAgo(new Date(fc.entered_stage_at)) : ''
  const tags: string[] = (contact?.tags ?? []).filter((t: string) => !t.startsWith('_list:'))

  return (
    <div
      className={`rounded-xl border bg-white p-3 shadow-sm hover:shadow-md transition-all cursor-pointer ${isPaused ? 'opacity-60' : ''}`}
      onClick={onOpen}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <button
          {...dragHandleProps}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 flex-shrink-0"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
          {name[0].toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-800 truncate">{name}</p>
          {phone && <p className="text-xs text-slate-400 truncate">{phone}</p>}
        </div>
      </div>

      {/* Tags preview */}
      {tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {tags.slice(0, 3).map((t) => (
            <span key={t} className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${getTagCls(t)}`}>
              {t}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500">
              +{tags.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        {timeInStage && (
          <span className="flex items-center gap-0.5 text-xs text-slate-400">
            <Clock className="h-3 w-3" />
            {timeInStage}
          </span>
        )}
        {isWaiting && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
            Aguardando
          </span>
        )}
        {isPaused && (
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">
            Pausado
          </span>
        )}
      </div>

      {/* Actions row */}
      <div className="mt-2 flex items-center gap-1 border-t pt-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onToggle}
          title={isPaused ? 'Retomar' : 'Pausar'}
          className="rounded p-1 hover:bg-slate-100 transition-colors"
        >
          {isPaused ? <Play className="h-3.5 w-3.5 text-slate-500" /> : <Pause className="h-3.5 w-3.5 text-slate-500" />}
        </button>

        <div className="relative">
          <button
            onClick={() => setShowMoveMenu(!showMoveMenu)}
            title="Mover para etapa"
            className="rounded p-1 hover:bg-slate-100 transition-colors"
          >
            <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
          </button>
          {showMoveMenu && (
            <div className="absolute left-0 top-7 z-20 w-44 rounded-xl border bg-white shadow-xl">
              <p className="px-3 py-2 text-xs font-semibold text-slate-500 border-b">Mover para</p>
              {stages.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { onMove(s.id); setShowMoveMenu(false) }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 transition-colors"
                >
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onOpen}
          title="Ver detalhes"
          className="rounded p-1 hover:bg-blue-50 transition-colors"
        >
          <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
        </button>

        <button
          onClick={() => { if (confirm('Remover lead do funil?')) onRemove() }}
          title="Remover do funil"
          className="ml-auto rounded p-1 hover:bg-red-50 hover:text-red-500 transition-colors"
        >
          <X className="h-3.5 w-3.5 text-slate-400" />
        </button>
      </div>
    </div>
  )
}

// ── Contact Detail Modal ─────────────────────────────────────────────────────
function ContactDetailModal({ fc, contact, funnelStages, onMove, onRemove, onClose }: {
  fc: any; contact: any; funnelStages: any[]
  onMove: (stageId: string) => void; onRemove: () => void; onClose: () => void
}) {
  const utils = trpc.useUtils()
  const [showConv, setShowConv] = useState(false)
  const [customTag, setCustomTag] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [localTags, setLocalTags] = useState<string[]>(contact?.tags ?? [])
  const [localCrmStage, setLocalCrmStage] = useState<string>(contact?.kanban_stage ?? 'new')

  const userTags = localTags.filter((t: string) => !t.startsWith('_list:'))
  const listTags = localTags.filter((t: string) => t.startsWith('_list:'))

  const name = contact?.name ?? contact?.phone ?? 'Contato'
  const phone = contact?.phone

  const updateTags = trpc.crm.updateTags.useMutation({
    onMutate: ({ tags }) => setLocalTags(tags),
    onError: () => setLocalTags(contact?.tags ?? []),
    onSettled: () => utils.crm.listLeads.invalidate(),
  })

  const updateStage = trpc.crm.updateStage.useMutation({
    onMutate: ({ stage }) => setLocalCrmStage(stage),
    onError: () => setLocalCrmStage(contact?.kanban_stage ?? 'new'),
    onSettled: () => utils.crm.listLeads.invalidate(),
  })

  function toggleTag(tag: string) {
    const newUserTags = userTags.includes(tag)
      ? userTags.filter((t) => t !== tag)
      : [...userTags, tag]
    updateTags.mutate({ contactId: contact.id, tags: [...newUserTags, ...listTags] })
  }

  function addCustomTag() {
    const t = customTag.trim()
    if (!t || userTags.includes(t)) return
    updateTags.mutate({ contactId: contact.id, tags: [...userTags, t, ...listTags] })
    setCustomTag('')
    setShowCustomInput(false)
  }

  const currentFunnelStage = funnelStages.find((s: any) => s.id === fc.stage_id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`w-full rounded-2xl bg-white shadow-2xl flex flex-col transition-all duration-200 ${
          showConv ? 'max-w-2xl h-[90vh]' : 'max-w-md max-h-[90vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Inline conversation */}
        {showConv && (
          <InlineConversation
            contactId={contact.id}
            contactName={name}
            onBack={() => setShowConv(false)}
            onClose={onClose}
          />
        )}

        <div className={showConv ? 'hidden' : 'overflow-y-auto flex-1 flex flex-col'}>
          {/* Header */}
          <div className="flex items-start justify-between border-b p-5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                {name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold">{name}</p>
                {phone && (
                  <p className="flex items-center gap-1 text-xs text-slate-500">
                    <Phone className="h-3 w-3" />
                    {phone}
                  </p>
                )}
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-5 space-y-5">
            {/* Funnel stage info */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Etapa no Funil</p>
              <div className="flex flex-wrap gap-2">
                {funnelStages.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => onMove(s.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      fc.stage_id === s.id
                        ? 'border-primary bg-primary text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            {/* CRM Stage */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Estágio no CRM</p>
              <div className="flex flex-wrap gap-2">
                {CRM_STAGES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => updateStage.mutate({ contactId: contact.id, stage: s.id as any })}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      localCrmStage === s.id
                        ? 'border-primary bg-primary text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${s.color}`} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tags</p>
                <button
                  onClick={() => setShowCustomInput(!showCustomInput)}
                  className="text-xs text-primary hover:underline"
                >
                  + Personalizada
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESET_TAGS.map((t) => {
                  const active = userTags.includes(t.label)
                  return (
                    <button
                      key={t.label}
                      onClick={() => toggleTag(t.label)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                        active ? t.cls + ' shadow-sm ring-1 ring-offset-1 ring-current' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
              {/* Custom tags */}
              {userTags.filter((t) => !PRESET_TAGS.map((p) => p.label).includes(t)).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {userTags
                    .filter((t) => !PRESET_TAGS.map((p) => p.label).includes(t))
                    .map((t) => (
                      <span key={t} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${getTagCls(t)}`}>
                        {t}
                        <button onClick={() => toggleTag(t)} className="opacity-60 hover:opacity-100">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                </div>
              )}
              {showCustomInput && (
                <div className="mt-2 flex gap-2">
                  <input
                    autoFocus
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
                    placeholder="Nome da tag..."
                    className="flex-1 rounded-lg border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button onClick={addCustomTag} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90">
                    Adicionar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex gap-2 border-t p-4 shrink-0">
            <button
              onClick={() => setShowConv(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/15 transition-colors"
            >
              <MessageSquare className="h-4 w-4" />
              Ver conversa
            </button>
            <button
              onClick={() => { if (confirm('Remover lead do funil?')) { onRemove() } }}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Remover
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Inline Conversation ──────────────────────────────────────────────────────
function InlineConversation({ contactId, contactName, onBack, onClose }: {
  contactId: string; contactName: string; onBack: () => void; onClose: () => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = trpc.conversations.getContactThread.useQuery(
    { contactId },
    { refetchInterval: 10000 }
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data?.messages])

  const messages = data?.messages ?? []

  function formatMsgTime(dateStr: string) {
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  }

  let lastDate = ''

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
        <button onClick={onBack} className="rounded-lg p-1.5 hover:bg-slate-100">
          <ArrowLeft className="h-4 w-4 text-slate-500" />
        </button>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {contactName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{contactName}</p>
          <p className="text-xs text-slate-400">
            {data?.conversations.length ?? 0} conversa{(data?.conversations.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
          <X className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Nenhuma mensagem ainda</p>
          </div>
        )}
        {messages.map((msg: any, i: number) => {
          const msgDate = new Date(msg.created_at).toLocaleDateString('pt-BR')
          const showDate = msgDate !== lastDate
          if (showDate) lastDate = msgDate
          const isUser = msg.role === 'user'
          const senderLabel =
            msg.sender_type === 'campaign' ? '📢 Campanha' :
            msg.sender_type === 'funnel' ? '🔀 Funil' :
            msg.sender_type === 'human' ? '👤 Humano' :
            '🤖 IA'

          return (
            <div key={msg.id ?? i}>
              {showDate && (
                <div className="flex justify-center my-3">
                  <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs text-slate-400">{msgDate}</span>
                </div>
              )}
              <div className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  isUser
                    ? 'bg-slate-100 text-slate-800 rounded-tl-sm'
                    : 'bg-primary text-white rounded-tr-sm'
                }`}>
                  {!isUser && (
                    <p className="mb-0.5 text-xs font-medium opacity-75">{senderLabel}</p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className={`mt-1 text-right text-xs ${isUser ? 'text-slate-400' : 'text-white/60'}`}>
                    {formatMsgTime(msg.created_at)}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d`
  if (hours > 0) return `${hours}h`
  if (mins > 0) return `${mins}min`
  return 'agora'
}
