import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'

const agentPersonalitySchema = z.object({
  tone: z.enum(['formal', 'casual', 'friendly', 'professional']).default('friendly'),
  language: z.string().default('pt-BR'),
  systemPrompt: z.string().default(''),
  instructions: z.string().default(''),
  greeting: z.string().default(''),
  farewell: z.string().default(''),
})

const agentAiConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'groq']).default('openai'),
  model: z.string().default('gpt-4o-mini'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(100).max(4000).default(1000),
})

const agentBehaviorConfigSchema = z.object({
  humanHandoff: z.boolean().default(false),
  handoffKeywords: z.array(z.string()).default([]),
  businessHours: z.boolean().default(false),
  offHoursMessage: z.string().default(''),
  maxResponseTime: z.number().default(30),
})

export const agentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    // Get user's organization
    const { data: member } = await ctx.supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', ctx.user.id)
      .single()

    if (!member) return []

    const { data, error } = await ctx.supabase
      .from('agents')
      .select('*, channels(type, status)')
      .eq('organization_id', member.organization_id)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('agents')
        .select('*')
        .eq('id', input.id)
        .single()

      if (error || !data) throw new TRPCError({ code: 'NOT_FOUND' })
      return data
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      personality: agentPersonalitySchema.optional(),
      aiConfig: agentAiConfigSchema.optional(),
      behaviorConfig: agentBehaviorConfigSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: member } = await ctx.supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', ctx.user.id)
        .single()

      if (!member) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem organização' })

      const baseSlug = input.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
      const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`

      const { data, error } = await ctx.supabase
        .from('agents')
        .insert({
          name: input.name,
          slug,
          description: input.description ?? null,
          organization_id: member.organization_id,
          created_by: ctx.user.id,
          status: 'draft',
          personality: input.personality ?? {},
          ai_config: input.aiConfig ?? {},
          behavior_config: input.behaviorConfig ?? {},
        })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      personality: agentPersonalitySchema.optional(),
      aiConfig: agentAiConfigSchema.optional(),
      behaviorConfig: agentBehaviorConfigSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, aiConfig, behaviorConfig, ...rest } = input
      const { data, error } = await ctx.supabase
        .from('agents')
        .update({
          ...rest,
          ...(aiConfig ? { ai_config: aiConfig } : {}),
          ...(behaviorConfig ? { behavior_config: behaviorConfig } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  toggleStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid(), status: z.enum(['active', 'paused', 'draft', 'archived']) }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('agents')
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Archive instead of hard delete — avoids FK constraint violations
      // (channels, conversations, knowledge sources all reference agent_id)
      const { error } = await ctx.supabase
        .from('agents')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', input.id)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
