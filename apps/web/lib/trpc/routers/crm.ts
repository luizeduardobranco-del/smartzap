import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'

const VALID_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'] as const

export const crmRouter = router({
  listLeads: protectedProcedure
    .input(z.object({ stage: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { data: member } = await ctx.supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', ctx.user.id)
        .single()
      if (!member) return []

      let query = ctx.supabase
        .from('contacts')
        .select(`
          id, name, phone, channel_type, kanban_stage, tags, created_at,
          conversations(id, last_message_at, status, mode, agents(id, name))
        `)
        .eq('organization_id', member.organization_id)
        .order('created_at', { ascending: false })

      if (input.stage) query = query.eq('kanban_stage', input.stage)

      const { data, error } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  updateStage: protectedProcedure
    .input(z.object({
      contactId: z.string().uuid(),
      stage: z.enum(VALID_STAGES),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('contacts')
        .update({ kanban_stage: input.stage })
        .eq('id', input.contactId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  updateTags: protectedProcedure
    .input(z.object({
      contactId: z.string().uuid(),
      tags: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('contacts')
        .update({ tags: input.tags })
        .eq('id', input.contactId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  updateName: protectedProcedure
    .input(z.object({
      contactId: z.string().uuid(),
      name: z.string().min(1).max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from('contacts')
        .update({ name: input.name })
        .eq('id', input.contactId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
