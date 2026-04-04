import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'
import { createClient } from '@supabase/supabase-js'

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
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

const stageMessageSchema = z.object({
  type: z.enum(['text', 'image', 'audio']),
  content: z.string().min(1),
  delay_minutes: z.number().min(0).default(0),
})

export const funnelsRouter = router({
  // ── List funnels ──────────────────────────────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx)
    const db = getDb()

    const { data, error } = await db
      .from('funnels')
      .select(`
        id, name, channel_id, created_at,
        funnel_stages(id, name, color, position),
        funnel_contacts(id, status)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  // ── Get funnel with stages + contacts ─────────────────────────
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()

      const { data: funnel, error } = await db
        .from('funnels')
        .select(`
          id, name, channel_id, created_at,
          funnel_stages(id, name, color, position, messages, created_at)
        `)
        .eq('id', input.id)
        .eq('organization_id', orgId)
        .single()

      if (error || !funnel) throw new TRPCError({ code: 'NOT_FOUND' })

      // Load contacts per stage
      const { data: contacts } = await db
        .from('funnel_contacts')
        .select(`
          id, stage_id, status, entered_stage_at, next_message_at, next_message_index,
          contacts(id, name, phone, external_id, channel_type)
        `)
        .eq('funnel_id', input.id)
        .order('entered_stage_at', { ascending: false })

      return { ...funnel, contacts: contacts ?? [] }
    }),

  // ── Create funnel ─────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      channelId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()

      const { data, error } = await db
        .from('funnels')
        .insert({
          organization_id: orgId,
          name: input.name,
          channel_id: input.channelId ?? null,
        })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      // Create default stages
      const defaultStages = [
        { name: 'Novo Lead', color: '#3b82f6', position: 0 },
        { name: 'Primeiro Contato', color: '#8b5cf6', position: 1 },
        { name: 'Qualificado', color: '#06b6d4', position: 2 },
        { name: 'Proposta', color: '#f59e0b', position: 3 },
        { name: 'Fechado', color: '#10b981', position: 4 },
      ]
      await db.from('funnel_stages').insert(
        defaultStages.map((s) => ({ ...s, funnel_id: data.id }))
      )

      return data
    }),

  // ── Update funnel ─────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      channelId: z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.name !== undefined) patch.name = input.name
      if (input.channelId !== undefined) patch.channel_id = input.channelId

      const { error } = await db
        .from('funnels')
        .update(patch)
        .eq('id', input.id)
        .eq('organization_id', orgId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // ── Delete funnel ─────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()
      const { error } = await db
        .from('funnels')
        .delete()
        .eq('id', input.id)
        .eq('organization_id', orgId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // ── Create stage ──────────────────────────────────────────────
  createStage: protectedProcedure
    .input(z.object({
      funnelId: z.string().uuid(),
      name: z.string().min(1),
      color: z.string().default('#3b82f6'),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()

      // Verify ownership
      const { data: funnel } = await db
        .from('funnels')
        .select('id')
        .eq('id', input.funnelId)
        .eq('organization_id', orgId)
        .single()
      if (!funnel) throw new TRPCError({ code: 'FORBIDDEN' })

      // Get max position
      const { data: stages } = await db
        .from('funnel_stages')
        .select('position')
        .eq('funnel_id', input.funnelId)
        .order('position', { ascending: false })
        .limit(1)
      const nextPos = stages?.[0]?.position != null ? stages[0].position + 1 : 0

      const { data, error } = await db
        .from('funnel_stages')
        .insert({ funnel_id: input.funnelId, name: input.name, color: input.color, position: nextPos })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  // ── Update stage ──────────────────────────────────────────────
  updateStage: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      color: z.string().optional(),
      messages: z.array(stageMessageSchema).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()
      const patch: Record<string, unknown> = {}
      if (input.name !== undefined) patch.name = input.name
      if (input.color !== undefined) patch.color = input.color
      if (input.messages !== undefined) patch.messages = input.messages

      // Verify ownership via funnel
      const { data: stage } = await db
        .from('funnel_stages')
        .select('funnel_id')
        .eq('id', input.id)
        .single()
      if (!stage) throw new TRPCError({ code: 'NOT_FOUND' })

      const { data: funnel } = await db
        .from('funnels')
        .select('id')
        .eq('id', stage.funnel_id)
        .eq('organization_id', orgId)
        .single()
      if (!funnel) throw new TRPCError({ code: 'FORBIDDEN' })

      const { error } = await db.from('funnel_stages').update(patch).eq('id', input.id)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // ── Delete stage ──────────────────────────────────────────────
  deleteStage: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()

      const { data: stage } = await db
        .from('funnel_stages')
        .select('funnel_id')
        .eq('id', input.id)
        .single()
      if (!stage) throw new TRPCError({ code: 'NOT_FOUND' })

      const { data: funnel } = await db
        .from('funnels')
        .select('id')
        .eq('id', stage.funnel_id)
        .eq('organization_id', orgId)
        .single()
      if (!funnel) throw new TRPCError({ code: 'FORBIDDEN' })

      // Move contacts in this stage to null (remove from funnel)
      await db.from('funnel_contacts').delete().eq('stage_id', input.id)
      await db.from('funnel_stages').delete().eq('id', input.id)
      return { success: true }
    }),

  // ── Add contact to funnel ─────────────────────────────────────
  addContact: protectedProcedure
    .input(z.object({
      funnelId: z.string().uuid(),
      stageId: z.string().uuid(),
      contactId: z.string().uuid(),
      channelId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()

      // Get first message delay for scheduling
      const { data: stage } = await db
        .from('funnel_stages')
        .select('messages')
        .eq('id', input.stageId)
        .single()

      const messages = (stage?.messages as any[]) ?? []
      const firstDelay = messages[0]?.delay_minutes ?? 0
      const nextMessageAt = firstDelay > 0
        ? new Date(Date.now() + firstDelay * 60 * 1000).toISOString()
        : messages.length > 0 ? new Date().toISOString() : null

      const { data, error } = await db
        .from('funnel_contacts')
        .insert({
          funnel_id: input.funnelId,
          stage_id: input.stageId,
          contact_id: input.contactId,
          organization_id: orgId,
          channel_id: input.channelId ?? null,
          status: 'active',
          entered_stage_at: new Date().toISOString(),
          next_message_at: nextMessageAt,
          next_message_index: 0,
        })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') throw new TRPCError({ code: 'CONFLICT', message: 'Contato já está neste funil' })
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }
      return data
    }),

  // ── Move contact to another stage ─────────────────────────────
  moveContact: protectedProcedure
    .input(z.object({
      contactFunnelId: z.string().uuid(),
      newStageId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()

      const { data: stage } = await db
        .from('funnel_stages')
        .select('messages')
        .eq('id', input.newStageId)
        .single()

      const messages = (stage?.messages as any[]) ?? []
      const firstDelay = messages[0]?.delay_minutes ?? 0
      const nextMessageAt = firstDelay > 0
        ? new Date(Date.now() + firstDelay * 60 * 1000).toISOString()
        : messages.length > 0 ? new Date().toISOString() : null

      const { error } = await db
        .from('funnel_contacts')
        .update({
          stage_id: input.newStageId,
          entered_stage_at: new Date().toISOString(),
          next_message_at: nextMessageAt,
          next_message_index: 0,
          status: 'active',
        })
        .eq('id', input.contactFunnelId)
        .eq('organization_id', orgId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // ── Remove contact from funnel ────────────────────────────────
  removeContact: protectedProcedure
    .input(z.object({ contactFunnelId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()
      await db
        .from('funnel_contacts')
        .delete()
        .eq('id', input.contactFunnelId)
        .eq('organization_id', orgId)
      return { success: true }
    }),

  // ── Toggle contact status (pause/resume) ──────────────────────
  getContactFunnels: protectedProcedure
    .input(z.object({ contactId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = getDb()
      const { data, error } = await db
        .from('funnel_contacts')
        .select(`
          id, stage_id, status,
          funnels(id, name, funnel_stages(id, name, color, position))
        `)
        .eq('contact_id', input.contactId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  toggleContactStatus: protectedProcedure
    .input(z.object({ contactFunnelId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()

      const { data: fc } = await db
        .from('funnel_contacts')
        .select('status')
        .eq('id', input.contactFunnelId)
        .eq('organization_id', orgId)
        .single()
      if (!fc) throw new TRPCError({ code: 'NOT_FOUND' })

      const newStatus = fc.status === 'active' ? 'paused' : 'active'
      await db
        .from('funnel_contacts')
        .update({ status: newStatus })
        .eq('id', input.contactFunnelId)

      return { status: newStatus }
    }),
})
