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
  const { action, userId, email, password } = body
  const supabase = getServiceClient()

  // Block user
  if (action === 'block') {
    if (!userId) return NextResponse.json({ error: 'userId é obrigatório.' }, { status: 400 })
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: '876000h',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Unblock user
  if (action === 'unblock') {
    if (!userId) return NextResponse.json({ error: 'userId é obrigatório.' }, { status: 400 })
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Reset password (send reset email)
  if (action === 'reset_password') {
    if (!email) return NextResponse.json({ error: 'email é obrigatório.' }, { status: 400 })
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, link: data?.properties?.action_link })
  }

  // Create user
  if (action === 'create') {
    if (!email || !password) return NextResponse.json({ error: 'email e password são obrigatórios.' }, { status: 400 })
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, user: data.user })
  }

  // Add platform admin
  if (action === 'add_platform_admin') {
    if (!email) return NextResponse.json({ error: 'email é obrigatório.' }, { status: 400 })
    // Find user by email
    const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    const targetUser = users?.users?.find((u) => u.email === email)
    if (!targetUser) return NextResponse.json({ error: 'Usuário não encontrado. O usuário precisa ter uma conta ativa.' }, { status: 404 })

    // Check if already admin
    const { data: existing } = await supabase
      .from('platform_admins')
      .select('id')
      .eq('user_id', targetUser.id)
      .single()
    if (existing) return NextResponse.json({ error: 'Este usuário já é administrador.' }, { status: 400 })

    const { error } = await supabase
      .from('platform_admins')
      .insert({ user_id: targetUser.id })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const admin = await getAuthenticatedAdmin()
  if (!admin) return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 })

  const body = await req.json()
  const { userId } = body
  if (!userId) return NextResponse.json({ error: 'userId é obrigatório.' }, { status: 400 })

  // Prevent admin from deleting themselves
  if (userId === admin.id) {
    return NextResponse.json({ error: 'Você não pode excluir sua própria conta.' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
