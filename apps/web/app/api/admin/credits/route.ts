import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/admin'

export async function POST(req: NextRequest) {
  const supabaseAuth = createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = await isPlatformAdmin(user.id)
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { orgId, amount } = await req.json()
  if (!orgId || !amount) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: org } = await supabase
    .from('organizations')
    .select('credits_balance')
    .eq('id', orgId)
    .single()

  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 })

  const { error } = await supabase
    .from('organizations')
    .update({ credits_balance: (org.credits_balance ?? 0) + amount })
    .eq('id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
