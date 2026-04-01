import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isBusinessHours() {
  const hour = parseInt(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
    10
  )
  return hour >= 8 && hour < 20
}

function personalizeMessage(template: string, name: string) {
  const firstName = name?.split(' ')[0] ?? 'cliente'
  return template
    .replace(/\{\{nome\}\}/gi, firstName)
    .replace(/\{\{name\}\}/gi, firstName)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabase()
    const campaignId = params.id

    // Get campaign
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*, channels(credentials)')
      .eq('id', campaignId)
      .single()

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    console.log(`[campaign/process] campaign ${campaignId} status=${campaign.status}`)
    if (campaign.status !== 'running') return NextResponse.json({ status: campaign.status, done: true })

    // Daily limit check
    if (campaign.daily_limit) {
      const todayStart = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date()) + 'T00:00:00-03:00'

      const { count: sentToday } = await supabase
        .from('campaign_messages')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'sent')
        .gte('sent_at', todayStart)

      if ((sentToday ?? 0) >= campaign.daily_limit) {
        return NextResponse.json({
          status: 'daily_limit_reached',
          message: `Limite diário de ${campaign.daily_limit} disparos atingido. Retomará amanhã.`,
          sentToday,
          done: false,
        })
      }
    }

    // Business hours check
    if (campaign.business_hours_only && !isBusinessHours()) {
      return NextResponse.json({
        status: 'waiting',
        message: 'Aguardando horário comercial (8h–20h)',
        done: false,
      })
    }

    // Get next pending message
    const { data: nextMsg } = await supabase
      .from('campaign_messages')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    console.log(`[campaign/process] nextMsg=${nextMsg?.id ?? 'null'}`)
    if (!nextMsg) {
      console.log(`[campaign/process] no pending messages for campaign ${campaignId}`)
      // No more pending — campaign complete
      const { data: counts } = await supabase
        .from('campaign_messages')
        .select('status')
        .eq('campaign_id', campaignId)
      const sent = counts?.filter((m: any) => m.status === 'sent').length ?? 0
      const failed = counts?.filter((m: any) => m.status === 'failed').length ?? 0
      await supabase
        .from('campaigns')
        .update({ status: 'completed', completed_at: new Date().toISOString(), sent_count: sent, failed_count: failed })
        .eq('id', campaignId)
      return NextResponse.json({ status: 'completed', sent, failed, done: true })
    }

    // Get channel credentials
    const credentials = campaign.channels?.credentials as Record<string, string>
    const instanceName = credentials?.instanceName
    if (!instanceName) {
      return NextResponse.json({ error: 'Canal sem instanceName configurado' }, { status: 400 })
    }

    // Apply random jitter (±2s)
    const jitter = Math.floor(Math.random() * 4000) - 2000 // -2000 to +2000 ms
    const delay = (campaign.delay_seconds * 1000) + jitter
    await sleep(Math.max(delay, 3000)) // minimum 3s

    // Send message
    const text = personalizeMessage(campaign.message, nextMsg.contact_name ?? '')
    let sendError: string | null = null

    try {
      const adapter = new EvolutionWhatsAppAdapter(
        process.env.EVOLUTION_API_URL!,
        process.env.EVOLUTION_API_KEY!,
        instanceName
      )
      await adapter.sendMessage({
        channelType: 'whatsapp',
        channelIdentifier: instanceName,
        recipientExternalId: nextMsg.contact_phone,
        contentType: 'text',
        text,
      })
    } catch (err) {
      sendError = err instanceof Error ? err.message : 'Send failed'
      console.error('[campaign/process] send error:', sendError)
    }

    // Update message status
    await supabase
      .from('campaign_messages')
      .update({
        status: sendError ? 'failed' : 'sent',
        sent_at: sendError ? null : new Date().toISOString(),
        error_message: sendError,
      })
      .eq('id', nextMsg.id)

    // Auto-tag contact with campaign name + ensure CRM entry
    if (!sendError && nextMsg.contact_id) {
      const campaignTag = campaign.name
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      const { data: contact } = await supabase
        .from('contacts')
        .select('tags, kanban_stage')
        .eq('id', nextMsg.contact_id)
        .single()

      const existing: string[] = contact?.tags ?? []
      const updatedTags = existing.includes(campaignTag) ? existing : [...existing, campaignTag]

      await supabase
        .from('contacts')
        .update({
          tags: updatedTags,
          kanban_stage: contact?.kanban_stage ?? 'new', // ensure CRM entry
        })
        .eq('id', nextMsg.contact_id)
    }

    // Update campaign counters
    const { data: counts } = await supabase
      .from('campaign_messages')
      .select('status')
      .eq('campaign_id', campaignId)
    const sent = counts?.filter((m: any) => m.status === 'sent').length ?? 0
    const failed = counts?.filter((m: any) => m.status === 'failed').length ?? 0
    const pending = counts?.filter((m: any) => m.status === 'pending').length ?? 0

    await supabase
      .from('campaigns')
      .update({ sent_count: sent, failed_count: failed })
      .eq('id', campaignId)

    return NextResponse.json({
      status: 'running',
      sent,
      failed,
      pending,
      done: false,
      lastContact: nextMsg.contact_name,
      success: !sendError,
    })
  } catch (err) {
    console.error('[campaign/process]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
