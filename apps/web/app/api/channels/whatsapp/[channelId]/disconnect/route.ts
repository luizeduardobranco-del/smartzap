import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'

export async function POST(
  _req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: channel } = await supabase
    .from('channels')
    .select('credentials')
    .eq('id', params.channelId)
    .single()

  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

  const { instanceName } = channel.credentials as { instanceName: string }

  const adapter = new EvolutionWhatsAppAdapter(
    process.env.EVOLUTION_API_URL!,
    process.env.EVOLUTION_API_KEY!,
    instanceName
  )

  await adapter.logout()
  await adapter.deleteInstance()

  // Mark as disconnected instead of deleting — avoids FK constraint with conversations
  await supabase
    .from('channels')
    .update({ status: 'disconnected', config: {} })
    .eq('id', params.channelId)

  return NextResponse.json({ success: true })
}
