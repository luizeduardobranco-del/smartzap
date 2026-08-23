import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { MetaCloudWhatsAppAdapter } from '@zapagent/channel-adapters'

/**
 * POST /api/channels/whatsapp/connect-official
 * Connects a WhatsApp number via the Meta Cloud API (official).
 * No QR code needed — just Phone Number ID + Access Token.
 */
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentId, phoneNumberId, accessToken } = await req.json()
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })
  if (!phoneNumberId) return NextResponse.json({ error: 'phoneNumberId required' }, { status: 400 })
  if (!accessToken) return NextResponse.json({ error: 'accessToken required' }, { status: 400 })

  // Get org
  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  // Verify credentials with Meta before saving
  const adapter = new MetaCloudWhatsAppAdapter(phoneNumberId.trim(), accessToken.trim())
  const { valid, displayNumber, name } = await adapter.verifyCredentials()
  if (!valid) {
    return NextResponse.json(
      { error: 'Credenciais inválidas. Verifique o Phone Number ID e o Access Token.' },
      { status: 422 }
    )
  }

  // Check if there's already an active channel
  const { data: existing } = await supabase
    .from('channels')
    .select('id, status')
    .eq('agent_id', agentId)
    .eq('type', 'whatsapp')
    .not('status', 'eq', 'disconnected')
    .maybeSingle()

  if (existing?.status === 'connected' || existing?.status === 'connecting') {
    return NextResponse.json({ channelId: existing.id, alreadyExists: true })
  }

  const credentials = {
    provider: 'meta',
    phoneNumberId: phoneNumberId.trim(),
    accessToken: accessToken.trim(),
  }
  const config = {
    phone: displayNumber ?? phoneNumberId,
    name: name ?? undefined,
  }

  // Reuse disconnected record or create new
  const { data: disconnected } = await supabase
    .from('channels')
    .select('id')
    .eq('agent_id', agentId)
    .eq('type', 'whatsapp')
    .eq('status', 'disconnected')
    .maybeSingle()

  let channelId: string
  if (disconnected) {
    await supabase
      .from('channels')
      .update({ status: 'connected', credentials, config, connected_at: new Date().toISOString() })
      .eq('id', disconnected.id)
    channelId = disconnected.id
  } else {
    const { data: channel, error } = await supabase
      .from('channels')
      .insert({
        organization_id: member.organization_id,
        agent_id: agentId,
        type: 'whatsapp',
        status: 'connected',
        credentials,
        config,
        connected_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    channelId = channel.id
  }

  return NextResponse.json({ channelId, displayNumber, name })
}
