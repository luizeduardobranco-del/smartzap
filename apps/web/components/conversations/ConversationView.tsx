'use client'

import { useRef, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Bot, UserCheck, CheckCheck, Loader2, Phone, Send, Lock } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

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

export function ConversationView({ contactId }: { contactId: string }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState('')
  const [localMode, setLocalMode] = useState<'ai' | 'human' | null>(null)
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.conversations.getContactThread.useQuery(
    { contactId },
    { refetchInterval: 5000 }
  )

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

  let lastDate = ''

  return (
    <div className="flex-1 min-h-0 grid gap-3 overflow-hidden" style={{ gridTemplateRows: 'auto 1fr auto' }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <Link href="/conversations" className="rounded-lg p-1.5 hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </Link>
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

      {/* ── Messages — scrolls internally ── */}
      <div className="min-h-0 overflow-y-auto rounded-xl border bg-white p-4 shadow-sm">
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
