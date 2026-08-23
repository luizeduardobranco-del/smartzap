import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { MetaInstagramAdapter } from '@zapagent/channel-adapters'

export async function POST(
  _req: NextRequest,
  { params }: { params: { channelId: string } }
) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: channel } = await supabase
    .from('channels')
    .select('credentials')
    .eq('id', params.channelId)
    .single()

  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

  const creds = channel.credentials as {
    igUserId?: string
    accessToken?: string      // Instagram Business Login (novo)
    pageId?: string
    pageAccessToken?: string  // Facebook Pages (legado)
  }

  // Unsubscribe webhooks (best-effort)
  if (creds.igUserId && creds.accessToken) {
    await MetaInstagramAdapter.unsubscribeInstagramUser(creds.igUserId, creds.accessToken)
  } else if (creds.pageId && creds.pageAccessToken) {
    await MetaInstagramAdapter.unsubscribeFromWebhooks(creds.pageId, creds.pageAccessToken)
  }

  await supabase
    .from('channels')
    .update({ status: 'disconnected', config: {} })
    .eq('id', params.channelId)

  return NextResponse.json({ success: true })
}
