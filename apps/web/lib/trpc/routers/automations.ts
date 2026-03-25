import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'

const triggerConfigSchema = z.object({
  keywords: z.array(z.string()).optional(),
  matchAll: z.boolean().optional(),
  startHour: z.number().min(0).max(23).optional(),
  endHour: z.number().min(0).max(23).optional(),
})

const actionConfigSchema = z.object({
  message: z.string().optional(),
  tag: z.string().optional(),
  stage: z.string().optional(),
})

const automationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  agentId: z.string().uuid().nullable(),
  triggerType: z.enum(['keyword', 'first_message', 'off_hours']),
  triggerConfig: triggerConfigSchema,
  actionType: z.enum(['send_message', 'add_tag', 'change_stage', 'handoff']),
  actionConfig: actionConfigSchema,
})

async function getOrgId(ctx: { supabase: any; user: { id: string } }) {
  const { data: member } = await ctx.supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', ctx.user.id)
    .single()
  if (!member) throw new TRPCError({ code: 'FORBIDDEN' })
  return member.organization_id as string
}

export const automationsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx)
    const { data, error } = await ctx.supabase
      .from('automations')
      .select('*, agents(name)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  create: protectedProcedure
    .input(automationSchema)
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { data, error } = await ctx.supabase
        .from('automations')
        .insert({
          organization_id: orgId,
          agent_id: input.agentId,
          name: input.name,
          description: input.description ?? '',
          trigger_type: input.triggerType,
          trigger_config: input.triggerConfig,
          action_type: input.actionType,
          action_config: input.actionConfig,
          is_active: true,
        })
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  update: protectedProcedure
    .input(automationSchema.extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { error } = await ctx.supabase
        .from('automations')
        .update({
          agent_id: input.agentId,
          name: input.name,
          description: input.description ?? '',
          trigger_type: input.triggerType,
          trigger_config: input.triggerConfig,
          action_type: input.actionType,
          action_config: input.actionConfig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
        .eq('organization_id', orgId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  toggle: protectedProcedure
    .input(z.object({ id: z.string().uuid(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { error } = await ctx.supabase
        .from('automations')
        .update({ is_active: input.isActive, updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .eq('organization_id', orgId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { error } = await ctx.supabase
        .from('automations')
        .delete()
        .eq('id', input.id)
        .eq('organization_id', orgId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
