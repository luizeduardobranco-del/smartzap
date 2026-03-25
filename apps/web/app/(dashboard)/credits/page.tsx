import { PlansManager } from '@/components/billing/PlansManager'

export const metadata = { title: 'Planos & Créditos' }

export default function CreditsPage({
  searchParams,
}: {
  searchParams: { blocked?: string; success?: string }
}) {
  const isBlocked = searchParams.blocked === '1'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Planos & Créditos</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie seu plano e acompanhe seus créditos de atendimento
        </p>
      </div>

      <PlansManager blocked={isBlocked} />
    </div>
  )
}
