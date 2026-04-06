import { createClient } from '@supabase/supabase-js'
import { AffiliatesAccessClient } from './AffiliatesAccessClient'

export const metadata = { title: 'Acesso — Afiliados' }

async function getOrgsWithAffiliateStatus() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const { data } = await supabase
    .from('organizations')
    .select('id, name, slug, subscription_status, settings')
    .order('name', { ascending: true })
  return (data ?? []).map((org: any) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.subscription_status ?? 'free',
    hasAffiliates: !!(org.settings?.enabled_modules?.includes('affiliates')),
  }))
}

export default async function AffiliatesPage() {
  const orgs = await getOrgsWithAffiliateStatus()
  return <AffiliatesAccessClient orgs={orgs} />
}
