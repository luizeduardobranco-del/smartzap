import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/admin'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function getAuthenticatedAdmin() {
  const supabaseAuth = createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return null
  const isAdmin = await isPlatformAdmin(user.id)
  if (!isAdmin) return null
  return user
}

export async function POST(req: NextRequest) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 })

  const body = await req.json()
  const { name, slug, plan_id } = body

  if (!name || !slug) {
    return NextResponse.json({ error: 'name e slug são obrigatórios.' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name,
      slug,
      plan_id: plan_id ?? null,
      subscription_status: 'free',
      credits_balance: 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, organization: data })
}

export async function PATCH(req: NextRequest) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 })

  const body = await req.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'id é obrigatório.' }, { status: 400 })

  const allowedFields = ['plan_id', 'credits_balance', 'subscription_status', 'name', 'slug']
  const filteredUpdates: Record<string, any> = {}
  for (const key of allowedFields) {
    if (key in updates) {
      filteredUpdates[key] = updates[key]
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo válido para atualizar.' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { error } = await supabase
    .from('organizations')
    .update(filteredUpdates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
