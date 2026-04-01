import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MetaInstagramAdapter } from '@zapagent/channel-adapters'
import { runAgent } from '@zapagent/ai-engine'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── GET: Meta webhook verification ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ─── POST: Receive Instagram messages ────────────────────────────────────────

export async function POST(request: NextRequest) {
  const payload = await request.json()
  try {
    await handleWebhook(payload)
  } catch (err) {
    console.error('[webhook/instagram]', err instanceof Error ? err.message : err)
  }
  // Always return 200 to Meta to acknowledge receipt
  return NextResponse.json({ ok: true })
}

async function handleWebhook(payload: unknown) {
  const p = payload as Record<string, unknown>
  if (p.object !== 'instagram') return

  // Use a temporary adapter (igUserId not needed for initial parse)
  const parseAdapter = new MetaInstagramAdapter('', '')
  const msg = parseAdapter.parseWebhook(payload)
  if (!msg) {
    console.log('[webhook/instagram] parseWebhook returned null — skipping')
    return
  }

  console.log('[webhook/instagram] msg parsed:', {
    channelIdentifier: msg.channelIdentifier,
    senderExternalId: msg.senderExternalId,
    contentType: msg.contentType,
    text: msg.text?.slice(0, 50),
  })

  const supabase = getSupabase()

  // 1. Find channel by igUserId
  const { data: channelRows, error: channelErr } = await supabase
    .from('channels')
    .select('id, organization_id, agent_id, status, credentials')
    .eq('type', 'instagram')
    .eq('status', 'connected')
    .filter('credentials->>igUserId', 'eq', msg.channelIdentifier)
    .limit(1)

  if (channelErr) console.error('[webhook/instagram] channel query error:', channelErr.message)

  const channel = channelRows?.[0]
  if (!channel) {
    console.warn('[webhook/instagram] No channel found for igUserId:', msg.channelIdentifier)
    return
  }
  if (!channel.agent_id) {
    console.warn('[webhook/instagram] Channel has no agent_id:', channel.id)
    return
  }

  const creds = channel.credentials as {
    igUserId: string
    pageAccessToken: string
    pageId: string
    igUsername?: string
  }

  // 2. Check credits
  const { data: org } = await supabase
    .from('organizations')
    .select('credits_balance, settings')
    .eq('id', channel.organization_id)
    .single()

  if (!org || org.credits_balance <= 0) {
    console.warn('[webhook/instagram] No credits for org:', channel.organization_id)
    return
  }

  // 3. Upsert contact
  let contactId: string
  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('organization_id', channel.organization_id)
    .eq('channel_type', 'instagram')
    .eq('external_id', msg.senderExternalId)
    .maybeSingle()

  if (existingContact) {
    contactId = existingContact.id
  } else {
    const { data: newContact, error: contactErr } = await supabase
      .from('contacts')
      .insert({
        organization_id: channel.organization_id,
        external_id: msg.senderExternalId,
        channel_type: 'instagram',
        name: msg.senderName ?? msg.senderExternalId,
      })
      .select('id')
      .single()
    if (!newContact) {
      console.error('[webhook/instagram] contact insert failed:', contactErr?.message)
      return
    }
    contactId = newContact.id
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
    if (!newConv) {
      console.error('[webhook/instagram] conversation insert failed:', convErr?.message)
      return
    }
    conversationId = newConv.id
    conversationMode = newConv.mode
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

  // 6. Skip AI if human mode or non-text media without caption
  if (conversationMode === 'human') return
  if (!savedMsg) return
  if (msg.contentType === 'document' || msg.contentType === 'video') return
  if (!msg.text) return

  // 7. Fetch agent config
  const { data: agent } = await supabase
    .from('agents')
    .select('personality, ai_config, behavior_config')
    .eq('id', channel.agent_id)
    .single()

  if (!agent) return

  // 8. Conversation history
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
    .slice(0, -1)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  // 9. AI keys
  const orgSettings = org.settings as Record<string, Record<string, string>> | null
  const aiKeys = orgSettings?.aiKeys ?? {}

  // 10. RAG context
  let retrievedContext = ''
  const openaiKey = aiKeys.openaiApiKey || process.env.OPENAI_API_KEY
  try {
    if (openaiKey) {
      const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: msg.text }),
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
          retrievedContext = (chunks as { content: string }[]).map((c, i) => `[${i + 1}] ${c.content}`).join('\n\n')
        }
      }
    }
  } catch {
    // RAG is optional
  }

  // 11. Run AI
  let aiResult
  try {
    aiResult = await runAgent({
      personality: agent.personality,
      aiConfig: agent.ai_config,
      behaviorConfig: agent.behavior_config,
      conversationHistory,
      userMessage: msg.text,
      retrievedContext: retrievedContext || undefined,
      env: {
        openaiApiKey: aiKeys.openaiApiKey || process.env.OPENAI_API_KEY,
        anthropicApiKey: aiKeys.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
        groqApiKey: aiKeys.groqApiKey || process.env.GROQ_API_KEY,
      },
    })
  } catch (err) {
    console.error('[webhook/instagram] AI error:', err instanceof Error ? err.message : err)
    return
  }

  if (!aiResult?.content) return

  // 12. Save AI response
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

  // 13. Send via Instagram
  const sendAdapter = new MetaInstagramAdapter(creds.igUserId, creds.pageAccessToken)
  await sendAdapter.sendMessage({
    channelType: 'instagram',
    channelIdentifier: creds.igUserId,
    recipientExternalId: msg.senderExternalId,
    contentType: 'text',
    text: aiResult.content,
  })

  console.log('[webhook/instagram] message sent via Instagram DM')

  // 14. Deduct credits
  await supabase
    .from('organizations')
    .update({ credits_balance: org.credits_balance - 1 })
    .eq('id', channel.organization_id)

  // 15. Handoff if triggered
  if (aiResult.shouldHandoffToHuman) {
    await supabase
      .from('conversations')
      .update({ mode: 'human' })
      .eq('id', conversationId)
  }
}
