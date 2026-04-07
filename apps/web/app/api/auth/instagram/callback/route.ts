import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MetaInstagramAdapter } from '@zapagent/channel-adapters'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const agentId = searchParams.get('state')
  const error = searchParams.get('error')
  const origin = new URL(req.url).origin

  const redirectBase = agentId ? `${origin}/agents/${agentId}` : `${origin}/agents`

  if (error || !code || !agentId) {
    console.warn('[instagram/callback] OAuth error or missing params:', { error, code: !!code, agentId })
    return NextResponse.redirect(`${redirectBase}?instagram_error=1`)
  }

  const appId = process.env.META_APP_ID!
  const appSecret = process.env.META_APP_SECRET!
  const redirectUri = `${origin}/api/auth/instagram/callback`

  // Step 1: Exchange code for short-lived Instagram user token
  const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  })

  if (!tokenRes.ok) {
    console.error('[instagram/callback] token exchange failed:', await tokenRes.text())
    return NextResponse.redirect(`${redirectBase}?instagram_error=1`)
  }

  const tokenData = await tokenRes.json()
  const shortToken: string = tokenData.access_token

  if (!shortToken) {
    console.error('[instagram/callback] no access_token in response:', tokenData)
    return NextResponse.redirect(`${redirectBase}?instagram_error=1`)
  }

  // Step 2: Exchange for long-lived token (60 days)
  let longToken: string
  try {
    longToken = await MetaInstagramAdapter.exchangeInstagramLongLivedToken(shortToken, appId, appSecret)
  } catch (err) {
    console.error('[instagram/callback] long-lived token exchange failed:', err)
    return NextResponse.redirect(`${redirectBase}?instagram_error=1`)
  }

  // Step 3: Get Instagram user info directly (no Facebook Page needed)
  let igUser: { id: string; username: string }
  try {
    igUser = await MetaInstagramAdapter.getInstagramUser(longToken)
  } catch (err) {
    console.error('[instagram/callback] failed to get Instagram user:', err)
    return NextResponse.redirect(`${redirectBase}?instagram_error=1`)
  }

  // Step 4: Subscribe to webhook messages
  try {
    await MetaInstagramAdapter.subscribeInstagramUser(igUser.id, longToken)
    console.log('[instagram/callback] webhook subscription done for ig user:', igUser.id)
  } catch (err) {
    console.warn('[instagram/callback] webhook subscription failed (non-fatal):', err)
  }

  // Step 5: Persist channel
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('organization_id')
    .eq('id', agentId)
    .single()

  if (!agent) {
    console.error('[instagram/callback] agent not found:', agentId)
    return NextResponse.redirect(`${redirectBase}?instagram_error=1`)
  }

  // Deactivate any previous Instagram channel for this agent
  await supabaseAdmin
    .from('channels')
    .update({ status: 'disconnected' })
    .eq('agent_id', agentId)
    .eq('type', 'instagram')
    .neq('status', 'disconnected')

  const { error: insertError } = await supabaseAdmin.from('channels').insert({
    organization_id: agent.organization_id,
    agent_id: agentId,
    type: 'instagram',
    status: 'connected',
    connected_at: new Date().toISOString(),
    credentials: {
      igUserId: igUser.id,
      igUsername: igUser.username,
      // pageAccessToken reused as field name — stores the Instagram user access token
      pageAccessToken: longToken,
    },
    config: {
      igUsername: igUser.username,
    },
  })

  if (insertError) {
    console.error('[instagram/callback] channel insert failed:', insertError.message)
    return NextResponse.redirect(`${redirectBase}?instagram_error=1`)
  }

  console.log('[instagram/callback] connected ig user:', igUser.username, 'for agent:', agentId)
  return NextResponse.redirect(`${redirectBase}?instagram_success=1`)
}
