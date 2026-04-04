'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Send, Loader2, Bot, Trash2, ChevronDown, Headphones, GripVertical } from 'lucide-react'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

const GREETING: Message = {
  role: 'assistant',
  content: 'Olá! 👋 Sou o assistente de suporte da White Zap. Posso te ajudar com dúvidas sobre como usar a plataforma, configurar agentes, conectar WhatsApp, criar campanhas e muito mais. Como posso te ajudar?',
}

export function SupportChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(0)
  const [btnPos, setBtnPos] = useState({ right: 20, bottom: 20 })
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; startRight: number; startBottom: number } | null>(null)
  const wasDragRef = useRef(false)

  useEffect(() => {
    if (open) {
      setUnread(0)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading, open])

  function handleBubbleMouseDown(e: React.MouseEvent) {
    wasDragRef.current = false
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: btnPos.right,
      startBottom: btnPos.bottom,
    }

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) wasDragRef.current = true
      setBtnPos({
        right: Math.max(5, dragRef.current.startRight - dx),
        bottom: Math.max(5, dragRef.current.startBottom - dy),
      })
    }

    function onUp() {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleBubbleClick() {
    if (wasDragRef.current) {
      wasDragRef.current = false
      return
    }
    setOpen((v) => !v)
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { role: 'user', content: text }
    const newHistory = [...messages, userMsg]
    setMessages(newHistory)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.filter((m) => !(m.role === 'assistant' && m.content === GREETING.content)),
        }),
      })
      const data = await res.json()
      const reply: Message = {
        role: 'assistant',
        content: data.reply ?? `Erro: ${data.error ?? 'sem resposta'}`,
      }
      setMessages([...newHistory, reply])
      if (!open) setUnread((n) => n + 1)
    } catch {
      setMessages([...newHistory, { role: 'assistant', content: 'Não consegui conectar. Tente novamente.' }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function clearChat() {
    setMessages([GREETING])
  }

  return (
    <div
      className="z-50 flex flex-col items-end"
      style={{ position: 'fixed', right: btnPos.right, bottom: btnPos.bottom }}
    >
      {/* Chat panel */}
      {open && (
        <div className="mb-4 flex h-[520px] w-[360px] flex-col rounded-2xl border bg-white shadow-2xl">
          {/* Header — drag handle */}
          <div
            className="flex cursor-grab active:cursor-grabbing items-center gap-2.5 rounded-t-2xl bg-gradient-to-r from-primary to-primary/80 px-4 py-3 text-white select-none"
            onMouseDown={(e) => {
              // Drag the whole chat panel via header
              const panel = e.currentTarget.closest('.flex.flex-col.items-end') as HTMLElement | null
              if (!panel) return
              const startX = e.clientX
              const startY = e.clientY
              const startRight = btnPos.right
              const startBottom = btnPos.bottom

              function onMove(ev: MouseEvent) {
                const dx = ev.clientX - startX
                const dy = ev.clientY - startY
                setBtnPos({
                  right: Math.max(5, startRight - dx),
                  bottom: Math.max(5, startBottom - dy),
                })
              }

              function onUp() {
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
              }

              window.addEventListener('mousemove', onMove)
              window.addEventListener('mouseup', onUp)
            }}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-none">Suporte White Zap</p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-400" />
                <p className="text-xs text-white/80">Online agora · resposta imediata</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <GripVertical className="h-4 w-4 opacity-40" />
              <button
                onClick={clearChat}
                onMouseDown={(e) => e.stopPropagation()}
                className="rounded p-1.5 hover:bg-white/20"
                title="Limpar conversa"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setOpen(false)}
                onMouseDown={(e) => e.stopPropagation()}
                className="rounded p-1.5 hover:bg-white/20"
                title="Minimizar"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                    msg.role === 'user'
                      ? 'rounded-tr-none bg-primary text-white'
                      : 'rounded-tl-none bg-white text-gray-800 border border-gray-100'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="rounded-2xl rounded-tl-none bg-white border border-gray-100 px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggested questions (show only if just greeting) */}
          {messages.length === 1 && (
            <div className="border-t bg-white px-3 py-2 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Perguntas frequentes</p>
              {[
                'Como conectar meu WhatsApp?',
                'Como criar minha base de conhecimento?',
                'Como criar um disparo em massa?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 50) }}
                  className="w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-left text-xs text-primary hover:bg-primary/10 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex items-end gap-2 border-t bg-white px-3 py-2.5 rounded-b-2xl">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Digite sua dúvida..."
              rows={1}
              disabled={loading}
              className="flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-gray-400 max-h-24 bg-slate-50"
              style={{ minHeight: '36px' }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Bubble button */}
      <button
        onMouseDown={handleBubbleMouseDown}
        onClick={handleBubbleClick}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 cursor-grab active:cursor-grabbing"
        title="Suporte White Zap — arraste para mover"
      >
        {open ? (
          <ChevronDown className="h-6 w-6" />
        ) : (
          <Headphones className="h-6 w-6" />
        )}
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold">
            {unread}
          </span>
        )}
        {!open && (
          <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-20" />
        )}
      </button>
    </div>
  )
}
