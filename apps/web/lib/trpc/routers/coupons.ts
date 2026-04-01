import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function isAdmin(ctx: { supabase: any; user: { id: string } }) {
  const { data } = await ctx.supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', ctx.user.id)
    .single()
  return !!data
}

export const couponsRouter = router({
  // ─── Admin: gerenciar cupons ────────────────────────────────────────────────

  list: protectedProcedure.query(async ({ ctx }) => {
    if (!(await isAdmin(ctx))) throw new TRPCError({ code: 'FORBIDDEN' })
    const db = getServiceClient()
    const { data, error } = await db
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data ?? []
  }),

  create: protectedProcedure
    .input(z.object({
      code: z.string().min(3).max(50).toUpperCase(),
      description: z.string().optional(),
      type: z.enum(['percentage', 'fixed']),
      value: z.number().positive(),
      applicableTo: z.enum(['all', 'plan', 'credits']).default('all'),
      maxUses: z.number().int().positive().optional(),
      validUntil: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!(await isAdmin(ctx))) throw new TRPCError({ code: 'FORBIDDEN' })
      const db = getServiceClient()
      const { data, error } = await db
        .from('coupons')
        .insert({
          code: input.code.toUpperCase(),
          description: input.description ?? null,
          type: input.type,
          value: input.value,
          applicable_to: input.applicableTo,
          max_uses: input.maxUses ?? null,
          valid_until: input.validUntil ?? null,
          created_by: ctx.user.id,
        })
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  toggle: protectedProcedure
    .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!(await isAdmin(ctx))) throw new TRPCError({ code: 'FORBIDDEN' })
      const db = getServiceClient()
      const { error } = await db.from('coupons').update({ active: input.active }).eq('id', input.id)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!(await isAdmin(ctx))) throw new TRPCError({ code: 'FORBIDDEN' })
      const db = getServiceClient()
      const { error } = await db.from('coupons').delete().eq('id', input.id)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // ─── User: validar e aplicar cupom ─────────────────────────────────────────

  validate: protectedProcedure
    .input(z.object({
      code: z.string(),
      applicableTo: z.enum(['plan', 'credits', 'all']).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = getServiceClient()
      const { data: coupon } = await db
        .from('coupons')
        .select('*')
        .eq('code', input.code.toUpperCase())
        .eq('active', true)
        .single()

      if (!coupon) return { valid: false, reason: 'Cupom não encontrado ou inativo' }

      if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
        return { valid: false, reason: 'Cupom expirado' }
      }

      if (coupon.max_uses !== null && coupon.uses_count >= coupon.max_uses) {
        return { valid: false, reason: 'Cupom esgotado' }
      }

      if (input.applicableTo && coupon.applicable_to !== 'all' && coupon.applicable_to !== input.applicableTo) {
        return { valid: false, reason: `Cupom válido apenas para ${coupon.applicable_to === 'plan' ? 'planos' : 'créditos'}` }
      }

      return {
        valid: true,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          description: coupon.description,
        },
      }
    }),

  redeemCoupon: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getServiceClient()
      const { error } = await db.rpc('increment_coupon_uses', { coupon_id: input.id }).throwOnError()
      if (error) {
        // Fallback: manual increment
        await db.from('coupons').update({ uses_count: db.from('coupons').select('uses_count') }).eq('id', input.id)
      }
      return { success: true }
    }),
})
