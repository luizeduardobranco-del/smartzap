import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Instagram Business Login — no Facebook Page required
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
const SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
].join(',')

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agentId')
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  const appId = process.env.META_APP_ID
  if (!appId) {
    return NextResponse.json({ error: 'META_APP_ID não configurado' }, { status: 500 })
  }

  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/auth/instagram/callback`

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    response_type: 'code',
    state: agentId,
  })

  // New Instagram Business Login — logs in with Instagram directly, no Facebook Page needed
  return NextResponse.redirect(`https://www.instagram.com/oauth/authorize?${params}`)
}
