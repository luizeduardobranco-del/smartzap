import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('platform_admins')
    .select('id')
    .eq('user_id', userId)
    .single()
  return !!data
}

export async function getAdminRole(userId: string): Promise<'super_admin' | 'admin' | 'operator' | null> {
  const isAdmin = await isPlatformAdmin(userId)
  if (!isAdmin) return null
  // All admins are super_admin for now (no role column in platform_admins yet)
  return 'super_admin'
}

export async function getAdminStats() {
  const supabase = getServiceClient()

  const [orgsRes, membersRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, slug, subscription_status, credits_balance, created_at, trial_ends_at, plan_id, plans(id, name, slug, price_monthly)', { count: 'exact' }),
    supabase
      .from('organization_members')
      .select('id', { count: 'exact' }),
  ])

  const organizations = orgsRes.data ?? []
  const totalOrgs = orgsRes.count ?? 0
  const totalUsers = membersRes.count ?? 0
  const totalCredits = organizations.reduce((sum: number, o: any) => sum + (o.credits_balance ?? 0), 0)
  const activeCount = organizations.filter((o: any) => o.subscription_status === 'active').length
  const trialCount = organizations.filter((o: any) => o.subscription_status === 'trialing').length
  const pastDueCount = organizations.filter((o: any) => o.subscription_status === 'past_due').length

  return {
    organizations,
    totalOrgs,
    totalUsers,
    totalCredits,
    activeCount,
    trialCount,
    pastDueCount,
  }
}

export async function getAllOrgs() {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('organizations')
    .select(`
      id, name, slug, subscription_status, credits_balance,
      created_at, trial_ends_at,
      stripe_subscription_id, stripe_customer_id,
      asaas_subscription_id, asaas_customer_id,
      plan_id,
      plans(id, name, slug, price_monthly, price_yearly, credits_monthly)
    `)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function getAllUsers() {
  const supabase = getServiceClient()

  // Get all auth users
  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const authUsers = authData?.users ?? []

  // Get all org members
  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id, role, organization_id, organizations(id, name, slug)')

  const memberMap: Record<string, any> = {}
  for (const m of members ?? []) {
    if (!memberMap[m.user_id]) {
      memberMap[m.user_id] = m
    }
  }

  return authUsers.map((u) => ({
    ...u,
    member: memberMap[u.id] ?? null,
  }))
}

export async function getAllPlans() {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('plans')
    .select('*')
    .order('price_monthly', { ascending: true })
  return data ?? []
}

export async function getAllAdmins() {
  const supabase = getServiceClient()
  const { data: admins } = await supabase
    .from('platform_admins')
    .select('id, user_id, created_at')
    .order('created_at', { ascending: true })

  if (!admins || admins.length === 0) return []

  const userIds = admins.map((a) => a.user_id)
  const userResults = await Promise.all(
    userIds.map((id) => supabase.auth.admin.getUserById(id))
  )

  return admins.map((admin, i) => ({
    ...admin,
    email: userResults[i].data.user?.email ?? 'unknown',
  }))
}
