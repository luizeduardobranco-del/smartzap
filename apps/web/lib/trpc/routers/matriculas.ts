import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'

/**
 * Fichas de matrícula recebidas pelo formulário público.
 *
 * O agente do WhatsApp manda o link, o responsável preenche, e o atendimento
 * trabalha a lista daqui — sem ninguém transcrever conversa à mão.
 */

const STATUS = ['nova', 'em_contato', 'fechada', 'perdida'] as const

async function getOrgId(ctx: { supabase: any; user: { id: string } }) {
  const { data: member } = await ctx.supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', ctx.user.id)
    .single()
  if (!member) throw new TRPCError({ code: 'FORBIDDEN' })
  return member.organization_id as string
}

export const matriculasRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx)

    // O PostgREST corta a resposta em 1000 linhas sem avisar. Numa escola
    // inteira isso passa fácil, então pagina até acabar de verdade.
    const PAGINA = 500
    const todas: any[] = []

    for (let inicio = 0; ; inicio += PAGINA) {
      const { data, error } = await ctx.supabase
        .from('matriculas')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .range(inicio, inicio + PAGINA - 1)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      todas.push(...(data ?? []))
      if (!data || data.length < PAGINA) break
    }

    return todas
  }),

  updateStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid(), status: z.enum(STATUS) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)

      const { error } = await ctx.supabase
        .from('matriculas')
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .eq('organization_id', orgId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { ok: true }
    }),

  /** Ficha digitada pelo atendente, quando o pai prefere passar por telefone. */
  create: protectedProcedure
    .input(
      z.object({
        responsavel_nome: z.string().trim().min(3).max(120),
        responsavel_telefone: z.string().trim().min(8).max(30),
        aluno_nome: z.string().trim().min(3).max(120),
        periodo: z.enum(['manha', 'tarde']),
        endereco: z.string().trim().min(5).max(300),
        colegio: z.string().trim().min(2).max(160),
        bairro: z.string().trim().max(80).optional(),
        serie: z.string().trim().max(40).optional(),
        observacao: z.string().trim().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)

      const { data, error } = await ctx.supabase
        .from('matriculas')
        .insert({ organization_id: orgId, ...input, origem: 'atendente' })
        .select('id')
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)

      const { error } = await ctx.supabase
        .from('matriculas')
        .delete()
        .eq('id', input.id)
        .eq('organization_id', orgId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { ok: true }
    }),
})
