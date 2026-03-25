import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'

async function getOrgId(ctx: { supabase: any; user: { id: string } }) {
  const { data: member } = await ctx.supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', ctx.user.id)
    .single()
  if (!member) throw new TRPCError({ code: 'FORBIDDEN' })
  return member.organization_id as string
}

export const campaignsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx)
    const { data, error } = await ctx.supabase
      .from('campaigns')
      .select('*, channels(credentials)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { data, error } = await ctx.supabase
        .from('campaigns')
        .select('*, channels(id, credentials), campaign_messages(id, status)')
        .eq('id', input.id)
        .eq('organization_id', orgId)
        .single()
      if (error) throw new TRPCError({ code: 'NOT_FOUND' })
      return data
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      message: z.string().min(5),
      channelId: z.string().uuid(),
      targetType: z.enum(['all', 'tag', 'stage', 'with_conversation', 'list']),
      targetValue: z.string().optional(),
      delaySeconds: z.number().min(3).max(30).default(5),
      businessHoursOnly: z.boolean().default(true),
      scheduledAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { data, error } = await ctx.supabase
        .from('campaigns')
        .insert({
          organization_id: orgId,
          name: input.name,
          message: input.message,
          channel_id: input.channelId,
          target_type: input.targetType,
          target_value: input.targetValue ?? null,
          delay_seconds: input.delaySeconds,
          business_hours_only: input.businessHoursOnly,
          scheduled_at: input.scheduledAt ?? null,
          status: 'draft',
        })
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  start: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)

      // Get campaign
      const { data: campaign } = await ctx.supabase
        .from('campaigns')
        .select('*')
        .eq('id', input.id)
        .eq('organization_id', orgId)
        .single()
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!['draft', 'paused'].includes(campaign.status)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Campanha não pode ser iniciada' })
      }

      // Build target contacts
      let query = ctx.supabase
        .from('contacts')
        .select('id, name, phone, external_id')
        .eq('organization_id', orgId)
        .eq('channel_type', 'whatsapp')

      if (campaign.target_type === 'tag') {
        query = query.contains('tags', [campaign.target_value])
      } else if (campaign.target_type === 'stage') {
        query = query.eq('kanban_stage', campaign.target_value)
      } else if (campaign.target_type === 'list') {
        const { data: members } = await ctx.supabase
          .from('contact_list_members')
          .select('contact_id')
          .eq('list_id', campaign.target_value)
        const ids = (members ?? []).map((m: any) => m.contact_id)
        if (ids.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Lista vazia ou não encontrada' })
        query = query.in('id', ids)
      } else if (campaign.target_type === 'with_conversation') {
        // Only contacts that have conversations
        const { data: convContacts } = await ctx.supabase
          .from('conversations')
          .select('contact_id')
          .eq('organization_id', orgId)
        const ids = [...new Set((convContacts ?? []).map((c: any) => c.contact_id))]
        if (ids.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum contato com conversa encontrada' })
        query = query.in('id', ids)
      }

      const { data: contacts } = await query.limit(200) // daily limit
      if (!contacts?.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum contato encontrado para o alvo selecionado' })

      // Delete previous pending messages if re-starting
      await ctx.supabase.from('campaign_messages').delete().eq('campaign_id', input.id).eq('status', 'pending')

      // Create campaign_messages
      const msgs = contacts.map((c: any) => ({
        campaign_id: input.id,
        contact_id: c.id,
        contact_phone: c.external_id ?? c.phone,
        contact_name: c.name ?? '',
        status: 'pending',
      }))
      await ctx.supabase.from('campaign_messages').insert(msgs)

      // Update campaign status
      await ctx.supabase
        .from('campaigns')
        .update({
          status: 'running',
          started_at: new Date().toISOString(),
          total_contacts: contacts.length,
          sent_count: 0,
          failed_count: 0,
        })
        .eq('id', input.id)

      return { started: true, total: contacts.length }
    }),

  pause: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      await ctx.supabase
        .from('campaigns')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .eq('organization_id', orgId)
      return { success: true }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      await ctx.supabase.from('campaign_messages').delete().eq('campaign_id', input.id)
      const { error } = await ctx.supabase.from('campaigns').delete().eq('id', input.id).eq('organization_id', orgId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
