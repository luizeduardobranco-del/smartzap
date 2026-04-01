import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

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
      .select('*, channels(id, credentials, agents(id, name))')
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
        .select('*, channels(id, credentials, agents(id, name)), campaign_messages(id, status)')
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
      dailyLimit: z.number().min(1).max(500).optional(),
      scheduledAt: z.string().optional(),
      funnelId: z.string().uuid().optional(),
      funnelStageId: z.string().uuid().optional(),
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
          daily_limit: input.dailyLimit ?? null,
          scheduled_at: input.scheduledAt ?? null,
          funnel_id: input.funnelId ?? null,
          funnel_stage_id: input.funnelStageId ?? null,
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
        query = query.contains('tags', [`_list:${campaign.target_value}`])
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

      const db = getServiceClient()

      // Delete previous pending messages if re-starting
      await db.from('campaign_messages').delete().eq('campaign_id', input.id).eq('status', 'pending')

      // Create campaign_messages
      const msgs = contacts.map((c: any) => ({
        campaign_id: input.id,
        contact_id: c.id,
        contact_phone: c.external_id ?? c.phone,
        contact_name: c.name ?? '',
        status: 'pending',
      }))
      const { error: insertErr } = await db.from('campaign_messages').insert(msgs)
      if (insertErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `campaign_messages insert: ${insertErr.message}` })

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

      // Enroll contacts into funnel stage if configured
      if (campaign.funnel_id && campaign.funnel_stage_id) {
        const contactIds = contacts.map((c: any) => c.id).filter(Boolean)
        if (contactIds.length > 0) {
          const funnelRows = contactIds.map((cid: string) => ({
            funnel_id: campaign.funnel_id,
            stage_id: campaign.funnel_stage_id,
            contact_id: cid,
            organization_id: orgId,
            channel_id: campaign.channel_id ?? null,
            status: 'active',
            entered_stage_at: new Date().toISOString(),
            next_message_index: 0,
            next_message_at: null,
          }))
          await db
            .from('funnel_contacts')
            .upsert(funnelRows, { onConflict: 'funnel_id,contact_id', ignoreDuplicates: true })
        }
      }

      return { started: true, total: contacts.length }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1),
      message: z.string().min(5),
      channelId: z.string().uuid(),
      targetType: z.enum(['all', 'tag', 'stage', 'with_conversation', 'list']),
      targetValue: z.string().optional(),
      delaySeconds: z.number().min(3).max(30),
      businessHoursOnly: z.boolean(),
      dailyLimit: z.number().min(1).max(500).optional(),
      funnelId: z.string().uuid().optional(),
      funnelStageId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { error } = await ctx.supabase
        .from('campaigns')
        .update({
          name: input.name,
          message: input.message,
          channel_id: input.channelId,
          target_type: input.targetType,
          target_value: input.targetValue ?? null,
          delay_seconds: input.delaySeconds,
          business_hours_only: input.businessHoursOnly,
          daily_limit: input.dailyLimit ?? null,
          funnel_id: input.funnelId ?? null,
          funnel_stage_id: input.funnelStageId ?? null,
        })
        .eq('id', input.id)
        .eq('organization_id', orgId)
        .in('status', ['draft', 'paused'])
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
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
