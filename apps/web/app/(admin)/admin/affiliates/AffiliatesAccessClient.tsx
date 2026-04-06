'use client'

import { useState } from 'react'
import { Loader2, Handshake, ToggleLeft, ToggleRight, Search } from 'lucide-react'

interface Org {
  id: string
  name: string
  slug: string
  status: string
  hasAffiliates: boolean
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativo',
  trialing: 'Trial',
  past_due: 'Inadimplente',
  canceled: 'Cancelado',
  free: 'Free',
}
const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  trialing: 'bg-amber-100 text-amber-700',
  past_due: 'bg-red-100 text-red-700',
  canceled: 'bg-gray-100 text-gray-500',
  free: 'bg-blue-100 text-blue-700',
}

export function AffiliatesAccessClient({ orgs }: { orgs: Org[] }) {
  const [states, setStates] = useState<Record<string, boolean>>(
    Object.fromEntries(orgs.map((o) => [o.id, o.hasAffiliates]))
  )
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = orgs.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.slug.toLowerCase().includes(search.toLowerCase())
  )

  const enabledCount = Object.values(states).filter(Boolean).length

  async function toggle(org: Org) {
    const next = !states[org.id]
    setStates((prev) => ({ ...prev, [org.id]: next }))
    setLoading(org.id)
    setError(null)

    // Fetch current settings to merge
    const res = await fetch('/api/admin/orgs/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: org.id, module: 'affiliates', enabled: next }),
    })

    setLoading(null)
    if (!res.ok) {
      setStates((prev) => ({ ...prev, [org.id]: !next })) // revert
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Erro ao atualizar')
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Handshake className="h-6 w-6 text-primary" />
            Acesso ao Programa de Afiliados
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {enabledCount} de {orgs.length} organizações com acesso ativado
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
        <strong>Parceria com influenciadores:</strong> Ative o módulo para organizações parceiras. Elas poderão gerar links de indicação e acompanhar comissões em Afiliados no menu lateral.
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar organização..."
          className="w-full rounded-lg border pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {/* List */}
      <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma organização encontrada.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Organização</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Afiliados</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((org) => {
                const isOn = states[org.id]
                const isLoading = loading === org.id
                return (
                  <tr key={org.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium">{org.name}</p>
                      <p className="text-xs text-muted-foreground">/{org.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[org.status] ?? STATUS_COLOR.free}`}>
                        {STATUS_LABEL[org.status] ?? org.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggle(org)}
                        disabled={isLoading}
                        title={isOn ? 'Desativar acesso' : 'Ativar acesso'}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                          isOn
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : isOn ? (
                          <ToggleRight className="h-3.5 w-3.5" />
                        ) : (
                          <ToggleLeft className="h-3.5 w-3.5" />
                        )}
                        {isOn ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
