import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'
import { runAgent } from '@zapagent/ai-engine'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const parseAdapter = new EvolutionWhatsAppAdapter('', '', '')

export async function POST(request: NextRequest) {
  const payload = await request.json()
  try {
    await handleWebhook(payload)
  } catch (err) {
    console.error('[webhook/whatsapp]', err instanceof Error ? err.message : err)
  }
  return NextResponse.json({ ok: true })
}

async function handleWebhook(payload: unknown) {
  const p = payload as Record<string, unknown>
  console.log('[webhook] event:', p?.event, 'instance:', p?.instance)

  // ── CONNECTION_UPDATE: track channel connectivity ──────────────────────────
  if (p?.event === 'connection.update' || p?.event === 'CONNECTION_UPDATE') {
    await handleConnectionUpdate(p)
    return
  }

  const msg = parseAdapter.parseWebhook(payload)
  if (!msg) {
    console.log('[webhook] parseWebhook returned null — skipping')
    return
  }

  console.log('[webhook] msg parsed:', { channelIdentifier: msg.channelIdentifier, senderExternalId: msg.senderExternalId, contentType: msg.contentType, text: msg.text?.slice(0, 50) })

  const supabase = getSupabase()

  // 1. Find channel by instanceName
  const { data: channelRows, error: channelErr } = await supabase
    .from('channels')
    .select('id, organization_id, agent_id, status')
    .eq('type', 'whatsapp')
    .filter('credentials->>instanceName', 'eq', msg.channelIdentifier)
    .limit(1)

  if (channelErr) console.error('[webhook] channel query error:', channelErr.message)
  console.log('[webhook] channel rows:', JSON.stringify(channelRows))

  const channel = channelRows?.[0]
  if (!channel) {
    console.warn(`[webhook] No channel found for instance: ${msg.channelIdentifier}`)
    return
  }
  if (!channel.agent_id) {
    console.warn(`[webhook] Channel found but no agent_id for instance: ${msg.channelIdentifier}`)
    return
  }

  console.log('[webhook] channel found:', channel.id, 'status:', channel.status, 'agent:', channel.agent_id)

  // Auto-promote connecting → connected when first message arrives
  if (channel.status === 'connecting') {
    await supabase
      .from('channels')
      .update({ status: 'connected', connected_at: new Date().toISOString() })
      .eq('id', channel.id)
    console.log('[webhook] channel promoted to connected')
  }

  // 2. Check credits
  const { data: org } = await supabase
    .from('organizations')
    .select('credits_balance, settings')
    .eq('id', channel.organization_id)
    .single()

  if (!org || org.credits_balance <= 0) {
    console.warn(`[webhook] No credits for org: ${channel.organization_id} balance: ${org?.credits_balance}`)
    return
  }

  console.log('[webhook] credits ok:', org.credits_balance)

  // 3. Upsert contact
  let contactId: string
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('organization_id', channel.organization_id)
    .eq('channel_type', 'whatsapp')
    .eq('external_id', msg.senderExternalId)
    .maybeSingle()

  if (existingContact) {
    contactId = existingContact.id
    if (msg.senderName && !existingContact.name) {
      await supabase.from('contacts').update({ name: msg.senderName }).eq('id', contactId)
    }
    console.log('[webhook] contact existing:', contactId)
  } else {
    const { data: newContact, error: contactErr } = await supabase
      .from('contacts')
      .insert({
        organization_id: channel.organization_id,
        external_id: msg.senderExternalId,
        channel_type: 'whatsapp',
        name: msg.senderName ?? msg.senderExternalId,
        phone: msg.senderExternalId,
      })
      .select('id')
      .single()
    if (!newContact) { console.error('[webhook] contact insert failed:', contactErr?.message); return }
    contactId = newContact.id
    console.log('[webhook] contact created:', contactId)
  }

  // 4. Find or create open conversation
  let conversationId: string
  let conversationMode: string
  const { data: existingConv } = await supabase
    .from('conversations')
    .select('id, mode')
    .eq('contact_id', contactId)
    .eq('channel_id', channel.id)
    .eq('status', 'open')
    .maybeSingle()

  if (existingConv) {
    conversationId = existingConv.id
    conversationMode = existingConv.mode
    console.log('[webhook] conversation existing:', conversationId, 'mode:', conversationMode)
  } else {
    const { data: newConv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        organization_id: channel.organization_id,
        contact_id: contactId,
        channel_id: channel.id,
        agent_id: channel.agent_id,
        status: 'open',
        mode: 'ai',
        last_message_at: new Date().toISOString(),
      })
      .select('id, mode')
      .single()
    if (!newConv) { console.error('[webhook] conversation insert failed:', convErr?.message); return }
    conversationId = newConv.id
    conversationMode = newConv.mode
    console.log('[webhook] conversation created:', conversationId)
  }

  // 5. Save incoming message
  const { data: savedMsg } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      organization_id: channel.organization_id,
      role: 'user',
      content: msg.text ?? '[mídia]',
      content_type: msg.contentType,
      media_url: msg.mediaUrl ?? null,
      sender_type: 'contact',
      external_id: msg.externalId,
    })
    .select('id')
    .single()

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  // 6. Skip AI if human mode or document
  if (conversationMode === 'human') { console.log('[webhook] mode=human, skipping AI'); return }
  if (!savedMsg) { console.log('[webhook] savedMsg null, skipping AI'); return }
  if (msg.contentType === 'document') { console.log('[webhook] document, skipping AI'); return }

  // Resolve AI keys early (needed for media processing)
  const orgSettings = org.settings as Record<string, Record<string, string>> | null
  const aiKeys = orgSettings?.aiKeys ?? {}
  const openaiKey = aiKeys.openaiApiKey || process.env.OPENAI_API_KEY

  // Credit cost: text=1, audio=3, image=10
  let creditCost = 1

  // 6b. Handle audio — transcribe with Whisper
  let effectiveText = msg.text
  if (msg.contentType === 'audio') {
    creditCost = 3
    if (!openaiKey) {
      console.warn('[webhook] audio: no OpenAI key for transcription, skipping AI')
      return
    }
    try {
      const media = await fetchEvolutionMedia(msg.externalId, msg.senderExternalId, msg.channelIdentifier, 'audioMessage')
      if (media?.base64) {
        const audioBytes = Buffer.from(media.base64, 'base64')
        const fd = new FormData()
        fd.append('file', new Blob([audioBytes], { type: media.mimetype ?? 'audio/ogg' }), 'audio.ogg')
        fd.append('model', 'whisper-1')
        fd.append('language', 'pt')
        const tr = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${openaiKey}` },
          body: fd,
        })
        if (tr.ok) {
          const { text: transcribed } = await tr.json()
          if (transcribed?.trim()) {
            effectiveText = transcribed.trim()
            console.log('[webhook] audio transcribed:', effectiveText!.slice(0, 100))
            // Save transcription back to message so operators can read it in the UI
            if (savedMsg?.id) {
              await supabase
                .from('messages')
                .update({ content: effectiveText })
                .eq('id', savedMsg.id)
            }
          }
        } else {
          console.warn('[webhook] Whisper error:', tr.status)
        }
      }
    } catch (err) {
      console.warn('[webhook] audio transcription error:', err instanceof Error ? err.message : err)
    }
    if (!effectiveText) {
      console.warn('[webhook] audio: transcription empty, skipping AI')
      return
    }
  }

  // 6c. Handle image — vision via GPT-4o
  if (msg.contentType === 'image') {
    if (!openaiKey) {
      console.warn('[webhook] image: no OpenAI key for vision, skipping AI')
      return
    }
    try {
      const { data: agentVision } = await supabase
        .from('agents')
        .select('personality, ai_config, behavior_config')
        .eq('id', channel.agent_id)
        .single()
      if (!agentVision) return

      const { data: historyVision } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: false })
        .limit(10)
      const convHistoryVision = (historyVision ?? [])
        .reverse()
        .filter((m) => m.content !== '[mídia]')
        .slice(0, -1)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      const p = agentVision.personality as Record<string, unknown>
      const systemPrompt = ((p?.systemPrompt as string) || (p?.instructions as string) || `Você é ${(p?.role as string) ?? 'um assistente virtual'}.`).trim()

      // Try to get image base64 from Evolution API
      const media = await fetchEvolutionMedia(msg.externalId, msg.senderExternalId, msg.channelIdentifier, 'imageMessage')

      const userContent: unknown[] = []
      if (media?.base64) {
        userContent.push({ type: 'image_url', image_url: { url: `data:${media.mimetype ?? 'image/jpeg'};base64,${media.base64}` } })
      }
      userContent.push({ type: 'text', text: msg.text || (media?.base64 ? 'Descreva e responda conforme necessário.' : 'O usuário enviou uma imagem (não foi possível carregá-la).') })

      const visionMessages = [
        { role: 'system', content: systemPrompt },
        ...convHistoryVision.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userContent },
      ]

      const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o', messages: visionMessages, max_tokens: 1000 }),
      })

      if (!visionRes.ok) {
        const errBody = await visionRes.json().catch(() => ({}))
        console.error('[webhook] vision API error:', visionRes.status, errBody?.error?.message)
        return
      }

      const visionData = await visionRes.json()
      const aiContent: string = visionData.choices[0]?.message?.content ?? ''
      if (!aiContent) return

      await supabase.from('messages').insert({
        conversation_id: conversationId,
        organization_id: channel.organization_id,
        role: 'assistant',
        content: aiContent,
        content_type: 'text',
        sender_type: 'agent',
        ai_model: 'gpt-4o',
      })
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId)

      const sendAdapterVision = new EvolutionWhatsAppAdapter(
        process.env.EVOLUTION_API_URL!,
        process.env.EVOLUTION_API_KEY!,
        msg.channelIdentifier
      )
      await sendAdapterVision.sendMessage({
        channelType: 'whatsapp',
        channelIdentifier: msg.channelIdentifier,
        recipientExternalId: msg.senderExternalId,
        contentType: 'text',
        text: aiContent,
      })
      await supabase.from('organizations').update({ credits_balance: org.credits_balance - 10 }).eq('id', channel.organization_id)
      console.log('[webhook] image vision response sent (10 credits deducted)')
    } catch (err) {
      console.error('[webhook] image vision error:', err instanceof Error ? err.message : err)
    }
    return
  }

  // Skip if still no processable text
  if (!effectiveText) { console.log('[webhook] no text content, skipping AI'); return }

  // 6d. Run automations
  const automationResult = await runAutomations({
    supabase,
    organizationId: channel.organization_id,
    agentId: channel.agent_id,
    contactId,
    conversationId,
    messageText: effectiveText,
    isFirstMessage: !existingConv,
    senderExternalId: msg.senderExternalId,
    channelIdentifier: msg.channelIdentifier,
    evolutionApiUrl: process.env.EVOLUTION_API_URL!,
    evolutionApiKey: process.env.EVOLUTION_API_KEY!,
  })
  if (automationResult.skipAI) {
    console.log('[webhook] automation handled, skipping AI')
    return
  }

  console.log('[webhook] running AI for conversation:', conversationId)

  // 7. Fetch agent config
  const { data: agent } = await supabase
    .from('agents')
    .select('personality, ai_config, behavior_config')
    .eq('id', channel.agent_id)
    .single()

  if (!agent) return

  // 8. Fetch last 10 messages for conversation history
  const { data: history } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(10)

  const conversationHistory = (history ?? [])
    .reverse()
    .filter((m) => m.content !== '[mídia]')
    .slice(0, -1) // exclude the message we just inserted
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  // 9a. Campaign context — inject if contact was reached via campaign
  let campaignContext = ''
  try {
    campaignContext = await retrieveCampaignContext(supabase, conversationId, contactId, channel.organization_id) ?? ''
  } catch {
    // optional — continue without it
  }

  // 9. RAG context (optional)
  let retrievedContext = ''
  let imageUrlsFromKnowledge: string[] = []
  try {
    if (openaiKey) {
      const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: effectiveText }),
      })
      if (embedRes.ok) {
        const { data } = await embedRes.json()
        const embedding: number[] = data[0].embedding
        const { data: chunks } = await supabase.rpc('match_knowledge_chunks', {
          query_embedding: `[${embedding.join(',')}]`,
          match_agent_id: channel.agent_id,
          match_threshold: 0.5,
          match_count: 8,
        })
        if (chunks?.length) {
          const typedChunks = chunks as { content: string; metadata?: { imageUrl?: string } }[]
          retrievedContext = typedChunks.map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
          imageUrlsFromKnowledge = typedChunks
            .filter((c) => c.metadata?.imageUrl)
            .map((c) => c.metadata!.imageUrl!)
            .slice(0, 3)
        }
      }
    }
  } catch {
    // RAG is optional — continue without it
  }

  // 10. Run AI agent

  let aiResult
  try {
    aiResult = await runAgent({
      personality: agent.personality,
      aiConfig: agent.ai_config,
      behaviorConfig: agent.behavior_config,
      conversationHistory,
      userMessage: effectiveText,
      retrievedContext: retrievedContext || undefined,
      campaignContext: campaignContext || undefined,
      env: {
        openaiApiKey: aiKeys.openaiApiKey || process.env.OPENAI_API_KEY,
        anthropicApiKey: aiKeys.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
        groqApiKey: aiKeys.groqApiKey || process.env.GROQ_API_KEY,
      },
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[webhook] AI error:', errMsg, '| provider:', (agent.ai_config as any)?.provider ?? 'openai', '| hasOpenAIKey:', !!(aiKeys.openaiApiKey || process.env.OPENAI_API_KEY))

    // Send fallback message so user isn't left waiting
    const fallbackText = (agent.personality as any)?.fallbackMessage
      || 'Olá! Estou com uma instabilidade momentânea. Em breve retorno sua mensagem.'
    try {
      const fallbackAdapter = new EvolutionWhatsAppAdapter(
        process.env.EVOLUTION_API_URL!,
        process.env.EVOLUTION_API_KEY!,
        msg.channelIdentifier
      )
      await fallbackAdapter.sendMessage({
        channelType: 'whatsapp',
        channelIdentifier: msg.channelIdentifier,
        recipientExternalId: msg.senderExternalId,
        contentType: 'text',
        text: fallbackText,
      })
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        organization_id: channel.organization_id,
        role: 'assistant',
        content: fallbackText,
        content_type: 'text',
        sender_type: 'agent',
      })
      console.log('[webhook] fallback message sent due to AI error')
    } catch (sendErr) {
      console.error('[webhook] failed to send fallback message:', sendErr instanceof Error ? sendErr.message : sendErr)
    }
    return
  }

  console.log('[webhook] AI result:', aiResult?.content?.slice(0, 80))
  if (!aiResult?.content) { console.warn('[webhook] AI returned no content'); return }

  // 11. Save AI response to DB
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    organization_id: channel.organization_id,
    role: 'assistant',
    content: aiResult.content,
    content_type: 'text',
    sender_type: 'agent',
    ai_model: aiResult.model,
  })

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  // 12. Send via WhatsApp
  const sendAdapter = new EvolutionWhatsAppAdapter(
    process.env.EVOLUTION_API_URL!,
    process.env.EVOLUTION_API_KEY!,
    msg.channelIdentifier
  )
  await sendAdapter.sendMessage({
    channelType: 'whatsapp',
    channelIdentifier: msg.channelIdentifier,
    recipientExternalId: msg.senderExternalId,
    contentType: 'text',
    text: aiResult.content,
  })

  console.log('[webhook] message sent via WhatsApp')

  // 12b. Send product images from knowledge base
  for (const imageUrl of imageUrlsFromKnowledge) {
    try {
      await sendAdapter.sendImage(msg.senderExternalId, imageUrl)
      console.log('[webhook] product image sent:', imageUrl.slice(0, 60))
    } catch (err) {
      console.warn('[webhook] failed to send product image:', err instanceof Error ? err.message : err)
    }
  }

  // 13. Deduct credits (text=1, audio=3, image=10)
  await supabase
    .from('organizations')
    .update({ credits_balance: org.credits_balance - creditCost })
    .eq('id', channel.organization_id)

  // 14. If agent detected handoff trigger, send handoff message + switch to human mode
  if (aiResult.shouldHandoffToHuman) {
    const handoffMsg = ((agent.behavior_config as any)?.offHoursMessage ?? '').trim()
    if (handoffMsg) {
      try {
        await sendAdapter.sendMessage({
          channelType: 'whatsapp',
          channelIdentifier: msg.channelIdentifier,
          recipientExternalId: msg.senderExternalId,
          contentType: 'text',
          text: handoffMsg,
        })
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          organization_id: channel.organization_id,
          role: 'assistant',
          content: handoffMsg,
          content_type: 'text',
          sender_type: 'human',
        })
        await supabase.from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId)
        console.log('[webhook] handoff message sent')
      } catch (err) {
        console.error('[webhook] failed to send handoff message:', err instanceof Error ? err.message : err)
      }
    }
    await supabase
      .from('conversations')
      .update({ mode: 'human' })
      .eq('id', conversationId)
    console.log('[webhook] conversation switched to human mode')
  }
}

// ─── Connection state handler ─────────────────────────────────────────────────

async function handleConnectionUpdate(p: Record<string, unknown>) {
  const instanceName = p?.instance as string | undefined
  if (!instanceName) return

  // Evolution API sends state as p.data.instance.state or p.state
  const data = p?.data as Record<string, unknown> | undefined
  const state: string =
    (data?.instance as any)?.state ??
    (data as any)?.state ??
    (p?.state as string) ??
    ''

  console.log(`[webhook/connection] instance=${instanceName} state=${state}`)

  const supabase = getSupabase()

  // Find the channel by instanceName
  const { data: channels } = await supabase
    .from('channels')
    .select('id, organization_id, status')
    .eq('type', 'whatsapp')
    .filter('credentials->>instanceName', 'eq', instanceName)
    .limit(1)

  const channel = channels?.[0]
  if (!channel) {
    console.warn(`[webhook/connection] no channel found for instance: ${instanceName}`)
    return
  }

  if (state === 'open') {
    // Connection established — mark as connected
    if (channel.status !== 'connected') {
      await supabase
        .from('channels')
        .update({ status: 'connected', connected_at: new Date().toISOString() })
        .eq('id', channel.id)
      console.log(`[webhook/connection] channel ${channel.id} → connected`)
    }
  } else if (['close', 'closing', 'qrcode', 'notLogged'].includes(state) || state === '') {
    // Connection lost — mark as disconnected and create alert
    if (channel.status !== 'disconnected') {
      await supabase
        .from('channels')
        .update({ status: 'disconnected' })
        .eq('id', channel.id)
      console.warn(`[webhook/connection] channel ${channel.id} → DISCONNECTED (state=${state})`)

      // Store disconnection alert in organization settings for UI banner
      const { data: org } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', channel.organization_id)
        .single()

      const settings = (org?.settings ?? {}) as Record<string, unknown>
      const alerts: any[] = Array.isArray(settings.channelAlerts) ? settings.channelAlerts : []

      // Keep only last 10 alerts and avoid duplicates for the same channel
      const filtered = alerts.filter((a: any) => a.channelId !== channel.id)
      filtered.unshift({
        channelId: channel.id,
        instanceName,
        type: 'disconnected',
        state,
        at: new Date().toISOString(),
      })

      await supabase
        .from('organizations')
        .update({ settings: { ...settings, channelAlerts: filtered.slice(0, 10) } })
        .eq('id', channel.organization_id)
    }
  }
}

// ─── Automations engine ────────────────────────────────────────────────────────

async function runAutomations(ctx: {
  supabase: ReturnType<typeof getSupabase>
  organizationId: string
  agentId: string
  contactId: string
  conversationId: string
  messageText: string
  isFirstMessage: boolean
  senderExternalId: string
  channelIdentifier: string
  evolutionApiUrl: string
  evolutionApiKey: string
}): Promise<{ skipAI: boolean }> {
  try {
    const { data: automations } = await ctx.supabase
      .from('automations')
      .select('*')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .or(`agent_id.is.null,agent_id.eq.${ctx.agentId}`)

    if (!automations?.length) return { skipAI: false }

    const nowHour = new Date().getHours()
    let skipAI = false

    for (const automation of automations) {
      const tc = automation.trigger_config as Record<string, unknown>
      const ac = automation.action_config as Record<string, unknown>

      // Check trigger
      let triggered = false
      if (automation.trigger_type === 'keyword' && ctx.messageText) {
        const keywords = (tc.keywords as string[] | undefined) ?? []
        const matchAll = tc.matchAll as boolean | undefined
        const text = ctx.messageText.toLowerCase()
        if (matchAll) {
          triggered = keywords.every((k) => text.includes(k.toLowerCase()))
        } else {
          triggered = keywords.some((k) => text.includes(k.toLowerCase()))
        }
      } else if (automation.trigger_type === 'first_message') {
        triggered = ctx.isFirstMessage
      } else if (automation.trigger_type === 'off_hours') {
        const start = (tc.endHour as number) ?? 8   // business start
        const end = (tc.startHour as number) ?? 18  // business end
        triggered = nowHour < start || nowHour >= end
      }

      if (!triggered) continue

      console.log(`[webhook] automation triggered: ${automation.name} (${automation.trigger_type} → ${automation.action_type})`)

      // Execute action
      if (automation.action_type === 'send_message' && ac.message) {
        const adapter = new EvolutionWhatsAppAdapter(ctx.evolutionApiUrl, ctx.evolutionApiKey, ctx.channelIdentifier)
        await adapter.sendMessage({
          channelType: 'whatsapp',
          channelIdentifier: ctx.channelIdentifier,
          recipientExternalId: ctx.senderExternalId,
          contentType: 'text',
          text: ac.message as string,
        })
        // Save automation message in DB
        await ctx.supabase.from('messages').insert({
          conversation_id: ctx.conversationId,
          organization_id: ctx.organizationId,
          role: 'assistant',
          content: ac.message as string,
          content_type: 'text',
          sender_type: 'agent',
        })
        await ctx.supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', ctx.conversationId)
        skipAI = true
      } else if (automation.action_type === 'add_tag' && ac.tag) {
        const tag = ac.tag as string
        const { data: contact } = await ctx.supabase
          .from('contacts')
          .select('tags')
          .eq('id', ctx.contactId)
          .single()
        const existing: string[] = contact?.tags ?? []
        if (!existing.includes(tag)) {
          await ctx.supabase.from('contacts').update({ tags: [...existing, tag] }).eq('id', ctx.contactId)
        }
      } else if (automation.action_type === 'change_stage' && ac.stage) {
        await ctx.supabase.from('contacts').update({ kanban_stage: ac.stage }).eq('id', ctx.contactId)
      } else if (automation.action_type === 'handoff') {
        await ctx.supabase.from('conversations').update({ mode: 'human' }).eq('id', ctx.conversationId)
        skipAI = true
      }

      // Increment executions counter
      await ctx.supabase
        .from('automations')
        .update({ executions_count: (automation.executions_count ?? 0) + 1 })
        .eq('id', automation.id)
    }

    return { skipAI }
  } catch (err) {
    console.error('[webhook] automations error:', err instanceof Error ? err.message : err)
    return { skipAI: false }
  }
}

async function retrieveCampaignContext(supabase: any, conversationId: string, contactId: string, organizationId?: string): Promise<string | undefined> {
  let campaignId: string | undefined
  let alreadySaved = false

  // 1. Try to find campaign via message history (sender_type='campaign')
  const { data: campaignMsg } = await supabase
    .from('messages')
    .select('metadata')
    .eq('conversation_id', conversationId)
    .eq('sender_type', 'campaign')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (campaignMsg?.metadata?.campaign_id) {
    campaignId = campaignMsg.metadata.campaign_id
    alreadySaved = true
  }

  // 2. Fallback: check campaign_messages table
  let campaignSentAt: string | undefined
  if (!campaignId && contactId) {
    const { data: cm } = await supabase
      .from('campaign_messages')
      .select('campaign_id, sent_at')
      .eq('contact_id', contactId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (cm?.campaign_id) {
      campaignId = cm.campaign_id
      campaignSentAt = cm.sent_at
    }
  }

  if (!campaignId) return undefined

  // Load campaign details
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('name, target_type, target_value, message, organization_id')
    .eq('id', campaignId)
    .maybeSingle()

  if (!campaign) return undefined

  // 3. Save the campaign message to conversation history if not already there
  if (!alreadySaved && conversationId) {
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      organization_id: campaign.organization_id ?? organizationId,
      role: 'assistant',
      content: campaign.message,
      content_type: 'text',
      sender_type: 'campaign',
      delivery_status: 'sent',
      metadata: { campaign_id: campaignId, campaign_name: campaign.name },
      ...(campaignSentAt ? { created_at: campaignSentAt } : {}),
    })
  }

  let listName = campaign.target_value
  if (campaign.target_type === 'list' && campaign.target_value) {
    const orgId = campaign.organization_id ?? organizationId
    const { data: org } = await supabase
      .from('organizations').select('settings').eq('id', orgId).maybeSingle()
    const lists: any[] = org?.settings?.contactLists ?? []
    const found = lists.find((l: any) => l.id === campaign.target_value)
    if (found?.name) listName = found.name
  }

  const targetLabels: Record<string, string> = {
    all: 'todos os contatos',
    tag: `contatos com a tag "${campaign.target_value}"`,
    stage: `contatos no estágio "${campaign.target_value}"`,
    list: `lista "${listName}"`,
    with_conversation: 'contatos com conversas anteriores',
  }
  const targetDesc = targetLabels[campaign.target_type] ?? campaign.target_type

  let context = `## Contexto de Campanha\n`
  context += `Este contato foi abordado pela campanha **"${campaign.name}"**, direcionada para ${targetDesc}.\n`
  context += `Mensagem enviada na campanha: "${campaign.message}"\n`
  context += `\nIMPORTANTE: Você já enviou uma abordagem inicial para este contato via campanha. `
  context += `Não pergunte informações que você já tem (como segmento, profissão ou tipo de negócio) se a campanha já segmentou esse público. `
  context += `Continue a conversa de forma coerente com o contexto da campanha.`

  return context
}

// ─── Evolution API media helper ───────────────────────────────────────────────

async function fetchEvolutionMedia(
  messageId: string,
  senderPhone: string,
  instanceName: string,
  messageType: 'imageMessage' | 'audioMessage'
): Promise<{ base64: string; mimetype: string } | null> {
  try {
    const res = await fetch(
      `${process.env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${instanceName}`,
      {
        method: 'POST',
        headers: {
          apikey: process.env.EVOLUTION_API_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            key: { id: messageId, fromMe: false, remoteJid: `${senderPhone}@s.whatsapp.net` },
            messageType,
          },
        }),
      }
    )
    if (!res.ok) {
      console.warn(`[webhook] fetchEvolutionMedia ${messageType} failed: HTTP ${res.status}`)
      return null
    }
    return await res.json()
  } catch (err) {
    console.warn('[webhook] fetchEvolutionMedia error:', err instanceof Error ? err.message : err)
    return null
  }
}
