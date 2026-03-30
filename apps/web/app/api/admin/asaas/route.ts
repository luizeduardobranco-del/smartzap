import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/admin'
import { asaas } from '@/lib/asaas'

export async function DELETE(req: NextRequest) {
  const supabaseAuth = createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isAdmin = await isPlatformAdmin(user.id)
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { orgId, asaasSubscriptionId } = await req.json()
  if (!orgId || !asaasSubscriptionId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Cancel in Asaas
  try {
    await asaas('DELETE', `/subscriptions/${asaasSubscriptionId}`)
  } catch (err: any) {
    console.error('[admin/asaas] cancel error:', err?.message)
    return NextResponse.json({ error: err?.message ?? 'Erro ao cancelar no Asaas' }, { status: 500 })
  }

  // Update org in database
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { error } = await supabase
    .from('organizations')
    .update({
      subscription_status: 'canceled',
      asaas_subscription_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
