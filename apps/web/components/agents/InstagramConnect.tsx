'use client'

import { useEffect, useState } from 'react'
import { Instagram, Loader2, CheckCircle, WifiOff, XCircle } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { useSearchParams } from 'next/navigation'

interface ChannelData {
  id: string
  status: string
  config: { igUsername?: string; pageName?: string } | null
}

export function InstagramConnect({ agentId }: { agentId: string }) {
  const utils = trpc.useUtils()
  const searchParams = useSearchParams()
  const { data: channels = [], isLoading } = trpc.channels.listByAgent.useQuery({ agentId })

  // Show feedback from OAuth redirect
  const [oauthStatus, setOauthStatus] = useState<'success' | 'error' | 'no_page' | 'no_ig_account' | null>(null)

  useEffect(() => {
    if (searchParams.get('instagram_success') === '1') {
      setOauthStatus('success')
      utils.channels.listByAgent.invalidate({ agentId })
    } else if (searchParams.get('instagram_error') === 'no_page') {
      setOauthStatus('no_page')
    } else if (searchParams.get('instagram_error') === 'no_ig_account') {
      setOauthStatus('no_ig_account')
    } else if (searchParams.get('instagram_error') === '1') {
      setOauthStatus('error')
    }
  }, [searchParams, agentId, utils.channels.listByAgent])

  if (isLoading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const existingChannel = channels.find(
    (c) => c.type === 'instagram' && c.status !== 'disconnected'
  ) as ChannelData | undefined

  if (existingChannel?.status === 'connected') {
    return (
      <ConnectedState
        channel={existingChannel}
        onDisconnect={async () => {
          await fetch(`/api/channels/instagram/${existingChannel.id}/disconnect`, { method: 'POST' })
          utils.channels.listByAgent.invalidate({ agentId })
        }}
      />
    )
  }

  return (
    <NotConnectedState
      agentId={agentId}
      oauthStatus={oauthStatus}
      onClearStatus={() => setOauthStatus(null)}
    />
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function NotConnectedState({
  agentId,
  oauthStatus,
  onClearStatus,
}: {
  agentId: string
  oauthStatus: 'success' | 'error' | 'no_page' | 'no_ig_account' | null
  onClearStatus: () => void
}) {
  const errorMessage =
    oauthStatus === 'error' || oauthStatus === 'no_page' || oauthStatus === 'no_ig_account'
      ? 'Erro ao conectar. Certifique-se de que sua conta é Business ou Creator e tente novamente.'
      : null

  return (
    <div className="flex flex-col items-center rounded-xl border-2 border-dashed py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
        <Instagram className="h-7 w-7 text-white" />
      </div>
      <h3 className="mb-1 font-semibold">Conectar Instagram</h3>
      <p className="mb-6 max-w-xs text-sm text-muted-foreground">
        Conecte sua conta Instagram Business para o agente responder Direct Messages automaticamente.
      </p>

      {errorMessage && (
        <p className="mb-4 flex items-center gap-1.5 text-sm text-red-500">
          <XCircle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </p>
      )}

      <a
        href={`/api/auth/instagram?agentId=${agentId}`}
        onClick={onClearStatus}
        className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-2.5 text-sm font-medium text-white hover:opacity-90"
      >
        <Instagram className="h-4 w-4" />
        Conectar com o Instagram
      </a>

      <p className="mt-4 max-w-xs text-xs text-muted-foreground">
        Você será redirecionado para o Instagram. É necessário uma conta Business ou Creator.
      </p>
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
  const config = channel.config as { igUsername?: string; pageName?: string } | null

  const handleDisconnect = async () => {
    setLoading(true)
    setConfirming(false)
    await onDisconnect()
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
            <Instagram className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">Instagram conectado</p>
              <CheckCircle className="h-4 w-4 text-purple-600" />
            </div>
            {config?.igUsername && (
              <p className="text-sm text-muted-foreground">@{config.igUsername}</p>
            )}
            {config?.pageName && !config.igUsername && (
              <p className="text-sm text-muted-foreground">{config.pageName}</p>
            )}
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
          O agente está recebendo e respondendo Direct Messages automaticamente nesta conta Instagram.
        </p>
      </div>
    </div>
  )
}
