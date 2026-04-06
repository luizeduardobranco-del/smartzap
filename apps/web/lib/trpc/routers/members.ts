import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { buildInviteEmail } from '@/lib/email/invite-template'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY!)
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function requireOwnerOrAdmin(ctx: any) {
  const { data: member } = await ctx.supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', ctx.user.id)
    .single()
  if (!member) throw new TRPCError({ code: 'FORBIDDEN' })
  if (member.role !== 'owner' && member.role !== 'admin')
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas owner ou admin pode gerenciar usuários' })
  return member
}

export const membersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { data: member } = await ctx.supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', ctx.user.id)
      .single()
    if (!member) throw new TRPCError({ code: 'FORBIDDEN' })

    const service = getServiceClient()
    const { data, error } = await service.rpc('get_org_members_with_email', {
      p_org_id: member.organization_id,
    })
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

    const { data: invites } = await ctx.supabase
      .from('organization_invites')
      .select('id, email, role, created_at, expires_at, accepted_at')
      .eq('organization_id', member.organization_id)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())

    return {
      members: (data ?? []).map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        email: m.email,
        name: m.raw_user_meta_data?.full_name ?? m.raw_user_meta_data?.name ?? null,
        avatar_url: m.raw_user_meta_data?.avatar_url ?? null,
        isCurrentUser: m.user_id === ctx.user.id,
      })),
      pendingInvites: invites ?? [],
      currentUserRole: (data ?? []).find((m: any) => m.user_id === ctx.user.id)?.role ?? 'member',
    }
  }),

  invite: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      role: z.enum(['member', 'admin']),
    }))
    .mutation(async ({ ctx, input }) => {
      const member = await requireOwnerOrAdmin(ctx)

      // Check plan limit
      const { data: planOrg } = await ctx.supabase
        .from('organizations')
        .select('plan_id, plans(limits)')
        .eq('id', member.organization_id)
        .single()

      const limits = (planOrg?.plans as any)?.limits ?? {}
      const maxMembers: number = limits.maxTeamMembers ?? 1

      if (maxMembers !== -1) {
        const { count } = await ctx.supabase
          .from('organization_members')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', member.organization_id)

        const { count: pendingCount } = await ctx.supabase
          .from('organization_invites')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', member.organization_id)
          .is('accepted_at', null)
          .gt('expires_at', new Date().toISOString())

        if ((count ?? 0) + (pendingCount ?? 0) >= maxMembers) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: `Seu plano permite no máximo ${maxMembers} usuário(s). Faça upgrade para adicionar mais.`,
          })
        }
      }

      // Upsert invite (renew if expired or re-inviting)
      const { data: existing } = await ctx.supabase
        .from('organization_invites')
        .select('id, token')
        .eq('organization_id', member.organization_id)
        .eq('email', input.email)
        .single()

      let inviteToken: string

      if (existing) {
        // Regenerate token on re-invite
        const newToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
        await ctx.supabase
          .from('organization_invites')
          .update({
            role: input.role,
            invited_by: ctx.user.id,
            accepted_at: null,
            token: newToken,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq('id', existing.id)
        inviteToken = newToken
      } else {
        const newToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
        const { error } = await ctx.supabase
          .from('organization_invites')
          .insert({
            organization_id: member.organization_id,
            email: input.email,
            role: input.role,
            invited_by: ctx.user.id,
            token: newToken,
          })
        if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
        inviteToken = newToken
      }

      // Fetch org and inviter name for email
      const { data: emailOrg } = await ctx.supabase
        .from('organizations')
        .select('name')
        .eq('id', member.organization_id)
        .single()

      const service = getServiceClient()
      const { data: inviterAuth } = await service.auth.admin.getUserById(ctx.user.id)
      const inviterName = inviterAuth?.user?.user_metadata?.full_name
        ?? inviterAuth?.user?.user_metadata?.name
        ?? inviterAuth?.user?.email
        ?? undefined

      // Send branded email via Resend
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://atendente.whiteerp.com'
      const acceptUrl = `${appUrl}/invite/accept?token=${inviteToken}`
      const { subject, html } = buildInviteEmail({
        orgName: emailOrg?.name ?? 'sua organização',
        inviterName,
        acceptUrl,
      })

      const resend = getResend()
      const { error: emailError } = await resend.emails.send({
        from: 'WHITE ZAP <contato@whiteerp.com>',
        to: input.email,
        subject,
        html,
      })

      if (emailError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Convite salvo, mas falha ao enviar email: ${emailError.message}`,
        })
      }

      return { success: true }
    }),

  updateRole: protectedProcedure
    .input(z.object({
      memberId: z.string().uuid(),
      role: z.enum(['member', 'admin']),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentMember = await requireOwnerOrAdmin(ctx)

      // Cannot change owner's role
      const { data: target } = await ctx.supabase
        .from('organization_members')
        .select('role, user_id')
        .eq('id', input.memberId)
        .eq('organization_id', currentMember.organization_id)
        .single()

      if (!target) throw new TRPCError({ code: 'NOT_FOUND' })
      if (target.role === 'owner') throw new TRPCError({ code: 'FORBIDDEN', message: 'Não é possível alterar o role do owner' })
      if (target.user_id === ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não pode alterar seu próprio role' })

      const { error } = await ctx.supabase
        .from('organization_members')
        .update({ role: input.role })
        .eq('id', input.memberId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  remove: protectedProcedure
    .input(z.object({ memberId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const currentMember = await requireOwnerOrAdmin(ctx)

      const { data: target } = await ctx.supabase
        .from('organization_members')
        .select('role, user_id')
        .eq('id', input.memberId)
        .eq('organization_id', currentMember.organization_id)
        .single()

      if (!target) throw new TRPCError({ code: 'NOT_FOUND' })
      if (target.role === 'owner') throw new TRPCError({ code: 'FORBIDDEN', message: 'Não é possível remover o owner' })
      if (target.user_id === ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não pode remover a si mesmo' })

      const { error } = await ctx.supabase
        .from('organization_members')
        .delete()
        .eq('id', input.memberId)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  cancelInvite: protectedProcedure
    .input(z.object({ inviteId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const member = await requireOwnerOrAdmin(ctx)

      const { error } = await ctx.supabase
        .from('organization_invites')
        .delete()
        .eq('id', input.inviteId)
        .eq('organization_id', member.organization_id)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
