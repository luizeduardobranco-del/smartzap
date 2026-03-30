import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'

export async function GET(
  _req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: channel } = await supabase
    .from('channels')
    .select('credentials, status')
    .eq('id', params.channelId)
    .single()

  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

  const { instanceName } = channel.credentials as { instanceName: string }
  const adapter = new EvolutionWhatsAppAdapter(
    process.env.EVOLUTION_API_URL!,
    process.env.EVOLUTION_API_KEY!,
    instanceName
  )

  const qr = await adapter.getQRCode()
  const state = await adapter.getConnectionState()

  // If connected, update channel status + get phone
  if (state === 'open' && channel.status !== 'connected') {
    const phone = await adapter.getConnectedPhone()
    await supabase
      .from('channels')
      .update({
        status: 'connected',
        connected_at: new Date().toISOString(),
        config: { phone },
      })
      .eq('id', params.channelId)
  }

  return NextResponse.json({
    state,
    qrBase64: qr?.base64 ?? null,
  })
}
