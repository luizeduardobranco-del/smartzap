/**
 * Cron endpoint — called by Vercel Cron every 5 minutes
 * Finds all story_posts with scheduled_at <= now() and sends them.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabase()
  const now = new Date().toISOString()

  // Find all pending scheduled posts
  const { data: posts } = await supabase
    .from('story_posts')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)

  if (!posts?.length) {
    return NextResponse.json({ processed: 0 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${req.headers.get('host')}`
  const results: { id: string; success: boolean; error?: string }[] = []

  for (const post of posts) {
    try {
      const res = await fetch(`${baseUrl}/api/stories/${post.id}/send`, {
        method: 'POST',
        headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
      })
      const body = await res.json().catch(() => ({}))
      results.push({ id: post.id, success: res.ok, error: body.error })
    } catch (err) {
      results.push({ id: post.id, success: false, error: err instanceof Error ? err.message : 'Error' })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
