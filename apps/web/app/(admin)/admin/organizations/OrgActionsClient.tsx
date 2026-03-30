'use client'

import { useState } from 'react'
import { Loader2, Coins, Ban, CheckCircle } from 'lucide-react'

interface Props {
  orgId: string
  orgName: string
}

export function OrgActionsClient({ orgId, orgName }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [credits, setCredits] = useState('')
  const [showCredits, setShowCredits] = useState(false)

  async function addCredits() {
    const amount = parseInt(credits)
    if (!amount || amount <= 0) return
    setLoading('credits')
    await fetch('/api/admin/credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, amount }),
    })
    setLoading(null)
    setShowCredits(false)
    setCredits('')
    window.location.reload()
  }

  async function toggleBlock(block: boolean) {
    setLoading(block ? 'block' : 'unblock')
    await fetch('/api/admin/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, status: block ? 'canceled' : 'active' }),
    })
    setLoading(null)
    window.location.reload()
  }

  return (
    <div className="flex items-center gap-1">
      {showCredits ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            placeholder="qtd"
            className="w-20 rounded border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={addCredits}
            disabled={loading === 'credits'}
            className="rounded bg-primary px-2 py-1 text-xs text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {loading === 'credits' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'OK'}
          </button>
          <button
            onClick={() => setShowCredits(false)}
            className="rounded border px-2 py-1 text-xs hover:bg-muted"
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => setShowCredits(true)}
            title="Adicionar créditos"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Coins className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => toggleBlock(true)}
            disabled={!!loading}
            title="Bloquear acesso"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600"
          >
            {loading === 'block' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => toggleBlock(false)}
            disabled={!!loading}
            title="Reativar acesso"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-green-600"
          >
            {loading === 'unblock' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
          </button>
        </>
      )}
    </div>
  )
}
