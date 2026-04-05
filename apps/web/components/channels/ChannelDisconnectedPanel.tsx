'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { WifiOff, ChevronDown, ChevronUp, GripVertical, RefreshCw, X } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

const channelLabel: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  widget: 'Widget',
}

const channelEmoji: Record<string, string> = {
  whatsapp: '📱',
  instagram: '📸',
  widget: '💬',
}

export function ChannelDisconnectedPanel() {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [pos, setPos] = useState({ right: 20, bottom: 20 })
  const dragRef = useRef<{ startX: number; startY: number; startRight: number; startBottom: number } | null>(null)
  const wasDragRef = useRef(false)

  const { data: channels = [] } = trpc.channels.list.useQuery(undefined, {
    refetchInterval: 15000,
    onSuccess: () => {
      // Re-show panel if new disconnection detected after dismiss
      setDismissed(false)
    },
  })

  // Deduplicate by id and filter disconnected only
  const seen = new Set<string>()
  const disconnected = (channels as any[]).filter((c) => {
    if (c.status !== 'disconnected') return false
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })

  function handleDragMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    wasDragRef.current = false
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: pos.right,
      startBottom: pos.bottom,
    }

    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) wasDragRef.current = true
      setPos({
        right: Math.max(5, dragRef.current.startRight - dx),
        bottom: Math.max(5, dragRef.current.startBottom - dy),
      })
    }

    function onUp() {
      dragRef.current = null
      // Reset after mouseup so next click works normally
      setTimeout(() => { wasDragRef.current = false }, 0)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (disconnected.length === 0 || dismissed) return null

  return (
    <div
      className="fixed z-40 flex flex-col-reverse"
      style={{ right: pos.right, bottom: pos.bottom, maxWidth: 320 }}
    >
      {/* Toggle bar */}
      <div className="flex items-center self-end rounded-2xl bg-red-500 shadow-lg overflow-hidden">
        {/* Drag handle */}
        <div
          onMouseDown={handleDragMouseDown}
          className="flex items-center pl-3 pr-1 py-2.5 cursor-grab active:cursor-grabbing text-white/70 hover:text-white"
          title="Mover"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-2.5 text-white hover:text-white/90 transition-colors"
        >
          <div className="relative">
            <WifiOff className="h-4 w-4" />
            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-red-600">
              {disconnected.length}
            </span>
          </div>
          <span className="text-sm font-semibold">
            {disconnected.length === 1 ? 'Canal desconectado' : `${disconnected.length} canais desconectados`}
          </span>
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>

        {/* Close / dismiss */}
        <button
          onClick={() => setDismissed(true)}
          title="Fechar"
          className="flex items-center justify-center px-3 py-2.5 text-white/70 hover:text-white transition-colors border-l border-red-400"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Expandable panel */}
      {open && (
        <div className="mb-2 w-80 rounded-2xl border border-red-200 bg-white shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 bg-red-50 px-4 py-2.5 border-b border-red-100">
            <WifiOff className="h-4 w-4 text-red-600" />
            <span className="text-sm font-semibold text-red-900">
              {disconnected.length} canal{disconnected.length > 1 ? 'is' : ''} sem conexão
            </span>
          </div>

          {/* List */}
          <ul className="max-h-60 overflow-y-auto divide-y divide-red-50">
            {disconnected.map((ch: any) => {
              const agentName = ch.agents?.name ?? 'Agente'
              const agentId = ch.agent_id
              const emoji = channelEmoji[ch.type] ?? '📱'
              const label = channelLabel[ch.type] ?? ch.type
              const instanceName = ch.credentials?.instanceName ?? ''

              return (
                <li key={ch.id}>
                  <button
                    onClick={() => router.push(`/agents/${agentId}`)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-red-50 transition-colors"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-lg">
                      {emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{agentName}</p>
                      <p className="truncate text-xs text-red-600 font-medium">
                        {label}{instanceName ? ` · ${instanceName}` : ''}
                      </p>
                    </div>
                    <RefreshCw className="h-4 w-4 shrink-0 text-red-400" />
                  </button>
                </li>
              )
            })}
          </ul>

          {/* Footer */}
          <div className="border-t border-red-100 bg-red-50 px-4 py-2.5 space-y-1">
            <p className="text-[11px] text-red-500 text-center">
              Clique no canal para reconectar via QR Code
            </p>
            <button
              onClick={() => router.push('/agents')}
              className="w-full rounded-lg bg-red-500 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors"
            >
              Ir para Agentes
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
