import { AgentEditor } from '@/components/agents/AgentEditor'

export const metadata = { title: 'Configurar Agente' }

export default function AgentPage({ params }: { params: { id: string } }) {
  return <AgentEditor agentId={params.id} />
}
