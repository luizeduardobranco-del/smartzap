import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Protect from external calls
  const secret = req.headers.get('x-internal-secret')
  if (secret !== (process.env.INTERNAL_SECRET ?? '') && !req.headers.get('x-cron-secret')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()
  const postId = params.id

  // Load story post with channel
  const { data: post } = await supabase
    .from('story_posts')
    .select('*, channels(id, credentials, type)')
    .eq('id', postId)
    .single()

  if (!post) return NextResponse.json({ error: 'Story post not found' }, { status: 404 })
  if (!['draft', 'scheduled'].includes(post.status)) {
    return NextResponse.json({ error: 'Post já enviado ou inválido' }, { status: 400 })
  }

  const credentials = post.channels?.credentials as Record<string, string> | null
  const instanceName = credentials?.instanceName

  if (!instanceName) {
    return NextResponse.json({ error: 'Canal sem instanceName configurado' }, { status: 400 })
  }

  // --- WhatsApp via Evolution API ---
  if (post.channel_type === 'whatsapp') {
    try {
      const adapter = new EvolutionWhatsAppAdapter(
        process.env.EVOLUTION_API_URL!,
        process.env.EVOLUTION_API_KEY!,
        instanceName
      )

      await adapter.sendStatus({
        type: post.media_type as 'image' | 'video' | 'text',
        content: post.media_url ?? post.caption ?? '',
        caption: post.caption ?? undefined,
        backgroundColor: post.background_color ?? '#000000',
      })

      // Mark sent
      await supabase
        .from('story_posts')
        .update({
          status: post.repeat_days?.length ? 'scheduled' : 'sent',
          sent_at: new Date().toISOString(),
          error_message: null,
          // Advance next scheduled_at if repeating
          scheduled_at: post.repeat_days?.length && post.repeat_time
            ? nextRepeatDate(post.repeat_days, post.repeat_time)
            : null,
        })
        .eq('id', postId)

      return NextResponse.json({ success: true, postId })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Send failed'
      await supabase
        .from('story_posts')
        .update({ status: 'failed', error_message: message })
        .eq('id', postId)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // --- Instagram (placeholder — integration pending approval) ---
  if (post.channel_type === 'instagram') {
    await supabase
      .from('story_posts')
      .update({ status: 'failed', error_message: 'Integração Instagram pendente de aprovação' })
      .eq('id', postId)
    return NextResponse.json({ error: 'Instagram integration not yet available' }, { status: 503 })
  }

  return NextResponse.json({ error: 'Canal não suportado' }, { status: 400 })
}

// Calculate next occurrence of a repeat schedule
function nextRepeatDate(repeatDays: number[], repeatTime: string): string {
  const [hh, mm] = repeatTime.split(':').map(Number)
  const now = new Date()
  const todayDay = now.getDay() // 0=Sun..6=Sat

  // Find the next day in the repeat schedule
  const sorted = [...repeatDays].sort((a, b) => a - b)
  let daysAhead = 7 // default: find within next 7 days

  for (const day of sorted) {
    const diff = (day - todayDay + 7) % 7
    if (diff === 0) {
      // Same day: check if the time is still in the future
      const candidate = new Date()
      candidate.setHours(hh, mm, 0, 0)
      if (candidate > now) { daysAhead = 0; break }
    } else if (diff < daysAhead) {
      daysAhead = diff
    }
  }

  const next = new Date()
  next.setDate(next.getDate() + daysAhead)
  next.setHours(hh, mm, 0, 0)
  return next.toISOString()
}
