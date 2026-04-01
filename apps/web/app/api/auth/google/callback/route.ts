import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const userId = searchParams.get('state')
  const error = searchParams.get('error')

  const origin = new URL(req.url).origin

  if (error || !code || !userId) {
    return NextResponse.redirect(`${origin}/settings?integration_error=1`)
  }

  // Exchange code for tokens
  const clientId = process.env.GOOGLE_CLIENT_ID!
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
  const redirectUri = `${origin}/api/auth/google/callback`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${origin}/settings?integration_error=1`)
  }

  const tokens = await tokenRes.json()

  // Get user email
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const userInfo = await userInfoRes.json()

  // Get org ID for this user using service role (bypass RLS)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: member } = await supabaseAdmin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .single()

  if (!member) {
    return NextResponse.redirect(`${origin}/settings?integration_error=1`)
  }

  const tokenExpiry = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null

  // Upsert both google_calendar and gmail integrations
  for (const provider of ['google_calendar', 'gmail']) {
    await supabaseAdmin.from('integrations').upsert({
      organization_id: member.organization_id,
      provider,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      token_expiry: tokenExpiry,
      scope: tokens.scope ?? null,
      email: userInfo.email ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,provider' })
  }

  return NextResponse.redirect(`${origin}/settings?integration_success=1`)
}
