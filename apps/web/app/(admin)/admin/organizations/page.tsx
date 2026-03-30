import { getAllOrgs, getAllPlans } from '@/lib/admin'
import { createClient } from '@supabase/supabase-js'
import { OrgActionsClient } from './OrgActionsClient'
import { OrgDetailDrawerButton } from './OrgDetailClient'

export const metadata = { title: 'Organizações — Admin' }

async function getMemberCounts(): Promise<Record<string, number>> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id')
  if (!data) return {}
  const counts: Record<string, number> = {}
  for (const m of data) {
    counts[m.organization_id] = (counts[m.organization_id] ?? 0) + 1
  }
  return counts
}

export default async function OrganizationsPage() {
  const [orgs, plans, memberCounts] = await Promise.all([
    getAllOrgs(),
    getAllPlans(),
    getMemberCounts(),
  ])

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    trialing: 'bg-amber-100 text-amber-700',
    past_due: 'bg-red-100 text-red-700',
    canceled: 'bg-gray-100 text-gray-600',
    free: 'bg-blue-100 text-blue-700',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organizações</h1>
        <p className="text-sm text-muted-foreground">{orgs.length} organizações cadastradas</p>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/30">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Organização</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Plano</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Créditos</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Membros</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cadastro</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orgs.map((org: any) => {
              const plan = Array.isArray(org.plans) ? org.plans[0] : org.plans
              const status = org.subscription_status ?? 'free'
              const memberCount = memberCounts[org.id] ?? 0
              return (
                <tr key={org.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{org.name}</p>
                    <p className="text-xs text-muted-foreground">{org.slug}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{plan?.name ?? 'Free'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[status] ?? statusColors.free}`}>
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{(org.credits_balance ?? 0).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-muted-foreground">{memberCount}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(org.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <OrgActionsClient orgId={org.id} orgName={org.name} />
                      <OrgDetailDrawerButton
                        org={org}
                        allPlans={plans}
                        memberCount={memberCount}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {orgs.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma organização.</p>
        )}
      </div>
    </div>
  )
}
