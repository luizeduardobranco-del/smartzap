'use client'

import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import {
  ArrowLeft, Plus, Settings, Trash2, Loader2, X, Check,
  GripVertical, UserPlus, Pause, Play, ChevronDown, ChevronUp,
  Clock, MessageSquare, Image, Volume2, Pencil, HelpCircle,
} from 'lucide-react'
import Link from 'next/link'
import { FunnelHelpModal } from '@/components/funnels/FunnelHelpModal'

type StageMessage = { type: 'text' | 'image' | 'audio'; content: string; delay_minutes: number }

export default function FunnelDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const utils = trpc.useUtils()

  const { data: funnel, isLoading } = trpc.funnels.get.useQuery({ id })
  const { data: channels } = trpc.channels.list.useQuery()

  const [editingStageId, setEditingStageId] = useState<string | null>(null)
  const [addingContact, setAddingContact] = useState<string | null>(null) // stageId
  const [contactSearch, setContactSearch] = useState('')
  const [renamingFunnel, setRenamingFunnel] = useState(false)
  const [newFunnelName, setNewFunnelName] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  const moveMutation = trpc.funnels.moveContact.useMutation({ onSuccess: () => utils.funnels.get.invalidate({ id }) })
  const removeContactMutation = trpc.funnels.removeContact.useMutation({ onSuccess: () => utils.funnels.get.invalidate({ id }) })
  const toggleStatusMutation = trpc.funnels.toggleContactStatus.useMutation({ onSuccess: () => utils.funnels.get.invalidate({ id }) })
  const addContactMutation = trpc.funnels.addContact.useMutation({ onSuccess: () => { utils.funnels.get.invalidate({ id }); setAddingContact(null); setContactSearch('') } })
  const deleteStage = trpc.funnels.deleteStage.useMutation({ onSuccess: () => utils.funnels.get.invalidate({ id }) })
  const updateFunnel = trpc.funnels.update.useMutation({ onSuccess: () => { utils.funnels.get.invalidate({ id }); utils.funnels.list.invalidate(); setRenamingFunnel(false) } })
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

  return (
    <div className="flex h-full flex-col">
      {showHelp && <FunnelHelpModal onClose={() => setShowHelp(false)} />}

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

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex h-full gap-4 p-6" style={{ minWidth: `${stages.length * 280 + 48}px` }}>
          {stages.map((stage: any, stageIdx: number) => {
            const stageContacts = contactsForStage(stage.id)
            const isEditing = editingStageId === stage.id

            return (
              <div key={stage.id} className="flex w-64 flex-shrink-0 flex-col rounded-xl border bg-slate-50/80">
                {/* Stage header */}
                <div
                  className="flex items-center gap-2 rounded-t-xl px-3 py-2.5"
                  style={{ borderTop: `3px solid ${stage.color}` }}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
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

                {/* Contacts */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {stageContacts.map((fc: any) => (
                    <ContactCard
                      key={fc.id}
                      fc={fc}
                      stages={stages}
                      onMove={(newStageId) => moveMutation.mutate({ contactFunnelId: fc.id, newStageId })}
                      onRemove={() => removeContactMutation.mutate({ contactFunnelId: fc.id })}
                      onToggle={() => toggleStatusMutation.mutate({ contactFunnelId: fc.id })}
                    />
                  ))}
                </div>

                {/* Add contact button */}
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

          {/* Add stage button */}
          <button
            onClick={() => createStage.mutate({ funnelId: id, name: 'Nova etapa' })}
            className="flex h-12 w-52 flex-shrink-0 items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 text-sm font-medium text-slate-400 hover:border-primary hover:text-primary transition-colors self-start"
          >
            <Plus className="h-4 w-4" />
            Nova etapa
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Stage Editor ───────────────────────────────────────────────────────────
function StageEditor({ stage, funnelId, onClose, onDelete }: {
  stage: any; funnelId: string; onClose: () => void; onDelete: () => void
}) {
  const utils = trpc.useUtils()
  const [name, setName] = useState(stage.name)
  const [color, setColor] = useState(stage.color)
  const [messages, setMessages] = useState<StageMessage[]>(stage.messages ?? [])
  const [saving, setSaving] = useState(false)

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

  function handleSave() {
    updateStage.mutate({ id: stage.id, name, color, messages })
  }

  return (
    <div className="border-b bg-white p-3 space-y-3">
      {/* Name */}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Nome da etapa</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Color */}
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

      {/* Messages */}
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

      {/* Actions */}
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
          onClick={handleSave}
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

// ── Contact Card ───────────────────────────────────────────────────────────
function ContactCard({ fc, stages, onMove, onRemove, onToggle }: {
  fc: any; stages: any[]; onMove: (stageId: string) => void
  onRemove: () => void; onToggle: () => void
}) {
  const [showMoveMenu, setShowMoveMenu] = useState(false)
  const contact = fc.contacts as any
  const name = contact?.name ?? contact?.phone ?? 'Contato'
  const phone = contact?.phone
  const isPaused = fc.status === 'paused'
  const isWaiting = fc.status === 'waiting'

  const timeInStage = fc.entered_stage_at
    ? formatTimeAgo(new Date(fc.entered_stage_at))
    : ''

  return (
    <div className={`rounded-xl border bg-white p-3 shadow-sm hover:shadow-md transition-all ${isPaused ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
          {name[0].toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-800 truncate">{name}</p>
          {phone && <p className="text-xs text-slate-400 truncate">{phone}</p>}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
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

      {/* Actions */}
      <div className="mt-2 flex items-center gap-1 border-t pt-2">
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
            <GripVertical className="h-3.5 w-3.5 text-slate-500" />
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
