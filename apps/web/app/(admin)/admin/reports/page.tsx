import { getAllOrgs, getAllPlans } from '@/lib/admin'
import { TrendingUp, DollarSign, Building2, CreditCard } from 'lucide-react'

export const metadata = { title: 'Relatórios — Admin' }

function formatBRL(centavos: number) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function getMonthLabel(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

export default async function ReportsPage() {
  const [orgs, plans] = await Promise.all([getAllOrgs(), getAllPlans()])

  // --- Revenue ---
  const planMap: Record<string, any> = {}
  for (const p of plans) {
    planMap[p.id] = p
  }

  const revenueByPlan: Record<string, { name: string; count: number; priceMonthly: number; total: number }> = {}
  for (const org of orgs) {
    if (org.subscription_status !== 'active') continue
    const plan = planMap[org.plan_id as string]
    if (!plan) continue
    if (!revenueByPlan[plan.id]) {
      revenueByPlan[plan.id] = { name: plan.name, count: 0, priceMonthly: plan.price_monthly, total: 0 }
    }
    revenueByPlan[plan.id].count++
    revenueByPlan[plan.id].total += plan.price_monthly
  }

  const totalRevenue = Object.values(revenueByPlan).reduce((s, r) => s + r.total, 0)

  // --- Growth: new orgs per month (last 6 months) ---
  const now = new Date()
  const months: { label: string; key: string; count: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    months.push({ label, key, count: 0 })
  }

  for (const org of orgs) {
    const d = new Date(org.created_at as string)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const slot = months.find((m) => m.key === key)
    if (slot) slot.count++
  }

  const maxGrowth = Math.max(...months.map((m) => m.count), 1)

  // --- Plan distribution ---
  const planDist: Record<string, { name: string; count: number }> = {}
  for (const org of orgs) {
    const plan = planMap[org.plan_id as string]
    const key = plan?.id ?? 'unknown'
    const name = plan?.name ?? 'Sem plano'
    if (!planDist[key]) planDist[key] = { name, count: 0 }
    planDist[key].count++
  }
  const planDistArr = Object.values(planDist).sort((a, b) => b.count - a.count)
  const totalOrgsDist = orgs.length || 1

  // --- Status distribution ---
  const statusCounts: Record<string, number> = {
    active: 0,
    trialing: 0,
    past_due: 0,
    canceled: 0,
    free: 0,
  }
  for (const org of orgs) {
    const s = (org.subscription_status as string) ?? 'free'
    if (statusCounts[s] !== undefined) statusCounts[s]++
    else statusCounts['free']++
  }

  // --- Top orgs by credits ---
  const topOrgs = [...orgs]
    .sort((a: any, b: any) => (b.credits_balance ?? 0) - (a.credits_balance ?? 0))
    .slice(0, 8)

  const statusLabels: Record<string, string> = {
    active: 'Ativo',
    trialing: 'Em trial',
    past_due: 'Pagamento atrasado',
    canceled: 'Cancelado',
    free: 'Free',
  }
  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    trialing: 'bg-amber-100 text-amber-700',
    past_due: 'bg-red-100 text-red-700',
    canceled: 'bg-gray-100 text-gray-600',
    free: 'bg-blue-100 text-blue-700',
  }
  const statusBarColors: Record<string, string> = {
    active: 'bg-green-500',
    trialing: 'bg-amber-400',
    past_due: 'bg-red-500',
    canceled: 'bg-gray-400',
    free: 'bg-blue-400',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Visão financeira e de crescimento da plataforma</p>
      </div>

      {/* Revenue */}
      <div className="rounded-xl border bg-white shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-600" />
          <h2 className="font-semibold">Receita estimada (assinaturas ativas)</h2>
        </div>
        <div className="flex items-end gap-6">
          <div>
            <p className="text-3xl font-bold text-green-700">{formatBRL(totalRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">por mês, com base nos planos ativos</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Plano</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Assinaturas ativas</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Preço/mês</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Receita</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {Object.values(revenueByPlan).map((r) => (
                <tr key={r.name} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 text-right">{r.count}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatBRL(r.priceMonthly)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700">{formatBRL(r.total)}</td>
                </tr>
              ))}
              {Object.keys(revenueByPlan).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhuma assinatura ativa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Growth chart */}
      <div className="rounded-xl border bg-white shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Crescimento — novas organizações (últimos 6 meses)</h2>
        </div>
        <div className="flex items-end gap-3 h-32">
          {months.map((m) => {
            const pct = Math.round((m.count / maxGrowth) * 100)
            return (
              <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-medium text-muted-foreground">{m.count}</span>
                <div className="w-full rounded-t-sm bg-primary/20 relative overflow-hidden" style={{ height: '80px' }}>
                  <div
                    className="absolute bottom-0 w-full rounded-t-sm bg-primary transition-all"
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{m.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Plan + Status distribution side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Plan distribution */}
        <div className="rounded-xl border bg-white shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-purple-600" />
            <h2 className="font-semibold">Distribuição por plano</h2>
          </div>
          <div className="space-y-3">
            {planDistArr.map((p) => {
              const pct = Math.round((p.count / totalOrgsDist) * 100)
              return (
                <div key={p.name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground">{p.count} org{p.count !== 1 ? 's' : ''} ({pct}%)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            {planDistArr.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma organização.</p>
            )}
          </div>
        </div>

        {/* Status distribution */}
        <div className="rounded-xl border bg-white shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h2 className="font-semibold">Distribuição por status</h2>
          </div>
          <div className="space-y-3">
            {Object.entries(statusCounts).map(([s, count]) => {
              const pct = Math.round((count / totalOrgsDist) * 100)
              return (
                <div key={s} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[s] ?? statusColors.free}`}>
                        {statusLabels[s] ?? s}
                      </span>
                    </div>
                    <span className="text-muted-foreground">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${statusBarColors[s] ?? 'bg-gray-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Top orgs by credits */}
      <div className="rounded-xl border bg-white shadow-sm p-5 space-y-4">
        <h2 className="font-semibold">Top organizações por créditos disponíveis</h2>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">#</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Organização</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Plano</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Créditos</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {topOrgs.map((org: any, idx) => {
                const plan = Array.isArray(org.plans) ? org.plans[0] : org.plans
                const status = (org.subscription_status as string) ?? 'free'
                return (
                  <tr key={org.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground font-medium">#{idx + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{org.name}</p>
                      <p className="text-xs text-muted-foreground">{org.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{plan?.name ?? 'Free'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[status] ?? statusColors.free}`}>
                        {statusLabels[status] ?? status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      {(org.credits_balance ?? 0).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                )
              })}
              {topOrgs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhuma organização ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
