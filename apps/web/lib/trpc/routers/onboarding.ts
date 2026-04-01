import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'

export const onboardingRouter = router({
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const { data: member } = await ctx.supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', ctx.user.id)
      .single()

    if (!member) throw new TRPCError({ code: 'FORBIDDEN' })
    const org = member.organization_id

    const [
      { count: agentsCount },
      { count: channelsCount },
      { count: knowledgeCount },
      { count: contactsCount },
      { count: funnelsCount },
      { count: automationsCount },
      { count: campaignsCount },
    ] = await Promise.all([
      ctx.supabase.from('agents').select('*', { count: 'exact', head: true }).eq('organization_id', org).neq('status', 'archived'),
      ctx.supabase.from('channels').select('*', { count: 'exact', head: true }).eq('organization_id', org).eq('status', 'connected'),
      ctx.supabase.from('agent_knowledge_sources').select('*', { count: 'exact', head: true }).eq('organization_id', org),
      ctx.supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('organization_id', org),
      ctx.supabase.from('funnels').select('*', { count: 'exact', head: true }).eq('organization_id', org),
      ctx.supabase.from('automations').select('*', { count: 'exact', head: true }).eq('organization_id', org),
      ctx.supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('organization_id', org),
    ])

    // Fetch first agent id for deep-link to test chat
    const { data: firstAgent } = await ctx.supabase
      .from('agents')
      .select('id')
      .eq('organization_id', org)
      .neq('status', 'archived')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    return {
      agentCreated: (agentsCount ?? 0) > 0,
      whatsappConnected: (channelsCount ?? 0) > 0,
      knowledgeAdded: (knowledgeCount ?? 0) > 0,
      contactAdded: (contactsCount ?? 0) > 0,
      funnelCreated: (funnelsCount ?? 0) > 0,
      automationCreated: (automationsCount ?? 0) > 0,
      campaignCreated: (campaignsCount ?? 0) > 0,
      firstAgentId: firstAgent?.id ?? null,
    }
  }),
})
