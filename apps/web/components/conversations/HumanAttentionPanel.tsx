'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { UserCheck, ChevronDown, ChevronUp, Clock, GripVertical } from 'lucide-react'
import { LeadDetailModal } from '@/components/shared/LeadDetailModal'

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

const channelEmoji: Record<string, string> = {
  whatsapp: '💬',
  instagram: '📷',
  web: '🌐',
}

export function HumanAttentionPanel() {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [pos, setPos] = useState({ left: 20, bottom: 20 })
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startBottom: number } | null>(null)
  const wasDragRef = useRef(false)

  const { data: conversations = [] } = trpc.conversations.list.useQuery(
    { mode: 'human', status: 'open', limit: 50 },
    { refetchInterval: 10000 }
  )

  function handleDragMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    wasDragRef.current = false
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: pos.left,
      startBottom: pos.bottom,
    }

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) wasDragRef.current = true
      setPos({
        left: Math.max(5, dragRef.current.startLeft + dx),
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

  if (conversations.length === 0) return null

  return (
    <>
      {selectedContactId && (
        <LeadDetailModal
          contactId={selectedContactId}
          onClose={() => setSelectedContactId(null)}
        />
      )}

      <div
        className="fixed z-40 flex flex-col-reverse"
        style={{ left: pos.left, bottom: pos.bottom, maxWidth: 320 }}
      >
        {/* Toggle button */}
        <div className="flex items-center self-start rounded-2xl bg-orange-500 shadow-lg overflow-hidden">
          {/* Drag handle */}
          <div
            onMouseDown={handleDragMouseDown}
            className="flex items-center pl-3 pr-1 py-2.5 cursor-grab active:cursor-grabbing text-white/70 hover:text-white"
            title="Mover"
          >
            <GripVertical className="h-4 w-4" />
          </div>

          <button
            onClick={() => !wasDragRef.current && setOpen((v) => !v)}
            className="flex items-center gap-2 pr-4 py-2.5 text-white hover:text-white/90 transition-colors"
          >
            <div className="relative">
              <UserCheck className="h-4 w-4" />
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-orange-600">
                {conversations.length}
              </span>
            </div>
            <span className="text-sm font-semibold">Aguardando atendimento</span>
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Panel */}
        {open && (
          <div className="mb-2 w-80 rounded-2xl border border-orange-200 bg-white shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 bg-orange-50 px-4 py-2.5 border-b border-orange-100">
              <UserCheck className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-semibold text-orange-900">
                {conversations.length} conversa{conversations.length > 1 ? 's' : ''} aguardando humano
              </span>
            </div>

            {/* List */}
            <ul className="max-h-72 overflow-y-auto divide-y divide-orange-50">
              {conversations.map((conv) => {
                const contact = (conv as any).contacts
                const channel = (conv as any).channels
                const name = contact?.name ?? contact?.phone ?? 'Desconhecido'
                const initials = name.charAt(0).toUpperCase()
                const emoji = channelEmoji[channel?.type] ?? '💬'
                const contactId = (conv as any).contact_id as string

                return (
                  <li key={conv.id}>
                    <button
                      onClick={() => setSelectedContactId(contactId)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-orange-50 transition-colors"
                    >
                      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-700">
                        {initials}
                        <span className="absolute -bottom-0.5 -right-0.5 text-xs leading-none">{emoji}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
                        <p className="text-xs text-orange-600 font-medium">Aguardando atendimento</p>
                      </div>
                      {conv.last_message_at && (
                        <div className="flex items-center gap-1 shrink-0 text-[11px] text-gray-400">
                          <Clock className="h-3 w-3" />
                          {timeAgo(conv.last_message_at)}
                        </div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>

            {/* Footer */}
            <div className="border-t border-orange-100 bg-orange-50 px-4 py-2">
              <button
                onClick={() => router.push('/conversations')}
                className="w-full rounded-lg bg-orange-500 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 transition-colors"
              >
                Ver todas as conversas
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
