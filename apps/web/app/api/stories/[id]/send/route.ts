import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Deletes a file from Supabase Storage if the URL belongs to this project's storage. */
async function deleteStorageFile(supabase: ReturnType<typeof getSupabase>, mediaUrl: string | null) {
  if (!mediaUrl) return
  const storageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/story-media/`
  if (!mediaUrl.startsWith(storageBase)) return
  const filePath = mediaUrl.slice(storageBase.length)
  const { error } = await supabase.storage.from('story-media').remove([filePath])
  if (error) console.warn('[sendStory] storage cleanup failed:', error.message)
  else console.log('[sendStory] storage file deleted:', filePath)
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

      // Suporta múltiplos arquivos armazenados como JSON array em media_url
      let mediaUrls: string[] = []
      if (post.media_url) {
        try {
          const parsed = JSON.parse(post.media_url)
          mediaUrls = Array.isArray(parsed) ? parsed : [post.media_url]
        } catch {
          mediaUrls = [post.media_url]
        }
      }

      // Envia um story para cada mídia
      if (mediaUrls.length > 0) {
        for (const url of mediaUrls) {
          await adapter.sendStatus({
            type: post.media_type as 'image' | 'video' | 'text',
            content: url,
            caption: post.caption ?? undefined,
            backgroundColor: post.background_color ?? '#000000',
          })
        }
      } else {
        // Story de texto
        await adapter.sendStatus({
          type: 'text',
          content: post.caption ?? '',
          backgroundColor: post.background_color ?? '#000000',
        })
      }

      // Mark sent
      const isRepeating = !!post.repeat_days?.length
      await supabase
        .from('story_posts')
        .update({
          status: isRepeating ? 'scheduled' : 'sent',
          sent_at: new Date().toISOString(),
          error_message: null,
          scheduled_at: isRepeating && post.repeat_time
            ? nextRepeatDate(post.repeat_days, post.repeat_time)
            : null,
          media_url: isRepeating ? post.media_url : null,
        })
        .eq('id', postId)

      // Limpa arquivos do Storage após envio (apenas posts não-repetitivos)
      if (!isRepeating) {
        for (const url of mediaUrls) {
          await deleteStorageFile(supabase, url)
        }
      }

      return NextResponse.json({ success: true, postId, sent: mediaUrls.length || 1 })
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
  // Use a lookahead window: consider "now" as 5 minutes ago so a story sent
  // slightly after its scheduled time still picks the same day as next if applicable
  const now = new Date()
  const todayDay = now.getDay() // 0=Sun..6=Sat

  // Find the next day in the repeat schedule
  const sorted = [...repeatDays].sort((a, b) => a - b)
  let daysAhead = 7 // default: find within next 7 days

  for (const day of sorted) {
    const diff = (day - todayDay + 7) % 7
    if (diff === 0) {
      // Same day: check if the time is still in the future (with 1-min buffer)
      const candidate = new Date()
      candidate.setHours(hh, mm, 0, 0)
      candidate.setMinutes(candidate.getMinutes() + 1)
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
