'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import {
  MessageSquare, Loader2, Bot, UserCheck, ArrowLeft, Phone, CheckCheck,
  RefreshCw, Send, Lock, Tag, X, Plus, Check, GitBranch, ChevronDown, Filter,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

// ─── Constants ────────────────────────────────────────────────────────────────

const channelEmoji: Record<string, string> = { whatsapp: '📱', instagram: '📸', widget: '💬' }

const PRESET_TAGS = [
  { label: 'Hot Lead',      cls: 'bg-red-100 text-red-700 border-red-200' },
  { label: 'Cold Lead',     cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  { label: 'VIP',           cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  { label: 'Suporte',       cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  { label: 'Venda',         cls: 'bg-green-100 text-green-700 border-green-200' },
  { label: 'Reclamação',    cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  { label: 'Parceiro',      cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  { label: 'Inativo',       cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  { label: 'Sem interesse', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
]

const STAGES = [
  { id: 'new',       label: 'Novo Lead',   cls: 'bg-blue-100 text-blue-700' },
  { id: 'contacted', label: 'Em Contato',  cls: 'bg-yellow-100 text-yellow-700' },
  { id: 'qualified', label: 'Qualificado', cls: 'bg-purple-100 text-purple-700' },
  { id: 'proposal',  label: 'Proposta',    cls: 'bg-orange-100 text-orange-700' },
  { id: 'won',       label: 'Fechado',     cls: 'bg-green-100 text-green-700' },
  { id: 'lost',      label: 'Perdido',     cls: 'bg-red-100 text-red-700' },
] as const

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function timeStr(date: string) {
  return new Date(date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function dateDivider(date: string) {
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

// ─── Funnel Enrollment Modal ──────────────────────────────────────────────────

function FunnelEnrollModal({ contactId, channelId, onClose }: {
  contactId: string; channelId?: string; onClose: () => void
}) {
  const [selectedFunnel, setSelectedFunnel] = useState<string>('')
  const [selectedStage, setSelectedStage] = useState<string>('')
  const { data: funnels = [] } = trpc.funnels.list.useQuery()
  const addContact = trpc.funnels.addContact.useMutation({
    onSuccess: () => onClose(),
  })

  const stages = useMemo(() => {
    const f = (funnels as any[]).find((f: any) => f.id === selectedFunnel)
    return f?.funnel_stages?.slice().sort((a: any, b: any) => a.position - b.position) ?? []
  }, [funnels, selectedFunnel])

  function handleSubmit() {
    if (!selectedFunnel || !selectedStage) return
    addContact.mutate({ funnelId: selectedFunnel, stageId: selectedStage, contactId, channelId })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" />
            <p className="font-semibold text-sm">Adicionar ao Funil</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Funil</label>
            <select
              value={selectedFunnel}
              onChange={(e) => { setSelectedFunnel(e.target.value); setSelectedStage('') }}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Selecione um funil...</option>
              {(funnels as any[]).map((f: any) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {selectedFunnel && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Etapa</label>
              <div className="flex flex-wrap gap-1.5">
                {stages.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStage(s.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      selectedStage === s.id
                        ? 'bg-primary text-white border-primary'
                        : 'hover:border-primary hover:text-primary'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!selectedFunnel || !selectedStage || addContact.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {addContact.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Adicionar ao Funil
        </button>

        {addContact.isError && (
          <p className="text-center text-xs text-red-500">
            {(addContact.error as any)?.message ?? 'Erro ao adicionar'}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Contact Info Panel ───────────────────────────────────────────────────────

function ContactInfoPanel({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const utils = trpc.useUtils()
  const { data } = trpc.conversations.getContactThread.useQuery({ contactId })
  const [customTag, setCustomTag] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [localTags, setLocalTags] = useState<string[] | null>(null)
  const [localStage, setLocalStage] = useState<string | null>(null)
  const [showFunnelModal, setShowFunnelModal] = useState(false)

  const contact = data?.contact as any

  const updateTags = trpc.crm.updateTags.useMutation({
    onMutate: ({ tags }) => setLocalTags(tags),
    onError: () => setLocalTags(null),
    onSettled: () => utils.conversations.getContactThread.invalidate({ contactId }),
  })
  const updateStage = trpc.crm.updateStage.useMutation({
    onMutate: ({ stage }) => setLocalStage(stage),
    onError: () => setLocalStage(null),
    onSettled: () => utils.conversations.getContactThread.invalidate({ contactId }),
  })

  if (!contact) return null

  const currentTags = (localTags ?? contact.tags ?? []).filter((t: string) => !t.startsWith('_list:'))
  const currentStage = localStage ?? contact.kanban_stage ?? 'new'

  function toggleTag(tag: string) {
    const allTags: string[] = contact.tags ?? []
    const listTagsRaw = allTags.filter((t: string) => t.startsWith('_list:'))
    const userTags = (localTags ?? allTags).filter((t: string) => !t.startsWith('_list:'))
    const next = userTags.includes(tag) ? userTags.filter((t: string) => t !== tag) : [...userTags, tag]
    updateTags.mutate({ contactId, tags: [...next, ...listTagsRaw] })
  }

  function addCustomTag() {
    const t = customTag.trim()
    if (!t) return
    const allTags: string[] = contact.tags ?? []
    const listTagsRaw = allTags.filter((t: string) => t.startsWith('_list:'))
    const userTags = (localTags ?? allTags).filter((t: string) => !t.startsWith('_list:'))
    if (userTags.includes(t)) return
    updateTags.mutate({ contactId, tags: [...userTags, t, ...listTagsRaw] })
    setCustomTag('')
    setShowCustomInput(false)
  }

  return (
    <div className="w-72 shrink-0 border-l flex flex-col overflow-y-auto bg-white">
      {showFunnelModal && (
        <FunnelEnrollModal contactId={contactId} onClose={() => setShowFunnelModal(false)} />
      )}

      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Informações</p>
        <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
      </div>

      <div className="p-4 space-y-4">
        {/* Contact */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
            {(contact.name ?? contact.phone ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{contact.name ?? 'Sem nome'}</p>
            {contact.phone && <p className="text-xs text-muted-foreground">{contact.phone}</p>}
          </div>
        </div>

        {/* Funil */}
        <button
          onClick={() => setShowFunnelModal(true)}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-primary/30 px-3 py-2.5 text-xs font-medium text-primary hover:bg-primary/5 transition-colors"
        >
          <GitBranch className="h-3.5 w-3.5" />
          Adicionar ao Funil
        </button>

        {/* Estágio CRM */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estágio CRM</p>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((s) => (
              <button
                key={s.id}
                onClick={() => updateStage.mutate({ contactId, stage: s.id })}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
                  currentStage === s.id
                    ? s.cls + ' border-transparent shadow-sm'
                    : 'border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground'
                }`}
              >
                {currentStage === s.id && '✓ '}{s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_TAGS.map((t) => {
              const active = currentTags.includes(t.label)
              return (
                <button
                  key={t.label}
                  onClick={() => toggleTag(t.label)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
                    active ? t.cls : 'border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground'
                  }`}
                >
                  {active && '✓ '}{t.label}
                </button>
              )
            })}
            {currentTags
              .filter((t: string) => !PRESET_TAGS.find((p) => p.label === t))
              .map((t: string) => (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className="rounded-full border border-indigo-200 bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
                >
                  ✓ {t}
                </button>
              ))}
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
                <button onClick={addCustomTag} className="text-primary"><Check className="h-3.5 w-3.5" /></button>
                <button onClick={() => setShowCustomInput(false)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <button
                onClick={() => setShowCustomInput(true)}
                className="flex items-center gap-0.5 rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
              >
                <Plus className="h-3 w-3" /> Tag
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({ contactId, onBack }: { contactId: string; onBack: () => void }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [localMode, setLocalMode] = useState<'ai' | 'human' | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.conversations.getContactThread.useQuery(
    { contactId },
    { refetchInterval: 5000 }
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data?.messages])

  const serverMode = data?.conversations.slice().reverse().find((c) => c.status !== 'resolved')?.mode
  useEffect(() => { if (serverMode) setLocalMode(null) }, [serverMode])

  const activeConv = data?.conversations.slice().reverse().find((c) => c.status !== 'resolved') ?? data?.conversations.at(-1)

  const setMode = trpc.conversations.setMode.useMutation({
    onSuccess: () => utils.conversations.getContactThread.invalidate({ contactId }),
    onError: () => setLocalMode(null),
  })
  const resolve = trpc.conversations.resolve.useMutation({
    onSuccess: () => utils.conversations.getContactThread.invalidate({ contactId }),
  })
  const sendMessage = trpc.conversations.sendMessage.useMutation({
    onSuccess: () => {
      utils.conversations.getContactThread.invalidate({ contactId })
      textareaRef.current?.focus()
    },
  })

  function handleAssume() {
    if (!activeConv) return
    const newMode = effectiveMode === 'ai' ? 'human' : 'ai'
    setLocalMode(newMode)
    setMode.mutate({ id: activeConv.id, mode: newMode })
    if (newMode === 'human') setTimeout(() => textareaRef.current?.focus(), 100)
  }

  function handleSend() {
    if (!text.trim() || !activeConv || effectiveMode === 'ai' || isResolved) return
    const msg = text.trim()
    setText('')
    sendMessage.mutate({ conversationId: activeConv.id, text: msg })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  if (isLoading) return <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!data?.contact) return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Contato não encontrado.</div>

  const { contact, messages } = data
  const effectiveMode = localMode ?? activeConv?.mode ?? 'ai'
  const isAI = effectiveMode === 'ai'
  const isResolved = activeConv?.status === 'resolved'
  const canType = !isAI && !isResolved && !!activeConv
  let lastDate = ''

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Main chat */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 border-b bg-white px-4 py-3">
          <button onClick={onBack} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted md:hidden">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {(contact as any).name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{(contact as any).name ?? (contact as any).phone ?? 'Desconhecido'}</p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {(contact as any).phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{(contact as any).phone}</span>}
              <span>·</span>
              <span>{data.conversations.length} conversa{data.conversations.length !== 1 ? 's' : ''}</span>
              <span>·</span>
              <span className={`flex items-center gap-0.5 ${isAI ? 'text-purple-600' : 'text-blue-600'}`}>
                {isAI ? <Bot className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                {isAI ? 'IA' : 'Humano'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowInfo(!showInfo)}
              title="Informações do contato"
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${showInfo ? 'bg-primary/10 border-primary/30 text-primary' : 'hover:bg-muted text-muted-foreground'}`}
            >
              <Tag className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Info</span>
            </button>
            {activeConv && !isResolved && (
              <>
                <button
                  onClick={handleAssume}
                  disabled={setMode.isPending}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${isAI ? 'text-purple-700 border-purple-200 hover:bg-purple-50' : 'text-blue-700 border-blue-200 hover:bg-blue-50'}`}
                >
                  {setMode.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isAI ? <Bot className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{isAI ? 'Assumir' : 'Devolver IA'}</span>
                </button>
                <button
                  onClick={() => resolve.mutate({ id: activeConv.id })}
                  disabled={resolve.isPending}
                  className="flex items-center gap-1.5 rounded-lg border border-green-200 px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Resolver</span>
                </button>
              </>
            )}
            {isResolved && <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">Resolvida</span>}
          </div>
        </div>

        {activeConv && !isAI && !isResolved && (
          <div className="flex items-center gap-2 bg-blue-50 border-b border-blue-200 px-4 py-2 text-xs text-blue-700">
            <UserCheck className="h-3.5 w-3.5 shrink-0" />
            Você assumiu esta conversa. A IA está pausada.
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1" style={{ background: 'hsl(var(--muted)/0.3)' }}>
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Nenhuma mensagem ainda</div>
          ) : (
            <>
              {messages.map((msg: any) => {
                const msgDate = dateDivider(msg.created_at)
                const showDivider = msgDate !== lastDate
                lastDate = msgDate
                const isUser = msg.role === 'user'
                const senderLabel = msg.sender_type === 'campaign' ? '📢 Campanha' : msg.sender_type === 'funnel' ? '🔀 Funil' : null
                return (
                  <div key={msg.id}>
                    {showDivider && (
                      <div className="flex items-center gap-3 py-3">
                        <div className="flex-1 border-t border-dashed" />
                        <span className="text-xs text-muted-foreground bg-white/80 rounded px-2 py-0.5">{msgDate}</span>
                        <div className="flex-1 border-t border-dashed" />
                      </div>
                    )}
                    <div className={`flex ${isUser ? 'justify-start' : 'justify-end'} mb-1`}>
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm ${isUser ? 'rounded-tl-sm bg-white text-foreground' : 'rounded-tr-sm bg-primary text-white'}`}>
                        {senderLabel && <p className="mb-0.5 text-xs font-medium opacity-75">{senderLabel}</p>}
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        <div className={`mt-1 flex items-center gap-1 ${isUser ? 'justify-start' : 'justify-end'}`}>
                          <span className={`text-[10px] ${isUser ? 'text-muted-foreground' : 'text-white/70'}`}>
                            {timeStr(msg.created_at)}{!isUser && msg.ai_model && ` · ${msg.ai_model}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className={`flex-shrink-0 flex items-end gap-2 border-t bg-white px-3 py-2 transition-colors ${canType ? 'border-primary/30' : ''}`}>
          {!canType && <div className="flex items-center pb-2"><Lock className="h-4 w-4 text-muted-foreground/40" /></div>}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!canType}
            rows={2}
            placeholder={isResolved ? 'Conversa encerrada.' : isAI ? 'Clique em "Assumir" para digitar...' : 'Digite sua mensagem... (Enter envia · Shift+Enter quebra linha)'}
            className="flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!canType || !text.trim() || sendMessage.isPending}
            className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {sendMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Info panel */}
      {showInfo && <ContactInfoPanel contactId={contactId} onClose={() => setShowInfo(false)} />}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyChat() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center bg-muted/20">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <MessageSquare className="h-8 w-8 text-primary/60" />
      </div>
      <div>
        <p className="font-medium text-muted-foreground">Selecione uma conversa</p>
        <p className="mt-0.5 text-xs text-muted-foreground/70">Clique em um contato para ver a conversa</p>
      </div>
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function ConversationsPanel() {
  const [statusFilter, setStatusFilter] = useState('open')
  const [agentFilter, setAgentFilter] = useState<string>('')
  const [showAgentFilter, setShowAgentFilter] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  // Track which contact IDs have been "seen" (unread tracking)
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set())
  const prevLastMsgAt = useRef<Map<string, string>>(new Map())

  const { data: conversations = [], isLoading, refetch } = trpc.conversations.list.useQuery(
    { status: statusFilter, limit: 200, agentId: agentFilter || undefined },
    { refetchInterval: 10000 }
  )

  const { data: agents = [] } = trpc.agents.list.useQuery()

  // Group by contact, keeping most recent conversation per contact
  const grouped = useMemo(() => {
    const contactMap = new Map<string, typeof conversations[0]>()
    for (const conv of conversations) {
      const cid = (conv as any).contact_id as string | undefined
      if (!cid) continue
      const existing = contactMap.get(cid)
      const convTime = conv.last_message_at ?? conv.created_at
      const existingTime = existing ? (existing.last_message_at ?? existing.created_at) : ''
      if (!existing || convTime > existingTime) contactMap.set(cid, conv)
    }
    return Array.from(contactMap.values())
  }, [conversations])

  // Detect new messages → mark as unread
  useEffect(() => {
    const newUnseen = new Set<string>()
    for (const conv of grouped) {
      const cid = (conv as any).contact_id as string
      const lastAt = conv.last_message_at ?? ''
      const prev = prevLastMsgAt.current.get(cid)
      if (prev && lastAt > prev && cid !== selectedContactId) {
        newUnseen.add(cid)
      }
      prevLastMsgAt.current.set(cid, lastAt)
    }
    if (newUnseen.size > 0) {
      setSeenIds((prev) => {
        const next = new Set(prev)
        for (const id of newUnseen) next.delete(id)
        return next
      })
    }
  }, [grouped, selectedContactId])

  function selectContact(contactId: string) {
    setSelectedContactId(contactId)
    setSeenIds((prev) => new Set([...prev, contactId]))
  }

  const showChat = selectedContactId !== null

  return (
    <div className="flex h-[calc(100vh-5rem)] md:h-[calc(100vh-4rem)] overflow-hidden rounded-xl border bg-white shadow-sm">

      {/* Left panel */}
      <div className={`flex flex-col border-r ${showChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 shrink-0`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">Conversas</h2>
            <p className="text-xs text-muted-foreground">Monitoramento em tempo real</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <button
                onClick={() => setShowAgentFilter(!showAgentFilter)}
                title="Filtrar por agente"
                className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${agentFilter ? 'bg-primary/10 border-primary/30 text-primary' : 'hover:bg-muted text-muted-foreground'}`}
              >
                <Filter className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {agentFilter ? (agents as any[]).find((a: any) => a.id === agentFilter)?.name ?? 'Agente' : 'Agentes'}
                </span>
              </button>
              {showAgentFilter && (
                <div className="absolute right-0 top-9 z-20 w-48 rounded-xl border bg-white shadow-xl">
                  <button
                    onClick={() => { setAgentFilter(''); setShowAgentFilter(false) }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 font-medium"
                  >
                    Todos os agentes
                  </button>
                  <div className="border-t" />
                  {(agents as any[]).map((a: any) => (
                    <button
                      key={a.id}
                      onClick={() => { setAgentFilter(a.id); setShowAgentFilter(false) }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted/50 ${agentFilter === a.id ? 'text-primary font-medium' : ''}`}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => refetch()} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted text-muted-foreground" title="Atualizar">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Status filter */}
        <div className="border-b px-3 py-2">
          <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
            {[
              { value: 'open', label: 'Abertas' },
              { value: 'in_progress', label: 'Em andamento' },
              { value: 'resolved', label: 'Resolvidas' },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`flex-1 rounded-md py-1 text-xs font-medium transition-colors ${statusFilter === f.value ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">Nenhuma conversa</p>
              <p className="mt-0.5 text-xs text-muted-foreground/70">As conversas aparecerão aqui automaticamente.</p>
            </div>
          ) : (
            <div className="divide-y">
              {grouped.map((conv: any) => {
                const contact = conv.contacts
                const agent = conv.agents
                const channel = conv.channels
                const isAI = conv.mode === 'ai'
                const contactId = conv.contact_id
                const isSelected = selectedContactId === contactId
                const isUnread = !seenIds.has(contactId)

                return (
                  <button
                    key={contactId}
                    onClick={() => selectContact(contactId)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${isSelected ? 'bg-primary/8 border-l-2 border-primary' : 'hover:bg-muted/40'}`}
                  >
                    {/* Avatar with unread dot */}
                    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {contact?.name?.charAt(0)?.toUpperCase() ?? '?'}
                      {channel?.type && (
                        <span className="absolute -bottom-0.5 -right-0.5 text-sm leading-none">{channelEmoji[channel.type] ?? '💬'}</span>
                      )}
                      {/* Unread indicator */}
                      {isUnread && !isSelected && (
                        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 border-2 border-white" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={`truncate text-sm ${isUnread && !isSelected ? 'font-bold' : 'font-medium'}`}>
                          {contact?.name ?? contact?.phone ?? 'Desconhecido'}
                        </p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {conv.last_message_at ? timeAgo(conv.last_message_at) : timeAgo(conv.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`flex items-center gap-0.5 text-[10px] ${isAI ? 'text-purple-600' : 'text-blue-600'}`}>
                          {isAI ? <Bot className="h-2.5 w-2.5" /> : <UserCheck className="h-2.5 w-2.5" />}
                          {isAI ? 'IA' : 'Humano'}
                        </span>
                        {agent?.name && <span className="truncate text-[10px] text-muted-foreground">· {agent.name}</span>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <p className="border-t px-4 py-2 text-[10px] text-muted-foreground">
          {grouped.length} contato{grouped.length !== 1 ? 's' : ''} · atualiza a cada 10s
        </p>
      </div>

      {/* Right panel */}
      <div className={`flex flex-1 flex-col overflow-hidden ${showChat ? 'flex' : 'hidden md:flex'}`}>
        {selectedContactId ? (
          <ChatPanel key={selectedContactId} contactId={selectedContactId} onBack={() => setSelectedContactId(null)} />
        ) : (
          <EmptyChat />
        )}
      </div>
    </div>
  )
}
