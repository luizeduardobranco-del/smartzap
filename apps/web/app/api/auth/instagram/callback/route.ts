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
    return NextResponse.redirect(`${redirectBase}?instagram_error=1`)
  }

  const appId = process.env.META_APP_ID!
  const appSecret = process.env.META_APP_SECRET!
  const redirectUri = `${origin}/api/auth/instagram/callback`

  // Exchange code for short-lived user access token
  const tokenRes = await fetch('https://graph.facebook.com/v21.0/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    }),
  })

  if (!tokenRes.ok) {
    console.error('[instagram/callback] token exchange failed:', await tokenRes.text())
    return NextResponse.redirect(`${redirectBase}?instagram_error=1`)
  }

  const { access_token: shortToken } = await tokenRes.json()

  // Exchange for long-lived token
  let longToken: string
  try {
    longToken = await MetaInstagramAdapter.exchangeForLongLivedToken(shortToken, appId, appSecret)
  } catch (err) {
    console.error('[instagram/callback] long-lived token exchange failed:', err)
    return NextResponse.redirect(`${redirectBase}?instagram_error=1`)
  }

  // Get Facebook Pages
  const pages = await MetaInstagramAdapter.getPages(longToken)
  if (!pages.length) {
    console.warn('[instagram/callback] no pages found for user')
    return NextResponse.redirect(`${redirectBase}?instagram_error=no_page`)
  }

  // Use the first page with a linked Instagram Business Account
  let igAccount: { id: string; username: string } | null = null
  let selectedPage: { id: string; name: string; access_token: string } | null = null

  for (const page of pages) {
    igAccount = await MetaInstagramAdapter.getInstagramAccount(page.id, page.access_token)
    if (igAccount) {
      selectedPage = page
      break
    }
  }

  if (!igAccount || !selectedPage) {
    console.warn('[instagram/callback] no Instagram business account found')
    return NextResponse.redirect(`${redirectBase}?instagram_error=no_ig_account`)
  }

  // Subscribe page to webhooks
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin
  try {
    await MetaInstagramAdapter.subscribeToWebhooks(selectedPage.id, selectedPage.access_token)
    console.log('[instagram/callback] webhook subscription done for page:', selectedPage.id)
  } catch (err) {
    console.warn('[instagram/callback] webhook subscription failed (non-fatal):', err)
  }

  // Persist channel using service role (no RLS)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // Get orgId from agentId
  const { data: agent } = await supabaseAdmin
    .from('agents')
    .select('organization_id')
    .eq('id', agentId)
    .single()

  if (!agent) {
    console.error('[instagram/callback] agent not found:', agentId)
    return NextResponse.redirect(`${redirectBase}?instagram_error=1`)
  }

  // Deactivate any previous instagram channel for this agent
  await supabaseAdmin
    .from('channels')
    .update({ status: 'disconnected' })
    .eq('agent_id', agentId)
    .eq('type', 'instagram')
    .neq('status', 'disconnected')

  // Create new channel
  const { error: insertError } = await supabaseAdmin.from('channels').insert({
    organization_id: agent.organization_id,
    agent_id: agentId,
    type: 'instagram',
    status: 'connected',
    connected_at: new Date().toISOString(),
    credentials: {
      igUserId: igAccount.id,
      igUsername: igAccount.username,
      pageId: selectedPage.id,
      pageName: selectedPage.name,
      pageAccessToken: selectedPage.access_token,
    },
    config: {
      igUsername: igAccount.username,
      pageName: selectedPage.name,
    },
  })

  if (insertError) {
    console.error('[instagram/callback] channel insert failed:', insertError.message)
    return NextResponse.redirect(`${redirectBase}?instagram_error=1`)
  }

  console.log('[instagram/callback] channel created for agent:', agentId, 'ig:', igAccount.username)
  return NextResponse.redirect(`${redirectBase}?instagram_success=1`)
}
