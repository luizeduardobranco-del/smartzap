import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const { token, userId } = await req.json()
  if (!token || !userId) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

  const supabase = getServiceClient()

  const { data: invite } = await supabase
    .from('organization_invites')
    .select('id, organization_id, role, email, expires_at, accepted_at')
    .eq('token', token)
    .single()

  if (!invite) return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
  if (invite.accepted_at) return NextResponse.json({ error: 'Convite já utilizado' }, { status: 410 })
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Convite expirado' }, { status: 410 })

  // Check if already a member
  const { data: existing } = await supabase
    .from('organization_members')
    .select('id')
    .eq('organization_id', invite.organization_id)
    .eq('user_id', userId)
    .single()

  if (!existing) {
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: invite.organization_id,
        user_id: userId,
        role: invite.role,
      })
    if (memberError) return NextResponse.json({ error: 'Erro ao entrar na organização' }, { status: 500 })
  }

  // Mark as accepted
  await supabase
    .from('organization_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  return NextResponse.json({ success: true })
}
