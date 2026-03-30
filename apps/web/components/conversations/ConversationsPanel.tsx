'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Loader2, Bot, UserCheck, ArrowLeft, Phone, CheckCheck, RefreshCw, Send, Lock } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const channelEmoji: Record<string, string> = {
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
  return `${Math.floor(hours / 24)}d`
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

// ─── Chat Panel ───────────────────────────────────────────────────────────────

function ChatPanel({ contactId, onBack }: { contactId: string; onBack: () => void }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [localMode, setLocalMode] = useState<'ai' | 'human' | null>(null)
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.conversations.getContactThread.useQuery(
    { contactId },
    { refetchInterval: 5000 }
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [data?.messages])

  const serverMode = data?.conversations
    .slice().reverse()
    .find((c) => c.status !== 'resolved')?.mode
  useEffect(() => {
    if (serverMode) setLocalMode(null)
  }, [serverMode])

  const activeConv = data?.conversations
    .slice()
    .reverse()
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
    const newMode = effectiveMode === 'ai' ? 'human' : 'ai'
    setLocalMode(newMode)
    setMode.mutate({ id: activeConv.id, mode: newMode })
    if (newMode === 'human') setTimeout(() => textareaRef.current?.focus(), 100)
  }

  function handleSend() {
    if (!text.trim() || !activeConv || effectiveMode === 'ai' || isResolved) return
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
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data?.contact) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Contato não encontrado.
      </div>
    )
  }

  const { contact, messages } = data
  const effectiveMode = localMode ?? activeConv?.mode ?? 'ai'
  const isAI = effectiveMode === 'ai'
  const isResolved = activeConv?.status === 'resolved'
  const canType = !isAI && !isResolved && !!activeConv
  let lastDate = ''

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b bg-white px-4 py-3">
        {/* Back button — mobile only */}
        <button
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {(contact as any).name?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{(contact as any).name ?? (contact as any).phone ?? 'Desconhecido'}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {(contact as any).phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {(contact as any).phone}
              </span>
            )}
            <span>·</span>
            <span>{data.conversations.length} conversa{data.conversations.length !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span className={`flex items-center gap-0.5 ${isAI ? 'text-purple-600' : 'text-blue-600'}`}>
              {isAI ? <Bot className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
              {isAI ? 'IA' : 'Humano'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {activeConv && !isResolved && (
            <>
              <button
                onClick={handleAssume}
                disabled={setMode.isPending}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  isAI
                    ? 'text-purple-700 border-purple-200 hover:bg-purple-50'
                    : 'text-blue-700 border-blue-200 hover:bg-blue-50'
                }`}
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
          {isResolved && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              Resolvida
            </span>
          )}
        </div>
      </div>

      {/* Human mode banner */}
      {activeConv && !isAI && !isResolved && (
        <div className="flex items-center gap-2 bg-blue-50 border-b border-blue-200 px-4 py-2 text-xs text-blue-700">
          <UserCheck className="h-3.5 w-3.5 shrink-0" />
          Você assumiu esta conversa. A IA está pausada.
        </div>
      )}

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-1"
        style={{ background: 'hsl(var(--muted)/0.3)' }}
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Nenhuma mensagem ainda
          </div>
        ) : (
          <>
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
                      <span className="text-xs text-muted-foreground bg-white/80 rounded px-2 py-0.5">
                        {msgDate}
                      </span>
                      <div className="flex-1 border-t border-dashed" />
                    </div>
                  )}
                  <div className={`flex ${isUser ? 'justify-start' : 'justify-end'} mb-1`}>
                    <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                      isUser
                        ? 'rounded-tl-sm bg-white text-foreground'
                        : 'rounded-tr-sm bg-primary text-white'
                    }`}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
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
          </>
        )}
      </div>

      {/* Input bar */}
      <div className={`flex-shrink-0 flex items-end gap-2 border-t bg-white px-3 py-2 transition-colors ${canType ? 'border-primary/30' : ''}`}>
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
              ? 'Clique em "Assumir" para digitar...'
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
    </div>
  )
}

// ─── Empty state (no conversation selected) ───────────────────────────────────

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
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)

  const { data: conversations = [], isLoading, refetch } = trpc.conversations.list.useQuery(
    { status: statusFilter, limit: 200 },
    { refetchInterval: 10000 }
  )

  // Group by contact
  const contactMap = new Map<string, typeof conversations[0]>()
  for (const conv of conversations) {
    const cid = (conv as any).contact_id as string | undefined
    if (!cid) continue
    const existing = contactMap.get(cid)
    const convTime = conv.last_message_at ?? conv.created_at
    const existingTime = existing ? (existing.last_message_at ?? existing.created_at) : ''
    if (!existing || convTime > existingTime) contactMap.set(cid, conv)
  }
  const grouped = Array.from(contactMap.values())

  // On mobile, hide list when a conversation is selected
  const showChat = selectedContactId !== null

  return (
    <div className="flex h-[calc(100vh-5rem)] md:h-[calc(100vh-4rem)] overflow-hidden rounded-xl border bg-white shadow-sm">

      {/* ── Left panel: conversation list ── */}
      <div className={`flex flex-col border-r ${showChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 shrink-0`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="font-semibold">Conversas</h2>
            <p className="text-xs text-muted-foreground">Monitoramento em tempo real</p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted text-muted-foreground"
            title="Atualizar"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
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
                className={`flex-1 rounded-md py-1 text-xs font-medium transition-colors ${
                  statusFilter === f.value ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
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

                return (
                  <button
                    key={contactId}
                    onClick={() => setSelectedContactId(contactId)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      isSelected ? 'bg-primary/8 border-l-2 border-primary' : 'hover:bg-muted/40'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {contact?.name?.charAt(0)?.toUpperCase() ?? '?'}
                      {channel?.type && (
                        <span className="absolute -bottom-0.5 -right-0.5 text-sm leading-none">
                          {channelEmoji[channel.type] ?? '💬'}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium">
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
                        {agent?.name && (
                          <span className="truncate text-[10px] text-muted-foreground">· {agent.name}</span>
                        )}
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

      {/* ── Right panel: chat ── */}
      <div className={`flex flex-1 flex-col overflow-hidden ${showChat ? 'flex' : 'hidden md:flex'}`}>
        {selectedContactId ? (
          <ChatPanel
            key={selectedContactId}
            contactId={selectedContactId}
            onBack={() => setSelectedContactId(null)}
          />
        ) : (
          <EmptyChat />
        )}
      </div>
    </div>
  )
}
