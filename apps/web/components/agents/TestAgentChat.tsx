'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Send, Loader2, Bot, Trash2, MessageSquare } from 'lucide-react'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type Props = {
  agentId: string
  agentName: string
  onClose: () => void
}

export function TestAgentChat({ agentId, agentName, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { role: 'user', content: text }
    const newHistory = [...messages, userMsg]
    setMessages(newHistory)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`/api/agents/${agentId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages, // history before current user msg
        }),
      })
      const data = await res.json()
      if (data.reply) {
        setMessages([...newHistory, { role: 'assistant', content: data.reply }])
      } else {
        setMessages([...newHistory, { role: 'assistant', content: `Erro: ${data.error ?? 'sem resposta'}` }])
      }
    } catch {
      setMessages([...newHistory, { role: 'assistant', content: 'Erro ao conectar com o agente.' }])
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

  return (
    <div className="fixed bottom-5 right-[380px] z-50 flex h-[520px] w-[360px] flex-col rounded-2xl border bg-white shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-2.5 rounded-t-2xl bg-[#075E54] px-4 py-3 text-white">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
          <Bot className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-none">{agentName}</p>
          <p className="mt-0.5 text-xs text-white/70">Modo de teste · não envia WhatsApp</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMessages([])}
            className="rounded p-1.5 hover:bg-white/20"
            title="Limpar conversa"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-white/20" title="Fechar">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-2"
        style={{ background: '#ECE5DD url("data:image/svg+xml,%3Csvg width=\'300\' height=\'300\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3C/svg%3E")' }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#075E54]/10">
              <MessageSquare className="h-6 w-6 text-[#075E54]" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Converse com {agentName}</p>
              <p className="text-xs text-gray-500 mt-1">Digite uma mensagem para testar as respostas do agente</p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-3 py-2 text-sm shadow-sm ${
                msg.role === 'user'
                  ? 'rounded-tr-none bg-[#DCF8C6] text-gray-800'
                  : 'rounded-tl-none bg-white text-gray-800'
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-xl rounded-tl-none bg-white px-4 py-2.5 shadow-sm">
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 border-t bg-[#F0F0F0] px-3 py-2.5">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Digite uma mensagem..."
          rows={1}
          disabled={loading}
          className="flex-1 resize-none rounded-xl border-0 bg-white px-3 py-2 text-sm outline-none shadow-sm placeholder:text-gray-400 max-h-24"
          style={{ minHeight: '36px' }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#075E54] text-white disabled:opacity-40 hover:bg-[#128C7E] transition-colors"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  )
}
