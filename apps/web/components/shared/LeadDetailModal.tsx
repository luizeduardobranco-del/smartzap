'use client'

import { useState, useRef, useEffect } from 'react'
import { trpc } from '@/lib/trpc/client'
import {
  X, Phone, MessageSquare, ArrowLeft, Loader2,
  Bot, UserCheck, CheckCheck, Send, Lock,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

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

// ─── Inline conversation (com resposta, devolver IA, resolver) ────────────────

function InlineConversation({ contactId, contactName, onBack, onClose }: {
  contactId: string; contactName: string; onBack: () => void; onClose: () => void
}) {
  const utils = trpc.useUtils()
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [localMode, setLocalMode] = useState<'ai' | 'human' | null>(null)

  const { data, isLoading } = trpc.conversations.getContactThread.useQuery(
    { contactId },
    { refetchInterval: 5000 }
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data?.messages])

  const activeConv = data?.conversations.slice().reverse().find((c) => c.status !== 'resolved') ?? data?.conversations.at(-1)
  const serverMode = data?.conversations.slice().reverse().find((c) => c.status !== 'resolved')?.mode
  useEffect(() => { if (serverMode) setLocalMode(null) }, [serverMode])

  const effectiveMode = localMode ?? activeConv?.mode ?? 'ai'
  const isAI = effectiveMode === 'ai'
  const isResolved = activeConv?.status === 'resolved'
  const canType = !isAI && !isResolved && !!activeConv

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
      setText('')
      setTimeout(() => textareaRef.current?.focus(), 100)
    },
  })

  function handleAssume() {
    if (!activeConv) return
    const newMode = isAI ? 'human' : 'ai'
    setLocalMode(newMode)
    setMode.mutate({ id: activeConv.id, mode: newMode })
    if (newMode === 'human') setTimeout(() => textareaRef.current?.focus(), 100)
  }

  function handleSend() {
    if (!text.trim() || !activeConv || !canType) return
    sendMessage.mutate({ conversationId: activeConv.id, text: text.trim() })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const messages = data?.messages ?? []
  let lastDate = ''

  function formatMsgTime(d: string) {
    return new Date(d).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
        <button onClick={onBack} className="rounded-lg p-1.5 hover:bg-slate-100">
          <ArrowLeft className="h-4 w-4 text-slate-500" />
        </button>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {contactName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{contactName}</p>
          <p className={`text-xs flex items-center gap-1 ${isAI ? 'text-purple-600' : 'text-blue-600'}`}>
            {isAI ? <Bot className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
            {isAI ? 'IA respondendo' : 'Atendimento humano'}
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
          <X className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      {/* Action buttons */}
      {activeConv && !isResolved && (
        <div className="flex items-center gap-2 border-b px-4 py-2 bg-slate-50 shrink-0">
          <button
            onClick={handleAssume}
            disabled={setMode.isPending}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              isAI
                ? 'text-purple-700 border-purple-200 hover:bg-purple-50'
                : 'text-blue-700 border-blue-200 hover:bg-blue-50'
            }`}
          >
            {setMode.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isAI ? <Bot className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
            {isAI ? 'Assumir atendimento' : 'Devolver para IA'}
          </button>
          <button
            onClick={() => resolve.mutate({ id: activeConv.id })}
            disabled={resolve.isPending}
            className="flex items-center gap-1.5 rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 transition-colors"
          >
            {resolve.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Resolver
          </button>
          {isResolved && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">Resolvida</span>
          )}
        </div>
      )}

      {/* Status banner */}
      {activeConv && !isAI && !isResolved && (
        <div className="flex items-center gap-2 bg-blue-50 border-b border-blue-100 px-4 py-2 text-xs text-blue-700 shrink-0">
          <UserCheck className="h-3.5 w-3.5 shrink-0" />
          Você assumiu esta conversa. A IA está pausada.
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1" style={{ background: 'hsl(var(--muted)/0.3)' }}>
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
            msg.sender_type === 'funnel'   ? '🔀 Funil' :
            msg.sender_type === 'human'    ? '👤 Humano' : '🤖 IA'
          return (
            <div key={msg.id ?? i}>
              {showDate && (
                <div className="flex justify-center my-3">
                  <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs text-slate-400">{msgDate}</span>
                </div>
              )}
              <div className={`flex ${isUser ? 'justify-start' : 'justify-end'} mb-1`}>
                <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  isUser ? 'bg-white text-slate-800 rounded-tl-sm' : 'bg-primary text-white rounded-tr-sm'
                }`}>
                  {!isUser && <p className="mb-0.5 text-xs font-medium opacity-75">{senderLabel}</p>}
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

      {/* Reply input */}
      <div className={`flex-shrink-0 flex items-end gap-2 border-t bg-white px-3 py-2 ${canType ? 'border-primary/30' : ''}`}>
        {!canType && (
          <div className="flex items-center pb-2">
            <Lock className="h-4 w-4 text-muted-foreground/40" />
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!canType}
          rows={2}
          placeholder={
            isResolved
              ? 'Conversa encerrada.'
              : isAI
              ? 'Clique em "Assumir atendimento" para digitar...'
              : 'Digite sua mensagem... (Enter envia · Shift+Enter quebra linha)'
          }
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
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function LeadDetailModal({ contactId, onClose }: {
  contactId: string
  onClose: () => void
}) {
  const utils = trpc.useUtils()
  const [showConv, setShowConv] = useState(false)
  const [customTag, setCustomTag] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)

  const { data: contact, isLoading: loadingContact } = trpc.crm.getContact.useQuery({ contactId })
  const { data: contactFunnels = [], isLoading: loadingFunnels } = trpc.funnels.getContactFunnels.useQuery({ contactId })

  const [localTags, setLocalTags] = useState<string[]>([])
  const [localCrmStage, setLocalCrmStage] = useState<string>('new')

  useEffect(() => {
    if (contact) {
      setLocalTags(contact.tags ?? [])
      setLocalCrmStage(contact.kanban_stage ?? 'new')
    }
  }, [contact])

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

  const moveContact = trpc.funnels.moveContact.useMutation({
    onSettled: () => utils.funnels.getContactFunnels.invalidate({ contactId }),
  })

  const userTags = localTags.filter((t) => !t.startsWith('_list:'))
  const listTags = localTags.filter((t) => t.startsWith('_list:'))

  function toggleTag(tag: string) {
    const newUserTags = userTags.includes(tag)
      ? userTags.filter((t) => t !== tag)
      : [...userTags, tag]
    updateTags.mutate({ contactId, tags: [...newUserTags, ...listTags] })
  }

  function addCustomTag() {
    const t = customTag.trim()
    if (!t || userTags.includes(t)) return
    updateTags.mutate({ contactId, tags: [...userTags, t, ...listTags] })
    setCustomTag('')
    setShowCustomInput(false)
  }

  const name = contact?.name ?? contact?.phone ?? 'Contato'
  const isLoading = loadingContact || loadingFunnels

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={`w-full rounded-2xl bg-white shadow-2xl flex flex-col transition-all duration-200 ${
          showConv ? 'max-w-2xl h-[90vh]' : 'max-w-md max-h-[90vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Inline conversation with full chat features */}
        {showConv && (
          <InlineConversation
            contactId={contactId}
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
                {contact?.phone && (
                  <p className="flex items-center gap-1 text-xs text-slate-500">
                    <Phone className="h-3 w-3" />
                    {contact.phone}
                  </p>
                )}
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-y-auto flex-1 p-5 space-y-5">

              {/* Funis vinculados */}
              {contactFunnels.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Funis vinculados</p>
                  <div className="space-y-3">
                    {contactFunnels.map((fc: any) => {
                      const funnel = fc.funnels
                      if (!funnel) return null
                      const stages = [...(funnel.funnel_stages ?? [])].sort(
                        (a: any, b: any) => a.position - b.position
                      )
                      return (
                        <div key={fc.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <p className="mb-2 text-xs font-semibold text-slate-700">{funnel.name}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {stages.map((s: any) => (
                              <button
                                key={s.id}
                                onClick={() => moveContact.mutate({ contactFunnelId: fc.id, newStageId: s.id })}
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
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Estágio no CRM */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Estágio no CRM</p>
                <div className="flex flex-wrap gap-2">
                  {CRM_STAGES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => updateStage.mutate({ contactId, stage: s.id as any })}
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
                          active
                            ? t.cls + ' shadow-sm ring-1 ring-offset-1 ring-current'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
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
                    <button
                      onClick={addCustomTag}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
                    >
                      Adicionar
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex gap-2 border-t p-4 shrink-0">
            <button
              onClick={() => setShowConv(true)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/15 transition-colors"
            >
              <MessageSquare className="h-4 w-4" />
              Conversar / Atender
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
