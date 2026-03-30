import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'

function makeInstanceName(orgId: string, agentId: string) {
  // Compact slug: first 8 chars of each UUID
  return `zap-${orgId.slice(0, 8)}-${agentId.slice(0, 8)}`
}

/**
 * POST /api/channels/whatsapp/connect
 * Creates an Evolution instance + channel record, returns channelId.
 */
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { agentId } = await req.json()
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  // Get org
  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const orgId = member.organization_id

  // Check if active channel already exists
  const { data: existing } = await supabase
    .from('channels')
    .select('id, status')
    .eq('agent_id', agentId)
    .eq('type', 'whatsapp')
    .not('status', 'eq', 'disconnected')
    .maybeSingle()

  if (existing?.status === 'connecting' || existing?.status === 'connected') {
    return NextResponse.json({ channelId: existing.id, alreadyExists: true })
  }

  const instanceName = makeInstanceName(orgId, agentId)
  const evolutionUrl = process.env.EVOLUTION_API_URL!
  const evolutionKey = process.env.EVOLUTION_API_KEY!
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Create Evolution instance
  const adapter = new EvolutionWhatsAppAdapter(evolutionUrl, evolutionKey, instanceName)
  try {
    await adapter.createInstance(`${appUrl}/api/webhooks/whatsapp`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Evolution API error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // Reuse disconnected record or create new one
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
      .update({ status: 'connecting', credentials: { instanceName }, config: {} })
      .eq('id', disconnected.id)
    channelId = disconnected.id
  } else {
    const { data: channel, error } = await supabase
      .from('channels')
      .insert({
        organization_id: orgId,
        agent_id: agentId,
        type: 'whatsapp',
        status: 'connecting',
        credentials: { instanceName },
        config: {},
      })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    channelId = channel.id
  }

  return NextResponse.json({ channelId })
}
