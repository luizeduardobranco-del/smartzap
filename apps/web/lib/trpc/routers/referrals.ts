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

async function getOrgId(ctx: { supabase: any; user: { id: string } }) {
  const { data: member } = await ctx.supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', ctx.user.id)
    .single()
  if (!member) throw new TRPCError({ code: 'FORBIDDEN' })
  return member.organization_id as string
}

async function requireAffiliatesModule(ctx: { supabase: any; user: { id: string } }) {
  const orgId = await getOrgId(ctx)
  const { data: org } = await ctx.supabase
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .single()
  const settings = org?.settings as { enabled_modules?: string[] } | null
  if (!settings?.enabled_modules?.includes('affiliates')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Módulo de afiliados não habilitado para esta organização.' })
  }
  return orgId
}

function generateCode(name: string): string {
  const base = name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${base}${suffix}`
}

export const referralsRouter = router({
  // ─── Obter ou criar código de indicação ─────────────────────────────────────

  getMyCode: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await requireAffiliatesModule(ctx)
    const db = getServiceClient()

    // Check if code exists
    const { data: existing } = await db
      .from('referral_codes')
      .select('*')
      .eq('user_id', ctx.user.id)
      .single()

    if (existing) return existing

    // Get org name to generate a nice code
    const { data: org } = await db.from('organizations').select('name').eq('id', orgId).single()
    const code = generateCode(org?.name ?? ctx.user.id.slice(0, 6))

    const { data, error } = await db
      .from('referral_codes')
      .insert({
        user_id: ctx.user.id,
        organization_id: orgId,
        code,
        commission_rate: 20,
      })
      .select()
      .single()

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data
  }),

  // ─── Estatísticas de indicações ─────────────────────────────────────────────

  getStats: protectedProcedure.query(async ({ ctx }) => {
    await requireAffiliatesModule(ctx)
    const db = getServiceClient()

    const { data: referralCode } = await db
      .from('referral_codes')
      .select('*')
      .eq('user_id', ctx.user.id)
      .single()

    if (!referralCode) return { code: null, referrals: [], totalEarned: 0, totalReferrals: 0 }

    const { data: referrals } = await db
      .from('referrals')
      .select('*')
      .eq('referrer_id', ctx.user.id)
      .order('created_at', { ascending: false })

    return {
      code: referralCode,
      referrals: referrals ?? [],
      totalEarned: referralCode.total_earned ?? 0,
      totalReferrals: referralCode.total_referrals ?? 0,
    }
  }),

  // ─── Registrar indicação (chamado no signup) ─────────────────────────────────

  registerReferral: protectedProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getServiceClient()

      const { data: refCode } = await db
        .from('referral_codes')
        .select('*, organizations(name)')
        .eq('code', input.code.toUpperCase())
        .single()

      if (!refCode) return { success: false, reason: 'Código inválido' }
      if (refCode.user_id === ctx.user.id) return { success: false, reason: 'Você não pode se indicar' }

      // Check not already referred
      const { data: existing } = await db
        .from('referrals')
        .select('id')
        .eq('referred_user_id', ctx.user.id)
        .single()

      if (existing) return { success: false, reason: 'Você já foi indicado por alguém' }

      await db.from('referrals').insert({
        referrer_id: refCode.user_id,
        referrer_org_id: refCode.organization_id,
        referred_user_id: ctx.user.id,
        referred_org_id: orgId,
        code: refCode.code,
        status: 'pending',
      })

      // Increment referral count
      await db
        .from('referral_codes')
        .update({ total_referrals: (refCode.total_referrals ?? 0) + 1 })
        .eq('id', refCode.id)

      return { success: true }
    }),
})
