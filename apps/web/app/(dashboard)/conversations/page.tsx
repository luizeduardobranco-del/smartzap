import { MessageSquare } from 'lucide-react'

export const metadata = { title: 'Conversas' }

const kanbanColumns = [
  { id: 'new', label: 'Novos', color: 'bg-blue-500', count: 8 },
  { id: 'contacted', label: 'Em contato', color: 'bg-yellow-500', count: 5 },
  { id: 'qualified', label: 'Qualificados', color: 'bg-purple-500', count: 3 },
  { id: 'proposal', label: 'Proposta', color: 'bg-orange-500', count: 2 },
  { id: 'closed_won', label: 'Fechados', color: 'bg-green-500', count: 12 },
]

const mockConversations = [
  {
    id: '1',
    contactName: 'Maria Santos',
    phone: '+55 11 99999-0001',
    lastMessage: 'Quero saber mais sobre o plano Pro',
    stage: 'new',
    channel: 'whatsapp',
    timeAgo: '2min atrás',
    agentName: 'Atendente SAC',
    unread: 2,
  },
  {
    id: '2',
    contactName: 'João Pereira',
    phone: '+55 21 98888-0002',
    lastMessage: 'Quando posso fazer o teste gratuito?',
    stage: 'new',
    channel: 'instagram',
    timeAgo: '15min atrás',
    agentName: 'Vendas Consultivas',
    unread: 0,
  },
  {
    id: '3',
    contactName: 'Ana Costa',
    phone: '+55 31 97777-0003',
    lastMessage: 'Obrigada pelas informações!',
    stage: 'contacted',
    channel: 'whatsapp',
    timeAgo: '1h atrás',
    agentName: 'Atendente SAC',
    unread: 0,
  },
]

const channelEmoji: Record<string, string> = {
  whatsapp: '📱',
  instagram: '📸',
  widget: '💬',
}

export default function ConversationsPage() {
  const conversationsByStage = kanbanColumns.reduce(
    (acc, col) => {
      acc[col.id] = mockConversations.filter((c) => c.stage === col.id)
      return acc
    },
    {} as Record<string, typeof mockConversations>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CRM de Conversas</h1>
          <p className="text-sm text-muted-foreground">Gerencie seu pipeline de atendimento</p>
        </div>
        <div className="flex gap-2">
          <select className="rounded-lg border px-3 py-2 text-sm">
            <option>Todos os agentes</option>
            <option>Atendente SAC</option>
            <option>Vendas Consultivas</option>
          </select>
          <select className="rounded-lg border px-3 py-2 text-sm">
            <option>Todos os canais</option>
            <option>WhatsApp</option>
            <option>Instagram</option>
          </select>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {kanbanColumns.map((column) => {
          const cards = conversationsByStage[column.id] ?? []
          return (
            <div key={column.id} className="flex w-72 flex-none flex-col">
              {/* Column Header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-2.5 w-2.5 rounded-full ${column.color}`} />
                  <span className="text-sm font-medium">{column.label}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    {column.count}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-2">
                {cards.map((conv) => (
                  <ConversationCard key={conv.id} conversation={conv} />
                ))}
                {cards.length === 0 && (
                  <div className="rounded-lg border-2 border-dashed py-8 text-center text-xs text-muted-foreground">
                    Sem conversas
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ConversationCard({ conversation }: { conversation: (typeof mockConversations)[0] }) {
  return (
    <div className="cursor-pointer rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-2 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {conversation.contactName.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-medium">{conversation.contactName}</p>
            <p className="text-xs text-muted-foreground">{conversation.phone}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">{conversation.timeAgo}</span>
          {conversation.unread > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
              {conversation.unread}
            </span>
          )}
        </div>
      </div>

      <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">
        {conversation.lastMessage}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {channelEmoji[conversation.channel]} {conversation.agentName}
        </span>
        <MessageSquare className="h-3 w-3 text-muted-foreground" />
      </div>
    </div>
  )
}
