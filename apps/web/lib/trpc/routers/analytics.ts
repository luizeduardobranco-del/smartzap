import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'

async function getOrgId(ctx: { supabase: any; user: { id: string } }) {
  const { data: member } = await ctx.supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', ctx.user.id)
    .single()
  if (!member) throw new TRPCError({ code: 'FORBIDDEN' })
  return member.organization_id as string
}

export const analyticsRouter = router({
  getOverview: protectedProcedure
    .input(z.object({ days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const since = new Date()
      since.setDate(since.getDate() - input.days)
      const sinceISO = since.toISOString()

      // Parallel queries
      const [
        convsRes,
        msgsRes,
        contactsRes,
        automationsRes,
        crmRes,
        agentsRes,
        allConvsRes,
      ] = await Promise.all([
        // Conversations in period
        ctx.supabase
          .from('conversations')
          .select('id, mode, status, created_at, agent_id')
          .eq('organization_id', orgId)
          .gte('created_at', sinceISO),
        // Messages in period
        ctx.supabase
          .from('messages')
          .select('id, sender_type, created_at, conversation_id')
          .eq('organization_id', orgId)
          .gte('created_at', sinceISO),
        // New contacts in period
        ctx.supabase
          .from('contacts')
          .select('id, created_at')
          .eq('organization_id', orgId)
          .gte('created_at', sinceISO),
        // Automations executions
        ctx.supabase
          .from('automations')
          .select('id, name, executions_count, trigger_type, action_type')
          .eq('organization_id', orgId)
          .order('executions_count', { ascending: false })
          .limit(5),
        // CRM stages
        ctx.supabase
          .from('contacts')
          .select('kanban_stage')
          .eq('organization_id', orgId),
        // Agents
        ctx.supabase
          .from('agents')
          .select('id, name')
          .eq('organization_id', orgId)
          .neq('status', 'archived'),
        // All conversations for agent breakdown
        ctx.supabase
          .from('conversations')
          .select('agent_id, mode')
          .eq('organization_id', orgId)
          .gte('created_at', sinceISO),
      ])

      const convs: any[] = convsRes.data ?? []
      const msgs: any[] = msgsRes.data ?? []
      const contacts: any[] = contactsRes.data ?? []
      const automations: any[] = automationsRes.data ?? []
      const crmContacts: any[] = crmRes.data ?? []
      const agents: any[] = agentsRes.data ?? []

      // KPIs
      const totalConvs = convs.length
      const totalMsgs = msgs.length
      const newContacts = contacts.length
      const aiConvs = convs.filter((c) => c.mode === 'ai').length
      const humanConvs = convs.filter((c) => c.mode === 'human').length
      const aiRate = totalConvs > 0 ? Math.round((aiConvs / totalConvs) * 100) : 0
      const totalAutomationFires = automations.reduce((s: number, a: any) => s + (a.executions_count ?? 0), 0)
      const resolvedConvs = convs.filter((c) => c.status === 'resolved').length

      // Conversations per day (last `days` days)
      const dayMap: Record<string, number> = {}
      for (let i = input.days - 1; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        dayMap[d.toISOString().slice(0, 10)] = 0
      }
      convs.forEach((c) => {
        const day = c.created_at?.slice(0, 10)
        if (day && dayMap[day] !== undefined) dayMap[day]++
      })
      const convsByDay = Object.entries(dayMap).map(([date, count]) => ({ date, count }))

      // Messages per day
      const msgDayMap: Record<string, number> = {}
      Object.keys(dayMap).forEach((d) => { msgDayMap[d] = 0 })
      msgs.forEach((m) => {
        const day = m.created_at?.slice(0, 10)
        if (day && msgDayMap[day] !== undefined) msgDayMap[day]++
      })
      const msgsByDay = Object.entries(msgDayMap).map(([date, count]) => ({ date, count }))

      // CRM funnel
      const stages = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost']
      const stageLabels: Record<string, string> = {
        new: 'Novo', contacted: 'Contactado', qualified: 'Qualificado',
        proposal: 'Proposta', won: 'Ganho', lost: 'Perdido',
      }
      const crmFunnel = stages.map((s) => ({
        stage: s,
        label: stageLabels[s],
        count: crmContacts.filter((c) => (c.kanban_stage ?? 'new') === s).length,
      }))

      // Agent breakdown
      const agentMap: Record<string, { name: string; convs: number; aiConvs: number }> = {}
      agents.forEach((a) => { agentMap[a.id] = { name: a.name, convs: 0, aiConvs: 0 } })
      convs.forEach((c) => {
        if (c.agent_id && agentMap[c.agent_id]) {
          agentMap[c.agent_id].convs++
          if (c.mode === 'ai') agentMap[c.agent_id].aiConvs++
        }
      })
      const agentBreakdown = Object.values(agentMap)
        .sort((a, b) => b.convs - a.convs)
        .slice(0, 5)

      return {
        kpis: {
          totalConvs,
          totalMsgs,
          newContacts,
          aiRate,
          aiConvs,
          humanConvs,
          resolvedConvs,
          totalAutomationFires,
        },
        convsByDay,
        msgsByDay,
        crmFunnel,
        agentBreakdown,
        topAutomations: automations,
      }
    }),
})
