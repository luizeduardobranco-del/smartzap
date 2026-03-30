import { NewAgentWizard } from '@/components/agents/NewAgentWizard'

export const metadata = { title: 'Novo Agente' }

export default function NewAgentPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Criar novo agente</h1>
        <p className="text-sm text-muted-foreground">Configure seu funcionário virtual em poucos passos</p>
      </div>
      <NewAgentWizard />
    </div>
  )
}
