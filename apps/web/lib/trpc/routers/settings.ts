import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'

export const settingsRouter = router({
  getOrg: protectedProcedure.query(async ({ ctx }) => {
    const { data: member } = await ctx.supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', ctx.user.id)
      .single()
    if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Organização não encontrada' })

    const { data: org } = await ctx.supabase
      .from('organizations')
      .select('id, name, slug, subscription_status, trial_ends_at, credits_balance, settings, plan_id, plans(name, slug)')
      .eq('id', member.organization_id)
      .single()
    if (!org) throw new TRPCError({ code: 'NOT_FOUND' })

    return { ...org, role: member.role }
  }),

  updateOrg: protectedProcedure
    .input(z.object({ name: z.string().min(2).max(255) }))
    .mutation(async ({ ctx, input }) => {
      const { data: member } = await ctx.supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', ctx.user.id)
        .single()
      if (!member || member.role !== 'owner')
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o dono pode editar' })

      const { error } = await ctx.supabase
        .from('organizations')
        .update({ name: input.name, updated_at: new Date().toISOString() })
        .eq('id', member.organization_id)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  updateCrmStages: protectedProcedure
    .input(z.object({
      stages: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: member } = await ctx.supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', ctx.user.id)
        .single()
      if (!member) throw new TRPCError({ code: 'FORBIDDEN' })

      const { data: org } = await ctx.supabase
        .from('organizations')
        .select('settings')
        .eq('id', member.organization_id)
        .single()

      const current = (org?.settings as Record<string, unknown>) ?? {}
      const { error } = await ctx.supabase
        .from('organizations')
        .update({
          settings: { ...current, crmStages: input.stages },
          updated_at: new Date().toISOString(),
        })
        .eq('id', member.organization_id)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  updateOrgFiscal: protectedProcedure
    .input(z.object({
      cpfCnpj: z.string().min(11).max(18),
      mobilePhone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: member } = await ctx.supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', ctx.user.id)
        .single()
      if (!member || member.role !== 'owner')
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas o dono pode editar' })

      const { data: org } = await ctx.supabase
        .from('organizations')
        .select('settings')
        .eq('id', member.organization_id)
        .single()

      const current = (org?.settings as Record<string, unknown>) ?? {}
      const { error } = await ctx.supabase
        .from('organizations')
        .update({
          settings: { ...current, fiscal: { cpfCnpj: input.cpfCnpj, mobilePhone: input.mobilePhone ?? '' } },
          updated_at: new Date().toISOString(),
        })
        .eq('id', member.organization_id)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  updateAIKeys: protectedProcedure
    .input(z.object({
      openaiApiKey: z.string().optional(),
      anthropicApiKey: z.string().optional(),
      groqApiKey: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: member } = await ctx.supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', ctx.user.id)
        .single()
      if (!member || member.role !== 'owner')
        throw new TRPCError({ code: 'FORBIDDEN' })

      // Read current settings to merge
      const { data: org } = await ctx.supabase
        .from('organizations')
        .select('settings')
        .eq('id', member.organization_id)
        .single()

      const current = (org?.settings as Record<string, unknown>) ?? {}
      const aiKeys: Record<string, string> = {}
      if (input.openaiApiKey !== undefined) aiKeys.openaiApiKey = input.openaiApiKey
      if (input.anthropicApiKey !== undefined) aiKeys.anthropicApiKey = input.anthropicApiKey
      if (input.groqApiKey !== undefined) aiKeys.groqApiKey = input.groqApiKey

      const { error } = await ctx.supabase
        .from('organizations')
        .update({
          settings: { ...current, aiKeys: { ...(current.aiKeys as object ?? {}), ...aiKeys } },
          updated_at: new Date().toISOString(),
        })
        .eq('id', member.organization_id)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
