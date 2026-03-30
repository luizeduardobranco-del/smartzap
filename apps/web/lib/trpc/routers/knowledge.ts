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

export const knowledgeRouter = router({
  list: protectedProcedure
    .input(z.object({ agentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getServiceClient()

      const { data, error } = await db
        .from('agent_knowledge_sources')
        .select('*')
        .eq('agent_id', input.agentId)
        .eq('organization_id', orgId)
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
      const orgId = await getOrgId(ctx)
      console.log('[knowledge.addText] orgId:', orgId, 'agentId:', input.agentId)
      const db = getServiceClient()

      const { data, error } = await db
        .from('agent_knowledge_sources')
        .insert({
          agent_id: input.agentId,
          organization_id: orgId,
          type: 'text',
          name: input.name,
          status: 'ready',
          metadata: { content: input.content },
        })
        .select()
        .single()

      console.log('[knowledge.addText] result:', data?.id ?? null, 'error:', error?.message ?? null)
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
      const orgId = await getOrgId(ctx)
      const db = getServiceClient()

      const { data, error } = await db
        .from('agent_knowledge_sources')
        .insert({
          agent_id: input.agentId,
          organization_id: orgId,
          type: 'faq',
          name: input.question.slice(0, 100),
          status: 'ready',
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
      const orgId = await getOrgId(ctx)
      console.log('[knowledge.addURL] orgId:', orgId, 'agentId:', input.agentId, 'url:', input.url)
      const db = getServiceClient()
      const name = new URL(input.url).hostname

      const { data, error } = await db
        .from('agent_knowledge_sources')
        .insert({
          agent_id: input.agentId,
          organization_id: orgId,
          type: 'url',
          name,
          status: 'pending',
          metadata: { url: input.url },
        })
        .select()
        .single()

      console.log('[knowledge.addURL] result:', data?.id ?? null, 'error:', error?.message ?? null)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  addImage: protectedProcedure
    .input(z.object({
      agentId: z.string().uuid(),
      name: z.string().min(1, 'Nome obrigatório'),
      imageUrl: z.string().url('URL inválida'),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getServiceClient()

      const { data, error } = await db
        .from('agent_knowledge_sources')
        .insert({
          agent_id: input.agentId,
          organization_id: orgId,
          type: 'image',
          name: input.name,
          status: 'pending',
          metadata: { imageUrl: input.imageUrl, description: input.description ?? '' },
        })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      metadata: z.record(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getServiceClient()

      const { data, error } = await db
        .from('agent_knowledge_sources')
        .update({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.metadata !== undefined && { metadata: input.metadata }),
          status: 'ready',
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
        .eq('organization_id', orgId)
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getServiceClient()

      await db.from('knowledge_chunks').delete().eq('source_id', input.id)

      const { error } = await db
        .from('agent_knowledge_sources')
        .delete()
        .eq('id', input.id)
        .eq('organization_id', orgId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
