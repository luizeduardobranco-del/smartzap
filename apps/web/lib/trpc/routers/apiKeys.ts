import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'
import { gerarChave, gerarCodigoConexao, hashDaChave } from '@/lib/api-key-auth'

/**
 * Chaves de API da organização — é assim que o cliente liga um sistema dele
 * (o WHITE ERP, por exemplo) ao WHITE CHAT sem depender de nós.
 *
 * O texto puro da chave aparece UMA vez, na resposta do `create`. Depois disso
 * só existe o hash: nem nós conseguimos mostrar de novo, e é esse o ponto.
 */

async function getOrgId(ctx: { supabase: any; user: { id: string } }) {
  const { data: member } = await ctx.supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', ctx.user.id)
    .single()
  if (!member) throw new TRPCError({ code: 'FORBIDDEN' })
  return member.organization_id as string
}

export const apiKeysRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx)
    const { data, error } = await ctx.supabase
      .from('api_keys')
      .select('id, name, key_prefix, scopes, last_used_at, revoked_at, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(2).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { chave, prefixo, hash } = gerarChave()

      const { data, error } = await ctx.supabase
        .from('api_keys')
        .insert({
          organization_id: orgId,
          name: input.name.trim(),
          key_prefix: prefixo,
          key_hash: hash,
          created_by: ctx.user.id,
        })
        .select('id, name, key_prefix, created_at')
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      // Única vez que o texto puro sai daqui.
      return { ...data, chave }
    }),

  /**
   * Código de conexão para o WHITE FLEET: curto, de uso único, vale 24 h.
   * O sistema de lá troca o código por uma chave desta organização.
   */
  criarCodigoConexao: protectedProcedure.mutation(async ({ ctx }) => {
    const orgId = await getOrgId(ctx)
    const codigo = gerarCodigoConexao()
    const { data, error } = await ctx.supabase
      .from('connection_codes')
      .insert({
        organization_id: orgId,
        code_hash: hashDaChave(codigo),
        created_by: ctx.user.id,
      })
      .select('expires_at')
      .single()

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return { codigo, expiraEm: data.expires_at as string }
  }),

  /** Conexões feitas por código (para o cliente ver quem está ligado à conta). */
  conexoes: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx)
    const { data } = await ctx.supabase
      .from('connection_codes')
      .select('id, sistema, used_at, used_by, api_key_id, expires_at, created_at')
      .eq('organization_id', orgId)
      .not('used_at', 'is', null)
      .order('used_at', { ascending: false })
      .limit(50)
    return data ?? []
  }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { error } = await ctx.supabase
        .from('api_keys')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', input.id)
        .eq('organization_id', orgId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
