import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'

export const knowledgeRouter = router({
  list: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data: member } = await ctx.supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', ctx.user.id)
        .single()
      if (!member) throw new TRPCError({ code: 'FORBIDDEN' })

      const { data, error } = await ctx.supabase
        .from('agent_knowledge_sources')
        .select('*')
        .eq('agent_id', input.agentId)
        .eq('organization_id', member.organization_id)
        .order('created_at', { ascending: false })

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  addText: protectedProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      name: z.string().min(1),
      content: z.string().min(10, 'Conteúdo muito curto'),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: member } = await ctx.supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', ctx.user.id)
        .single()
      if (!member) throw new TRPCError({ code: 'FORBIDDEN' })

      const { data, error } = await ctx.supabase
        .from('agent_knowledge_sources')
        .insert({
          agent_id: input.agentId,
          organization_id: member.organization_id,
          type: 'text',
          name: input.name,
          status: 'pending',
          metadata: { content: input.content },
        })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  addFAQ: protectedProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      question: z.string().min(3),
      answer: z.string().min(3),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: member } = await ctx.supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', ctx.user.id)
        .single()
      if (!member) throw new TRPCError({ code: 'FORBIDDEN' })

      const { data, error } = await ctx.supabase
        .from('agent_knowledge_sources')
        .insert({
          agent_id: input.agentId,
          organization_id: member.organization_id,
          type: 'faq',
          name: input.question.slice(0, 100),
          status: 'pending',
          metadata: { question: input.question, answer: input.answer },
        })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  addURL: protectedProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      url: z.string().url('URL inválida'),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data: member } = await ctx.supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', ctx.user.id)
        .single()
      if (!member) throw new TRPCError({ code: 'FORBIDDEN' })

      const name = new URL(input.url).hostname

      const { data, error } = await ctx.supabase
        .from('agent_knowledge_sources')
        .insert({
          agent_id: input.agentId,
          organization_id: member.organization_id,
          type: 'url',
          name,
          status: 'pending',
          metadata: { url: input.url },
        })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Delete chunks first
      await ctx.supabase
        .from('knowledge_chunks')
        .delete()
        .eq('source_id', input.id)

      const { error } = await ctx.supabase
        .from('agent_knowledge_sources')
        .delete()
        .eq('id', input.id)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
