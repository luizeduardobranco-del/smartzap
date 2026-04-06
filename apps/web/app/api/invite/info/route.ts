import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Token obrigatório' }, { status: 400 })

  const supabase = getServiceClient()

  const { data: invite } = await supabase
    .from('organization_invites')
    .select('email, role, expires_at, accepted_at, organization_id, organizations(name)')
    .eq('token', token)
    .single()

  if (!invite) return NextResponse.json({ error: 'Convite não encontrado' }, { status: 404 })
  if (invite.accepted_at) return NextResponse.json({ error: 'Convite já utilizado' }, { status: 410 })
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Convite expirado' }, { status: 410 })

  return NextResponse.json({
    email: invite.email,
    role: invite.role,
    orgName: (invite.organizations as any)?.name ?? 'sua organização',
  })
}
