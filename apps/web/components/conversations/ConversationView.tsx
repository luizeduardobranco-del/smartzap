'use client'

import { useRef, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Bot, UserCheck, CheckCheck, Loader2, Phone, Send, Lock, Tag, X, Plus, Check, Mic, Image as ImageIcon, FileText } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

const PRESET_TAGS = [
  { label: 'Hot Lead',   cls: 'bg-red-100 text-red-700 border-red-200' },
  { label: 'Cold Lead',  cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  { label: 'VIP',        cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  { label: 'Suporte',    cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  { label: 'Venda',      cls: 'bg-green-100 text-green-700 border-green-200' },
  { label: 'Reclamação', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  { label: 'Parceiro',   cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  { label: 'Inativo',    cls: 'bg-gray-100 text-gray-500 border-gray-200' },
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

function getTagCls(tag: string) {
  return PRESET_TAGS.find((t) => t.label === tag)?.cls ?? 'bg-indigo-100 text-indigo-700 border-indigo-200'
}

function timeStr(date: string) {
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function dateDivider(date: string) {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

export function ConversationView({ contactId, onClose }: { contactId: string; onClose?: () => void }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [localMode, setLocalMode] = useState<'ai' | 'human' | null>(null)
  const [showTagPanel, setShowTagPanel] = useState(false)
  const [customTag, setCustomTag] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [localTags, setLocalTags] = useState<string[] | null>(null)
  const [localStage, setLocalStage] = useState<string | null>(null)
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.conversations.getContactThread.useQuery(
    { contactId },
    { refetchInterval: 5000 }
  )

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

  // Scroll to the latest message whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data?.messages])

  // Sync localMode back to server after refetch
  const serverMode = data?.conversations
    .slice().reverse()
    .find((c) => c.status !== 'resolved')?.mode
  useEffect(() => {
    if (serverMode) setLocalMode(null)
  }, [serverMode])

  const activeConv = data?.conversations
    .slice().reverse()
    .find((c) => c.status !== 'resolved') ?? data?.conversations.at(-1)

  const setMode = trpc.conversations.setMode.useMutation({
    onSuccess: () => utils.conversations.getContactThread.invalidate({ contactId }),
    onError: () => setLocalMode(null),
  })
  const resolve = trpc.conversations.resolve.useMutation({
    onSuccess: () => utils.conversations.getContactThread.invalidate({ contactId }),
  })
  const sendMessage = trpc.conversations.sendMessage.useMutation({
    onSuccess: () => {
      setText('')
      utils.conversations.getContactThread.invalidate({ contactId })
      textareaRef.current?.focus()
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
    if (!text.trim() || !activeConv || isAI || isResolved) return
    sendMessage.mutate({ conversationId: activeConv.id, text: text.trim() })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data?.contact) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Contato não encontrado.</p>
        <Link href="/conversations" className="mt-4 inline-block text-sm text-primary">← Voltar</Link>
      </div>
    )
  }

  const { contact, messages } = data
  const effectiveMode = localMode ?? activeConv?.mode ?? 'ai'
  const isAI = effectiveMode === 'ai'
  const isResolved = activeConv?.status === 'resolved'
  const canType = !isAI && !isResolved && !!activeConv

  const currentTags = (localTags ?? (contact as any).tags ?? []).filter((t: string) => !t.startsWith('_list:'))
  const currentStage = localStage ?? (contact as any).kanban_stage ?? 'new'
  const stageConfig = STAGES.find((s) => s.id === currentStage) ?? STAGES[0]

  function toggleTag(tag: string) {
    const allTags: string[] = (contact as any).tags ?? []
    const listTagsRaw = allTags.filter((t) => t.startsWith('_list:'))
    const userTags = (localTags ?? allTags).filter((t) => !t.startsWith('_list:'))
    const next = userTags.includes(tag) ? userTags.filter((t) => t !== tag) : [...userTags, tag]
    updateTags.mutate({ contactId, tags: [...next, ...listTagsRaw] })
  }

  function addCustomTag() {
    const t = customTag.trim()
    if (!t) return
    const allTags: string[] = (contact as any).tags ?? []
    const listTagsRaw = allTags.filter((t) => t.startsWith('_list:'))
    const userTags = (localTags ?? allTags).filter((t) => !t.startsWith('_list:'))
    if (userTags.includes(t)) return
    updateTags.mutate({ contactId, tags: [...userTags, t, ...listTagsRaw] })
    setCustomTag('')
    setShowCustomInput(false)
  }

  let lastDate = ''

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {onClose ? (
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </button>
        ) : (
          <Link href="/conversations" className="rounded-lg p-1.5 hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {(contact as any).name?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{(contact as any).name ?? (contact as any).phone ?? 'Desconhecido'}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
            {(contact as any).phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {(contact as any).phone}
              </span>
            )}
            <span>·</span>
            <span>{data.conversations.length} conversa{data.conversations.length !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span className={`flex items-center gap-0.5 font-medium ${isAI ? 'text-purple-600' : 'text-blue-600'}`}>
              {isAI ? <Bot className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
              {isAI ? 'IA' : 'Humano'}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShowTagPanel(!showTagPanel)}
            title="Tags e estágio"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              showTagPanel ? 'bg-primary/10 border-primary/30 text-primary' : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            <Tag className="h-3.5 w-3.5" />
            {currentTags.length > 0 ? (
              <span className="max-w-[80px] truncate">{currentTags.slice(0, 2).join(', ')}{currentTags.length > 2 ? ` +${currentTags.length - 2}` : ''}</span>
            ) : (
              'Tags'
            )}
          </button>
          {activeConv && !isResolved && (
            <>
              <button
                onClick={handleAssume}
                disabled={setMode.isPending}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isAI
                    ? 'text-purple-700 border-purple-200 hover:bg-purple-50'
                    : 'text-blue-700 border-blue-200 hover:bg-blue-50'
                }`}
              >
                {setMode.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : isAI ? <Bot className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                {isAI ? 'Assumir conversa' : 'Devolver para IA'}
              </button>
              <button
                onClick={() => resolve.mutate({ id: activeConv.id })}
                disabled={resolve.isPending}
                className="flex items-center gap-1.5 rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Resolver
              </button>
            </>
          )}
          {isResolved && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              Resolvida
            </span>
          )}
        </div>
      </div>

      {/* ── Tag & Stage Panel ── */}
      {showTagPanel && (
        <div className="flex-shrink-0 rounded-xl border bg-white p-4 shadow-sm space-y-3">
          {/* Stage */}
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
              {/* Custom tags already applied */}
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
      )}

      {/* ── Messages — scrolls internally ── */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border bg-white p-4 shadow-sm">
        {messages.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Nenhuma mensagem ainda
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg: any) => {
              const msgDate = dateDivider(msg.created_at)
              const showDivider = msgDate !== lastDate
              lastDate = msgDate
              const isUser = msg.role === 'user'
              return (
                <div key={msg.id}>
                  {showDivider && (
                    <div className="flex items-center gap-3 py-3">
                      <div className="flex-1 border-t border-dashed" />
                      <span className="text-xs text-muted-foreground">{msgDate}</span>
                      <div className="flex-1 border-t border-dashed" />
                    </div>
                  )}
                  <div className={`flex ${isUser ? 'justify-start' : 'justify-end'} mb-1`}>
                    <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                      isUser
                        ? 'rounded-tl-sm bg-muted text-foreground'
                        : 'rounded-tr-sm bg-primary text-white'
                    }`}>
                      {/* Audio message */}
                      {msg.content_type === 'audio' ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-primary/10' : 'bg-white/20'}`}>
                              <Mic className={`h-3.5 w-3.5 ${isUser ? 'text-primary' : 'text-white'}`} />
                            </div>
                            <span className={`text-xs font-medium ${isUser ? 'text-muted-foreground' : 'text-white/80'}`}>Áudio</span>
                          </div>
                          {msg.content && msg.content !== '[mídia]' ? (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap italic opacity-90">"{msg.content}"</p>
                          ) : (
                            <p className={`text-xs italic ${isUser ? 'text-muted-foreground' : 'text-white/60'}`}>Áudio não transcrito</p>
                          )}
                        </div>
                      ) : msg.content_type === 'image' ? (
                        <div className="space-y-1.5">
                          {msg.media_url ? (
                            <img src={msg.media_url} alt="Imagem" className="max-w-full rounded-lg max-h-48 object-cover" />
                          ) : (
                            <div className="flex items-center gap-2">
                              <ImageIcon className="h-4 w-4 opacity-70" />
                              <span className="text-xs opacity-70">Imagem</span>
                            </div>
                          )}
                          {msg.content && msg.content !== '[mídia]' && (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          )}
                        </div>
                      ) : msg.content_type === 'document' ? (
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 opacity-70" />
                          <span className="text-sm">{msg.content !== '[mídia]' ? msg.content : 'Documento'}</span>
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      )}
                      <div className={`mt-1 flex items-center gap-1 ${isUser ? 'justify-start' : 'justify-end'}`}>
                        <span className={`text-[10px] ${isUser ? 'text-muted-foreground' : 'text-white/70'}`}>
                          {timeStr(msg.created_at)}
                          {!isUser && msg.ai_model && ` · ${msg.ai_model}`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Input bar — always at bottom of flex column ── */}
      <div className={`flex-shrink-0 flex items-end gap-2 rounded-xl border bg-white px-3 py-2 shadow-lg transition-colors ${
        canType ? 'border-primary/40' : 'border-muted'
      }`}>
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
              ? 'Clique em "Assumir conversa" para digitar...'
              : 'Digite sua mensagem... (Enter envia · Shift+Enter quebra linha)'
          }
          className="flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleSend}
          disabled={!canType || !text.trim() || sendMessage.isPending}
          className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-colors hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {sendMessage.isPending
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Send className="h-4 w-4" />}
        </button>
      </div>

      {sendMessage.isError && (
        <p className="flex-shrink-0 text-center text-xs text-red-500">
          Erro ao enviar — verifique se o canal WhatsApp está conectado.
        </p>
      )}
    </div>
  )
}
