import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function isBusinessHours(startHour = 8, endHour = 20) {
  const hour = parseInt(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
    10
  )
  return hour >= startHour && hour < endHour
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
      .select('*, channels(id, credentials, agent_id)')
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
    const startHour = campaign.start_hour ?? 8
    const endHour = campaign.end_hour ?? 20
    if (campaign.business_hours_only && !isBusinessHours(startHour, endHour)) {
      return NextResponse.json({
        status: 'waiting',
        message: `Aguardando horário configurado (${String(startHour).padStart(2,'0')}h–${String(endHour).padStart(2,'0')}h)`,
        done: false,
      })
    }

    // Recover stale 'processing' messages (stuck > 2 min — e.g. server crashed mid-send)
    const staleThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString()
    await supabase
      .from('campaign_messages')
      .update({ status: 'pending' })
      .eq('campaign_id', campaignId)
      .eq('status', 'processing')
      .lt('updated_at', staleThreshold)

    // Get channel credentials early (needed before claiming)
    const credentials = campaign.channels?.credentials as Record<string, string>
    const instanceName = credentials?.instanceName
    if (!instanceName) {
      return NextResponse.json({ error: 'Canal sem instanceName configurado' }, { status: 400 })
    }

    // Find the next pending message (skip any already being processed)
    const { data: candidate } = await supabase
      .from('campaign_messages')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!candidate) {
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

    // Atomically claim the message — only succeeds if status is still 'pending'.
    // If two concurrent requests race, only one will get a row back; the other gets null and exits.
    const { data: nextMsg } = await supabase
      .from('campaign_messages')
      .update({ status: 'processing' })
      .eq('id', candidate.id)
      .eq('status', 'pending') // compare-and-swap guard
      .select('*')
      .single()

    console.log(`[campaign/process] claimed=${nextMsg?.id ?? 'none (race lost)'}`)
    if (!nextMsg) {
      // Another concurrent request already claimed this message — skip safely
      return NextResponse.json({ status: 'running', done: false, delay_ms: 500 })
    }

    // Compute delay for the client to wait (server no longer sleeps — avoids Vercel timeout)
    const jitter = Math.floor(Math.random() * 4000) - 2000 // -2000 to +2000 ms
    const delayMs = Math.max((campaign.delay_seconds * 1000) + jitter, 3000)

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
    } catch (err: any) {
      // Extract the actual Evolution API error body when available
      const responseData = err?.response?.data
      const evolutionReason =
        responseData?.message ??
        responseData?.error ??
        responseData?.response?.message ??
        (typeof responseData === 'string' ? responseData : null)
      sendError = evolutionReason
        ? `${err.message} — Evolution: ${JSON.stringify(evolutionReason)}`
        : (err instanceof Error ? err.message : 'Send failed')
      console.error('[campaign/process] send error:', sendError, '| phone:', nextMsg.contact_phone, '| instance:', instanceName)
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

    // Save campaign message to conversation history so the AI agent has context
    if (!sendError && nextMsg.contact_id) {
      const channelId = campaign.channels?.id ?? campaign.channel_id
      const agentId = campaign.channels?.agent_id ?? null

      // Find open conversation for this contact+channel or create one
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', nextMsg.contact_id)
        .eq('channel_id', channelId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let conversationId: string | null = existingConv?.id ?? null

      if (!conversationId) {
        const { data: newConv, error: convErr } = await supabase
          .from('conversations')
          .insert({
            organization_id: campaign.organization_id,
            contact_id: nextMsg.contact_id,
            channel_id: channelId,
            agent_id: agentId,
            status: 'open',
            mode: 'ai',
            last_message_at: new Date().toISOString(),
          })
          .select('id')
          .single()
        if (convErr) console.error('[campaign/process] conversation insert error:', convErr.message, convErr.details)
        conversationId = newConv?.id ?? null
      }

      if (conversationId) {
        const { error: msgErr } = await supabase.from('messages').insert({
          conversation_id: conversationId,
          organization_id: campaign.organization_id,
          role: 'assistant',
          content: text,
          content_type: 'text',
          sender_type: 'campaign',
          delivery_status: 'sent',
          metadata: { campaign_id: campaignId, campaign_name: campaign.name },
        })
        if (msgErr) console.error('[campaign/process] message insert error:', msgErr.message, msgErr.details)

        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId)
      } else {
        console.error('[campaign/process] could not get conversationId for contact', nextMsg.contact_id)
      }
    }

    // Enroll contact into funnel stage after successful send
    if (!sendError && nextMsg.contact_id && campaign.funnel_id && campaign.funnel_stage_id) {
      await supabase
        .from('funnel_contacts')
        .upsert(
          [{
            funnel_id: campaign.funnel_id,
            stage_id: campaign.funnel_stage_id,
            contact_id: nextMsg.contact_id,
            organization_id: campaign.organization_id,
            channel_id: campaign.channels?.id ?? campaign.channel_id ?? null,
            status: 'active',
            entered_stage_at: new Date().toISOString(),
            next_message_index: 0,
            next_message_at: null,
          }],
          { onConflict: 'funnel_id,contact_id', ignoreDuplicates: true }
        )
    }

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
    const pending = counts?.filter((m: any) => m.status === 'pending' || m.status === 'processing').length ?? 0

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
      delay_ms: delayMs,
    })
  } catch (err) {
    console.error('[campaign/process]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
