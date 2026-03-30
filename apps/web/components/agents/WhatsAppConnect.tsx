'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Smartphone, Loader2, CheckCircle, XCircle, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

type ConnectionState = 'idle' | 'creating' | 'qr' | 'connected' | 'error'

interface QRPollResult {
  state: 'open' | 'connecting' | 'close'
  qrBase64: string | null
}

interface ChannelData {
  id: string
  status: string
  config: { phone?: string } | null
}

export function WhatsAppConnect({ agentId }: { agentId: string }) {
  const utils = trpc.useUtils()
  const { data: channels = [], isLoading } = trpc.channels.listByAgent.useQuery({ agentId })
  const deleteChannel = trpc.channels.delete.useMutation({
    onSuccess: () => utils.channels.listByAgent.invalidate({ agentId }),
  })

  const existingChannel = channels.find(
    (c) => c.type === 'whatsapp' && c.status !== 'disconnected'
  ) as ChannelData | undefined

  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (existingChannel?.status === 'connected') {
    return (
      <ConnectedState
        channel={existingChannel}
        onDisconnect={async () => {
          await fetch(`/api/channels/whatsapp/${existingChannel.id}/disconnect`, { method: 'POST' })
          utils.channels.listByAgent.invalidate({ agentId })
        }}
      />
    )
  }

  if (existingChannel?.status === 'connecting') {
    return (
      <QRCodeFlow
        channelId={existingChannel.id}
        agentId={agentId}
        onConnected={() => utils.channels.listByAgent.invalidate({ agentId })}
        onCancel={async () => {
          await fetch(`/api/channels/whatsapp/${existingChannel.id}/disconnect`, { method: 'POST' })
          utils.channels.listByAgent.invalidate({ agentId })
        }}
      />
    )
  }

  return (
    <StartConnect
      agentId={agentId}
      onStarted={() => utils.channels.listByAgent.invalidate({ agentId })}
    />
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function StartConnect({ agentId, onStarted }: { agentId: string; onStarted: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConnect = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/channels/whatsapp/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao conectar')
      onStarted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center rounded-xl border-2 border-dashed py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
        <Smartphone className="h-7 w-7 text-green-600" />
      </div>
      <h3 className="mb-1 font-semibold">Conectar WhatsApp</h3>
      <p className="mb-6 max-w-xs text-sm text-muted-foreground">
        Conecte um número de WhatsApp para que o agente possa atender seus clientes.
      </p>
      {error && (
        <p className="mb-4 flex items-center gap-1.5 text-sm text-red-500">
          <XCircle className="h-4 w-4" /> {error}
        </p>
      )}
      <button
        onClick={handleConnect}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
        {loading ? 'Preparando...' : 'Conectar WhatsApp'}
      </button>
    </div>
  )
}

function QRCodeFlow({
  channelId,
  agentId,
  onConnected,
  onCancel,
}: {
  channelId: string
  agentId: string
  onConnected: () => void
  onCancel: () => void
}) {
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [state, setState] = useState<ConnectionState>('qr')
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const attemptRef = useRef(0)

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/channels/whatsapp/${channelId}/qrcode`)
      if (!res.ok) throw new Error('Falha ao verificar status')
      const data: QRPollResult = await res.json()

      if (data.state === 'open') {
        setState('connected')
        clearInterval(intervalRef.current!)
        setTimeout(onConnected, 1500) // brief delay to show success
        return
      }

      if (data.qrBase64) {
        setQrBase64(data.qrBase64)
        setState('qr')
      }

      attemptRef.current += 1
      // Timeout after ~10 min (120 * 5s) — give more time for slow connections
      if (attemptRef.current > 120) {
        setError('Tempo esgotado. Tente novamente.')
        setState('error')
        clearInterval(intervalRef.current!)
      }
    } catch {
      // Network error — keep polling silently
    }
  }, [channelId, onConnected])

  useEffect(() => {
    poll() // immediate first call
    intervalRef.current = setInterval(poll, 5000)
    return () => clearInterval(intervalRef.current!)
  }, [poll])

  if (state === 'connected') {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
          <CheckCircle className="h-7 w-7 text-green-600" />
        </div>
        <h3 className="font-semibold text-green-700">WhatsApp conectado!</h3>
        <p className="mt-1 text-sm text-muted-foreground">Redirecionando...</p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center rounded-xl border-2 border-dashed py-10 text-center">
        <XCircle className="mb-3 h-10 w-10 text-red-400" />
        <h3 className="font-semibold">Erro de conexão</h3>
        <p className="mb-4 text-sm text-muted-foreground">{error}</p>
        <div className="flex gap-2">
          <button
            onClick={() => { attemptRef.current = 0; setState('qr'); setError(null); poll() }}
            className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <div className="mb-5 text-center">
        <h3 className="font-semibold">Escaneie o QR Code</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Abra o WhatsApp → <strong>Aparelhos conectados</strong> → <strong>Conectar aparelho</strong>
        </p>
      </div>

      {/* QR Code display */}
      <div className="relative mb-5 flex h-56 w-56 items-center justify-center rounded-2xl border-2 border-dashed bg-white p-2">
        {qrBase64 ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrBase64.startsWith('data:') ? qrBase64 : `data:image/png;base64,${qrBase64}`}
              alt="QR Code WhatsApp"
              className="h-full w-full rounded-lg object-contain"
            />
            {/* Green scanning animation border */}
            <div className="pointer-events-none absolute inset-0 animate-pulse rounded-2xl border-2 border-green-400 opacity-40" />
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-xs">Gerando QR Code...</span>
          </div>
        )}
      </div>

      {/* Steps */}
      <ol className="mb-5 space-y-1.5 text-left text-sm text-muted-foreground">
        {[
          'Abra o WhatsApp no seu celular',
          'Toque em ⋮ (Menu) → Aparelhos conectados',
          'Toque em "Conectar aparelho"',
          'Aponte a câmera para o QR Code acima',
        ].map((step, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Aguardando conexão...
        </span>
        <button
          onClick={onCancel}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

function ConnectedState({
  channel,
  onDisconnect,
}: {
  channel: ChannelData
  onDisconnect: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const config = channel.config as { phone?: string } | null
  const phone = config?.phone

  const handleDisconnect = async () => {
    setLoading(true)
    setConfirming(false)
    await onDisconnect()
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600">
            <Smartphone className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">WhatsApp conectado</p>
              <Wifi className="h-4 w-4 text-green-600" />
            </div>
            {phone && <p className="text-sm text-muted-foreground">{phone}</p>}
          </div>
        </div>
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Confirmar?</span>
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Sim'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Não
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            <WifiOff className="h-3.5 w-3.5" />
            Desconectar
          </button>
        )}
      </div>

      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">
          O agente está recebendo e respondendo mensagens automaticamente neste número.
          Para pausar sem desconectar, use o botão <strong>Pausar</strong> no topo da página.
        </p>
      </div>
    </div>
  )
}
