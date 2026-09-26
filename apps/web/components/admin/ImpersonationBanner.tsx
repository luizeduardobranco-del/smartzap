'use client'

import { useState } from 'react'
import { ShieldAlert, LogOut, Loader2 } from 'lucide-react'

/**
 * Faixa fixa no topo enquanto o suporte está dentro da conta de um cliente.
 *
 * Existe para que ninguém se confunda sobre em qual conta está digitando —
 * mexer no agente errado por engano é o acidente clássico desse recurso.
 */
export function ImpersonationBanner({
  targetEmail,
  adminEmail,
}: {
  targetEmail: string
  adminEmail: string
}) {
  const [saindo, setSaindo] = useState(false)

  async function sair() {
    setSaindo(true)
    try {
      const res = await fetch('/api/admin/impersonate/exit', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      window.location.href = json?.redirect ?? '/login'
    } catch {
      window.location.href = '/login'
    }
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm text-amber-950">
      <span className="flex items-center gap-2 font-medium">
        <ShieldAlert className="h-4 w-4" />
        Modo suporte — você está na conta de <strong>{targetEmail}</strong>
        <span className="hidden font-normal opacity-80 sm:inline">· acesso registrado como {adminEmail}</span>
      </span>

      <button
        onClick={sair}
        disabled={saindo}
        className="flex items-center gap-1.5 rounded-md bg-amber-950/10 px-3 py-1 font-medium hover:bg-amber-950/20 disabled:opacity-60"
      >
        {saindo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
        Voltar para minha conta
      </button>
    </div>
  )
}
