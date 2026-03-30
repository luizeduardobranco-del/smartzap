import { getAdminStats } from '@/lib/admin'
import { Building2, Users, CreditCard, TrendingUp } from 'lucide-react'

export const metadata = { title: 'Admin — White Zap' }

export default async function AdminPage() {
  const { organizations, totalOrgs, totalUsers } = await getAdminStats()

  const active = organizations.filter((o: any) => o.subscription_status === 'active').length
  const trial = organizations.filter((o: any) => o.subscription_status === 'trialing').length
  const pastDue = organizations.filter((o: any) => o.subscription_status === 'past_due').length
  const totalCredits = organizations.reduce((sum: number, o: any) => sum + (o.credits_balance ?? 0), 0)

  const recentOrgs = [...organizations]
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Painel do Administrador</h1>
        <p className="text-sm text-muted-foreground">Visão geral da plataforma White Zap</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Organizações', value: totalOrgs, icon: Building2, color: 'text-blue-600 bg-blue-50' },
          { label: 'Usuários', value: totalUsers, icon: Users, color: 'text-purple-600 bg-purple-50' },
          { label: 'Assinaturas ativas', value: active, icon: CreditCard, color: 'text-green-600 bg-green-50' },
          { label: 'Créditos totais', value: totalCredits.toLocaleString('pt-BR'), icon: TrendingUp, color: 'text-orange-600 bg-orange-50' },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <div className={`rounded-lg p-2 ${stat.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold">{stat.value}</p>
            </div>
          )
        })}
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Em trial', value: trial, color: 'bg-amber-100 text-amber-700' },
          { label: 'Pagamento atrasado', value: pastDue, color: 'bg-red-100 text-red-700' },
          { label: 'Ativos', value: active, color: 'bg-green-100 text-green-700' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${s.color}`}>{s.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Recent organizations */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Organizações recentes</h2>
        </div>
        <div className="divide-y">
          {recentOrgs.map((org: any) => {
            const plan = Array.isArray(org.plans) ? org.plans[0] : org.plans
            const statusColors: Record<string, string> = {
              active: 'bg-green-100 text-green-700',
              trialing: 'bg-amber-100 text-amber-700',
              past_due: 'bg-red-100 text-red-700',
              canceled: 'bg-gray-100 text-gray-600',
              free: 'bg-blue-100 text-blue-700',
            }
            const status = org.subscription_status ?? 'free'
            return (
              <div key={org.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium">{org.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(org.created_at).toLocaleDateString('pt-BR')}
                    {' · '}
                    {(org.credits_balance ?? 0).toLocaleString('pt-BR')} créditos
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{plan?.name ?? 'Free'}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[status] ?? statusColors.free}`}>
                    {status}
                  </span>
                </div>
              </div>
            )
          })}
          {recentOrgs.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhuma organização ainda.</p>
          )}
        </div>
      </div>
    </div>
  )
}
