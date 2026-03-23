import Link from 'next/link'
import { Plus, Bot, Play, Pause, MoreVertical } from 'lucide-react'

export const metadata = { title: 'Agentes' }

// Mock data - será substituído por dados reais do banco
const mockAgents = [
  {
    id: '1',
    name: 'Atendente SAC',
    status: 'active',
    channels: ['whatsapp'],
    conversationsToday: 47,
    model: 'GPT-4o Mini',
    creditsUsed: 234,
  },
  {
    id: '2',
    name: 'Vendas Consultivas',
    status: 'active',
    channels: ['whatsapp', 'instagram'],
    conversationsToday: 12,
    model: 'Claude Haiku',
    creditsUsed: 89,
  },
  {
    id: '3',
    name: 'Suporte Técnico',
    status: 'draft',
    channels: [],
    conversationsToday: 0,
    model: 'GPT-4o Mini',
    creditsUsed: 0,
  },
]

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

export default function AgentsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agentes de IA</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie seus funcionários virtuais
          </p>
        </div>
        <Link
          href="/agents/new"
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Novo agente
        </Link>
      </div>

      {mockAgents.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {mockAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}

function AgentCard({ agent }: { agent: (typeof mockAgents)[0] }) {
  const status = statusConfig[agent.status as keyof typeof statusConfig]

  return (
    <div className="group rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
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
        <button className="rounded p-1 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100">
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">Conversas hoje</p>
          <p className="font-semibold">{agent.conversationsToday}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">Créditos usados</p>
          <p className="font-semibold">{agent.creditsUsed}</p>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>Modelo: {agent.model}</span>
        <div className="flex gap-1">
          {agent.channels.map((ch) => (
            <span key={ch} title={ch}>{channelIcons[ch]}</span>
          ))}
          {agent.channels.length === 0 && <span>Sem canal</span>}
        </div>
      </div>

      <div className="flex gap-2">
        <Link
          href={`/agents/${agent.id}`}
          className="flex-1 rounded-lg border px-3 py-1.5 text-center text-xs font-medium hover:bg-muted"
        >
          Configurar
        </Link>
        <button className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted">
          {agent.status === 'active' ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
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
