import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'

export const conversationsRouter = router({
  list: protectedProcedure
    .input(z.object({
      agentId: z.string().uuid().optional(),
      status: z.string().optional(),
      mode: z.enum(['ai', 'human']).optional(),
      limit: z.number().default(200),
    }))
    .query(async ({ ctx, input }) => {
      const { data: member } = await ctx.supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', ctx.user.id)
        .single()
      if (!member) return []

      let query = ctx.supabase
        .from('conversations')
        .select(`
          id, status, mode, kanban_stage, last_message_at, operator_read_at, created_at, contact_id,
          contacts(id, name, phone, avatar_url, channel_type),
          agents(id, name),
          channels(id, type)
        `)
        .eq('organization_id', member.organization_id)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(input.limit)

      if (input.agentId) query = query.eq('agent_id', input.agentId)
      if (input.status) query = query.eq('status', input.status)
      if (input.mode) query = query.eq('mode', input.mode)

      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('conversations')
        .select(`
          id, status, mode, kanban_stage, created_at, last_message_at,
          contacts(id, name, phone, avatar_url, channel_type),
          agents(id, name, ai_config),
          channels(id, type, config)
        `)
        .eq('id', input.id)
        .single()

      if (error || !data) throw new TRPCError({ code: 'NOT_FOUND' })
      return data
    }),

  getContactThread: protectedProcedure
    .input(z.object({ contactId: z.string().uuid(), limit: z.number().default(200) }))
    .query(async ({ ctx, input }) => {
      // Contact info + active funnel enrollment
      const [{ data: contact }, { data: funnelContact }] = await Promise.all([
        ctx.supabase
          .from('contacts')
          .select('id, name, phone, avatar_url, channel_type, tags, kanban_stage')
          .eq('id', input.contactId)
          .single(),
        ctx.supabase
          .from('funnel_contacts')
          .select('id, status, funnel_id, stage_id, funnels(id, name), funnel_stages(id, name, position)')
          .eq('contact_id', input.contactId)
          .in('status', ['active', 'waiting', 'paused'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      // All conversations for this contact, newest first
      const { data: conversations } = await ctx.supabase
        .from('conversations')
        .select('id, status, mode, created_at, last_message_at, agents(id, name)')
        .eq('contact_id', input.contactId)
        .order('created_at', { ascending: true })

      if (!conversations?.length) return { contact, funnelContact: funnelContact ?? null, conversations: [], messages: [] }

      // All messages across all conversations.
      // Busca DESC + inverte: ordenar ASC com limit devolvia as mensagens mais
      // ANTIGAS da thread. Passou a importar depois que as conversas duplicadas
      // foram consolidadas — threads de 400+ mensagens abririam em julho.
      const convIds = conversations.map((c) => c.id)
      const { data: messages, error } = await ctx.supabase
        .from('messages')
        .select('id, role, content, content_type, media_url, created_at, sender_type, ai_model, conversation_id')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(input.limit)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return {
        contact,
        funnelContact: funnelContact ?? null,
        conversations: conversations ?? [],
        messages: (messages ?? []).reverse(),
      }
    }),

  getMessages: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      // DESC + reverse: com ASC + limit vinham as mensagens mais antigas.
      const { data, error } = await ctx.supabase
        .from('messages')
        .select('id, role, content, content_type, created_at, sender_type, ai_model, delivery_status')
        .eq('conversation_id', input.conversationId)
        .order('created_at', { ascending: false })
        .limit(input.limit)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return (data ?? []).reverse()
    }),

  setMode: protectedProcedure
    .input(z.object({ id: z.string().uuid(), mode: z.enum(['ai', 'human']) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('conversations')
        .update({ mode: input.mode, updated_at: new Date().toISOString() })
        .eq('id', input.id)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // Resolve TODAS as conversas abertas do contato, não só a que está na tela.
  // A UI é orientada a contato (agrupa por contact_id), então resolver uma linha
  // só deixava o contato de volta na fila — era por isso que o painel
  // "aguardando atendimento" não baixava por mais que se clicasse em Resolver.
  // O mode volta para 'ai': encerrado o atendimento humano, a próxima mensagem
  // do lead abre uma conversa nova e o agente responde.
  resolve: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: conv } = await ctx.supabase
        .from('conversations')
        .select('contact_id')
        .eq('id', input.id)
        .single()

      const patch = { status: 'resolved', resolved_at: new Date().toISOString(), mode: 'ai' }

      const query = conv?.contact_id
        ? ctx.supabase.from('conversations').update(patch).eq('contact_id', conv.contact_id).eq('status', 'open')
        : ctx.supabase.from('conversations').update(patch).eq('id', input.id)

      const { data, error } = await query.select('id')
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true, resolved: data?.length ?? 0 }
    }),

  sendMessage: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid(), text: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Get conversation with channel and contact info
      const { data: conv } = await ctx.supabase
        .from('conversations')
        .select('id, organization_id, mode, channels(credentials), contacts(external_id, phone)')
        .eq('id', input.conversationId)
        .single()

      if (!conv) throw new TRPCError({ code: 'NOT_FOUND' })
      if (conv.mode !== 'human') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Conversa não está em modo humano' })

      const instanceName = (conv.channels as any)?.credentials?.instanceName
      const phone = (conv.contacts as any)?.external_id ?? (conv.contacts as any)?.phone

      if (!instanceName || !phone) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Canal ou contato inválido' })

      // Save message to DB
      const { error: msgErr } = await ctx.supabase.from('messages').insert({
        conversation_id: input.conversationId,
        organization_id: conv.organization_id,
        role: 'assistant',
        content: input.text,
        content_type: 'text',
        sender_type: 'human',
      })
      if (msgErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: msgErr.message })

      // Update last_message_at. operator_read_at junto, senão a própria resposta
      // do operador reacende o badge de "não lida" no refetch seguinte.
      const sentAt = new Date().toISOString()
      await ctx.supabase
        .from('conversations')
        .update({ last_message_at: sentAt, operator_read_at: sentAt })
        .eq('id', input.conversationId)

      // Send via WhatsApp
      const adapter = new EvolutionWhatsAppAdapter(
        process.env.EVOLUTION_API_URL!,
        process.env.EVOLUTION_API_KEY!,
        instanceName
      )
      await adapter.sendMessage({
        channelType: 'whatsapp',
        channelIdentifier: instanceName,
        recipientExternalId: phone,
        contentType: 'text',
        text: input.text,
      })

      return { success: true }
    }),

  // Marca lida a thread INTEIRA do contato. A lista agrupa por contato, então
  // marcar só a conversa da linha deixava as demais não lidas e o badge voltava
  // assim que o agrupamento apontasse para outra conversa.
  markRead: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data: conv } = await ctx.supabase
        .from('conversations')
        .select('contact_id')
        .eq('id', input.conversationId)
        .single()

      const now = new Date().toISOString()
      const query = conv?.contact_id
        ? ctx.supabase.from('conversations').update({ operator_read_at: now }).eq('contact_id', conv.contact_id)
        : ctx.supabase.from('conversations').update({ operator_read_at: now }).eq('id', input.conversationId)

      const { error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
