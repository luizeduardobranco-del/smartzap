'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MessageSquare, Loader2, Bot, UserCheck } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

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

export function ConversationsList() {
  const [statusFilter, setStatusFilter] = useState('open')
  const { data: conversations = [], isLoading, refetch } = trpc.conversations.list.useQuery(
    { status: statusFilter, limit: 200 },
    { refetchInterval: 10000 }
  )

  // Group by contact — one row per contact, showing the most recent conversation
  const contactMap = new Map<string, typeof conversations[0]>()
  for (const conv of conversations) {
    const cid = (conv as any).contact_id as string | undefined
    if (!cid) continue
    const existing = contactMap.get(cid)
    const convTime = conv.last_message_at ?? conv.created_at
    const existingTime = existing ? (existing.last_message_at ?? existing.created_at) : ''
    if (!existing || convTime > existingTime) {
      contactMap.set(cid, conv)
    }
  }
  const grouped = Array.from(contactMap.values())

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conversas</h1>
          <p className="text-sm text-muted-foreground">Monitoramento em tempo real</p>
        </div>
        <button onClick={() => refetch()} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
          Atualizar
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {[
          { value: 'open', label: 'Abertas' },
          { value: 'in_progress', label: 'Em andamento' },
          { value: 'resolved', label: 'Resolvidas' },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === f.value ? 'bg-white shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-20 text-center">
          <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">Nenhuma conversa {statusFilter === 'open' ? 'aberta' : ''}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            As conversas aparecerão aqui quando os clientes enviarem mensagens.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <div className="divide-y">
            {grouped.map((conv: any) => {
              const contact = conv.contacts
              const agent = conv.agents
              const channel = conv.channels
              const isAI = conv.mode === 'ai'
              const contactId = conv.contact_id

              return (
                <Link
                  key={contactId}
                  href={`/conversations/${contactId}`}
                  className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/30 transition-colors"
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

                  {/* Main info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium truncate">{contact?.name ?? contact?.phone ?? 'Desconhecido'}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {conv.last_message_at ? timeAgo(conv.last_message_at) : timeAgo(conv.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`flex items-center gap-0.5 text-xs ${isAI ? 'text-purple-600' : 'text-blue-600'}`}>
                        {isAI ? <Bot className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                        {isAI ? 'IA' : 'Humano'}
                      </span>
                      {agent?.name && (
                        <span className="text-xs text-muted-foreground truncate">· {agent.name}</span>
                      )}
                      {contact?.phone && (
                        <span className="text-xs text-muted-foreground truncate">· {contact.phone}</span>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-xs text-muted-foreground">
        {grouped.length} contato{grouped.length !== 1 ? 's' : ''} · atualiza a cada 10s
      </p>
    </div>
  )
}
