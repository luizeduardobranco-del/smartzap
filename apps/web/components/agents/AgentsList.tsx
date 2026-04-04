'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Bot, Play, Pause, Trash2, Loader2, Sparkles, WifiOff } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

const statusConfig = {
  active: { label: 'Ativo', class: 'bg-green-100 text-green-700' },
  paused: { label: 'Pausado', class: 'bg-yellow-100 text-yellow-700' },
  draft: { label: 'Rascunho', class: 'bg-gray-100 text-gray-600' },
  archived: { label: 'Arquivado', class: 'bg-red-100 text-red-700' },
}

const channelIcons: Record<string, string> = {
  whatsapp: '📱',
  instagram: '📸',
  widget: '💬',
}

export function AgentsList() {
  const { data: agents = [], isLoading } = trpc.agents.list.useQuery()
  const utils = trpc.useUtils()
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)

  const toggleStatus = trpc.agents.toggleStatus.useMutation({
    onSuccess: () => utils.agents.list.invalidate(),
  })

  const deleteAgent = trpc.agents.delete.useMutation({
    onSuccess: () => {
      setConfirmingDelete(null)
      utils.agents.list.invalidate()
    },
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agentes de IA</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus funcionários virtuais</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/agents/new/skill"
            className="flex items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5"
          >
            <Sparkles className="h-4 w-4" />
            Criar com IA
          </Link>
          <Link
            href="/agents/new"
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Novo agente
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : agents.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => {
            const status = statusConfig[agent.status as keyof typeof statusConfig] ?? statusConfig.draft
            const isActive = agent.status === 'active'
            const channelRows: { type: string; status: string }[] = (agent as any).channels ?? []
            const channels = channelRows
              .filter((c) => c.status !== 'disconnected')
              .map((c) => c.type)
            const hasDisconnected = channelRows.some((c) => c.status === 'disconnected')
            const isConfirming = confirmingDelete === agent.id
            const isDeleting = deleteAgent.isPending && confirmingDelete === agent.id

            return (
              <div key={agent.id} className={`group rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${hasDisconnected ? 'border-red-300' : ''}`}>
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{agent.name}</h3>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${status.class}`}>
                        {status.label}
                      </span>
                    </div>
                  </div>
                  {isConfirming ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Excluir?</span>
                      <button
                        onClick={() => deleteAgent.mutate({ id: agent.id })}
                        disabled={isDeleting}
                        className="rounded px-2 py-0.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
                      >
                        {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Sim'}
                      </button>
                      <button
                        onClick={() => setConfirmingDelete(null)}
                        className="rounded px-2 py-0.5 text-xs font-medium border hover:bg-muted"
                      >
                        Não
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingDelete(agent.id)}
                      className="rounded p-1 text-muted-foreground opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                      title="Excluir agente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {hasDisconnected && (
                  <Link href={`/agents/${agent.id}`} className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors">
                    <WifiOff className="h-3.5 w-3.5 shrink-0" />
                    Canal desconectado — clique para reconectar
                  </Link>
                )}

                {agent.description && (
                  <p className="mb-3 text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
                )}

                <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Modelo: {(agent.ai_config as any)?.model ?? 'GPT-4o Mini'}</span>
                  <div className="flex gap-1">
                    {channels.length > 0
                      ? channels.map((ch) => <span key={ch} title={ch}>{channelIcons[ch]}</span>)
                      : <span>Sem canal</span>
                    }
                  </div>
                </div>

                <div className="flex gap-2">
                  <Link
                    href={`/agents/${agent.id}`}
                    className="flex-1 rounded-lg border px-3 py-1.5 text-center text-xs font-medium hover:bg-muted"
                  >
                    Configurar
                  </Link>
                  <button
                    onClick={() => toggleStatus.mutate({ id: agent.id, status: isActive ? 'paused' : 'active' })}
                    disabled={toggleStatus.isPending}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Bot className="h-8 w-8 text-primary" />
      </div>
      <h3 className="mb-2 text-lg font-semibold">Nenhum agente criado</h3>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">
        Crie seu primeiro agente de IA e comece a automatizar o atendimento do seu negócio.
      </p>
      <Link
        href="/agents/new"
        className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" />
        Criar primeiro agente
      </Link>
    </div>
  )
}
