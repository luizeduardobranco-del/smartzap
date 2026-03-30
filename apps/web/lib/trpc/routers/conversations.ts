import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'

export const conversationsRouter = router({
  list: protectedProcedure
    .input(z.object({
      agentId: z.string().uuid().optional(),
      status: z.string().optional(),
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
          id, status, mode, kanban_stage, last_message_at, created_at, contact_id,
          contacts(id, name, phone, avatar_url, channel_type),
          agents(id, name),
          channels(id, type)
        `)
        .eq('organization_id', member.organization_id)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(input.limit)

      if (input.agentId) query = query.eq('agent_id', input.agentId)
      if (input.status) query = query.eq('status', input.status)

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
      // Contact info
      const { data: contact } = await ctx.supabase
        .from('contacts')
        .select('id, name, phone, avatar_url, channel_type')
        .eq('id', input.contactId)
        .single()

      // All conversations for this contact, newest first
      const { data: conversations } = await ctx.supabase
        .from('conversations')
        .select('id, status, mode, created_at, last_message_at, agents(id, name)')
        .eq('contact_id', input.contactId)
        .order('created_at', { ascending: true })

      if (!conversations?.length) return { contact, conversations: [], messages: [] }

      // All messages across all conversations
      const convIds = conversations.map((c) => c.id)
      const { data: messages, error } = await ctx.supabase
        .from('messages')
        .select('id, role, content, content_type, created_at, sender_type, ai_model, conversation_id')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: true })
        .limit(input.limit)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { contact, conversations: conversations ?? [], messages: messages ?? [] }
    }),

  getMessages: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('messages')
        .select('id, role, content, content_type, created_at, sender_type, ai_model, delivery_status')
        .eq('conversation_id', input.conversationId)
        .order('created_at', { ascending: true })
        .limit(input.limit)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
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

  resolve: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('conversations')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', input.id)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
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

      // Update last_message_at
      await ctx.supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
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
})
