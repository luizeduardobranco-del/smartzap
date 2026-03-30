import { KanbanBoard } from '@/components/crm/KanbanBoard'

export const metadata = { title: 'CRM' }

export default function CrmPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">CRM</h1>
        <p className="text-sm text-muted-foreground">Gerencie seus leads e oportunidades</p>
      </div>
      <KanbanBoard />
    </div>
  )
}
