import { getAllPlans } from '@/lib/admin'
import { PlanEditClient } from './PlanEditClient'
import { CreditCard, Users, Zap, BarChart2, Code, Cpu, Palette } from 'lucide-react'

export const metadata = { title: 'Planos — Admin' }

function formatBRL(centavos: number) {
  if (!centavos) return 'R$ 0,00'
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function PlansPage() {
  const plans = await getAllPlans()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Planos</h1>
        <p className="text-sm text-muted-foreground">{plans.length} planos configurados na plataforma</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((plan: any) => {
          const limits = plan.limits ?? {}
          return (
            <div key={plan.id} className="rounded-xl border bg-white shadow-sm p-5 space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">{plan.name}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      plan.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {plan.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">/{plan.slug}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-primary">{formatBRL(plan.price_monthly)}<span className="text-xs font-normal text-muted-foreground">/mês</span></p>
                  {plan.price_yearly > 0 && (
                    <p className="text-xs text-muted-foreground">{formatBRL(plan.price_yearly)}/ano</p>
                  )}
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Créditos/mês</p>
                  <p className="text-lg font-bold">{(plan.credits_monthly ?? 0).toLocaleString('pt-BR')}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Agentes</p>
                  <p className="text-lg font-bold">{limits.maxAgents ?? '∞'}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Membros</p>
                  <p className="text-lg font-bold">{limits.maxTeamMembers ?? '∞'}</p>
                </div>
              </div>

              {/* Limits */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limites e funcionalidades</p>
                <div className="flex flex-wrap gap-2">
                  {limits.maxChannels != null && (
                    <span className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs">
                      <Zap className="h-3 w-3 text-muted-foreground" />
                      {limits.maxChannels} canal{limits.maxChannels !== 1 ? 'is' : ''}
                    </span>
                  )}
                  {limits.maxDocumentsPerAgent != null && (
                    <span className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs">
                      <CreditCard className="h-3 w-3 text-muted-foreground" />
                      {limits.maxDocumentsPerAgent} docs/agente
                    </span>
                  )}
                  {limits.hasAnalytics && (
                    <span className="flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2.5 py-1 text-xs">
                      <BarChart2 className="h-3 w-3" />
                      Analytics
                    </span>
                  )}
                  {limits.hasApiAccess && (
                    <span className="flex items-center gap-1 rounded-full bg-purple-50 text-purple-700 px-2.5 py-1 text-xs">
                      <Code className="h-3 w-3" />
                      API
                    </span>
                  )}
                  {limits.hasAutomations && (
                    <span className="flex items-center gap-1 rounded-full bg-orange-50 text-orange-700 px-2.5 py-1 text-xs">
                      <Cpu className="h-3 w-3" />
                      Automações
                    </span>
                  )}
                  {limits.hasCustomBranding && (
                    <span className="flex items-center gap-1 rounded-full bg-pink-50 text-pink-700 px-2.5 py-1 text-xs">
                      <Palette className="h-3 w-3" />
                      Marca própria
                    </span>
                  )}
                </div>
              </div>

              {/* Actions + inline edit */}
              <PlanEditClient plan={plan} />
            </div>
          )
        })}
      </div>

      {plans.length === 0 && (
        <div className="rounded-xl border bg-white p-12 text-center text-sm text-muted-foreground shadow-sm">
          Nenhum plano encontrado.
        </div>
      )}
    </div>
  )
}
