'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { Plus, Layers, Users, ChevronRight, Trash2, Loader2, GitBranch, HelpCircle } from 'lucide-react'
import Link from 'next/link'
import { FunnelHelpModal } from '@/components/funnels/FunnelHelpModal'

export default function FunnelsPage() {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const utils = trpc.useUtils()

  const { data: funnels, isLoading } = trpc.funnels.list.useQuery()
  const createMutation = trpc.funnels.create.useMutation({
    onSuccess: () => {
      utils.funnels.list.invalidate()
      setCreating(false)
      setNewName('')
    },
  })
  const deleteMutation = trpc.funnels.delete.useMutation({
    onSuccess: () => utils.funnels.list.invalidate(),
  })

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    createMutation.mutate({ name: newName.trim() })
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {showHelp && <FunnelHelpModal onClose={() => setShowHelp(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Funis de Prospecção</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gerencie sequências automáticas de mensagens e acompanhe leads por etapa
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-muted transition-colors"
            title="Como funciona"
          >
            <HelpCircle className="h-4 w-4" />
            Como funciona
          </button>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Novo funil
          </button>
        </div>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold">Nome do novo funil</p>
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: Clientes Tintas, Prospecção B2B..."
              className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={createMutation.isPending || !newName.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Criar
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewName('') }}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancelar
            </button>
          </form>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && (!funnels || funnels.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-20 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
            <GitBranch className="h-8 w-8 text-blue-500" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">Nenhum funil criado</h3>
          <p className="mt-1 max-w-xs text-sm text-slate-500">
            Crie um funil para organizar leads em etapas e disparar sequências automáticas de mensagens
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Criar primeiro funil
          </button>
        </div>
      )}

      {/* Funnels grid */}
      {!isLoading && funnels && funnels.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {funnels.map((funnel: any) => {
            const stages = funnel.funnel_stages ?? []
            const contacts = funnel.funnel_contacts ?? []
            const activeContacts = contacts.filter((c: any) => c.status === 'active' || c.status === 'waiting').length

            return (
              <div
                key={funnel.id}
                className="group relative flex flex-col rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition-all"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                    <Layers className="h-5 w-5 text-blue-600" />
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      if (confirm(`Excluir funil "${funnel.name}"? Todos os leads serão removidos.`)) {
                        deleteMutation.mutate({ id: funnel.id })
                      }
                    }}
                    className="rounded-lg p-1.5 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <h3 className="text-base font-bold text-slate-900">{funnel.name}</h3>

                <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" />
                    {stages.length} etapas
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {activeContacts} leads
                  </span>
                </div>

                {/* Stage pills */}
                {stages.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {stages
                      .sort((a: any, b: any) => a.position - b.position)
                      .slice(0, 4)
                      .map((s: any) => (
                        <span
                          key={s.id}
                          className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: s.color }}
                        >
                          {s.name}
                        </span>
                      ))}
                    {stages.length > 4 && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        +{stages.length - 4}
                      </span>
                    )}
                  </div>
                )}

                <Link
                  href={`/funnels/${funnel.id}`}
                  className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  Abrir funil
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
