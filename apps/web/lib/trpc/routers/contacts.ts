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

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (!digits.startsWith('55') && digits.length <= 11) digits = '55' + digits
  return digits
}

export const contactsRouter = router({
  // ─── Lists ────────────────────────────────────────────────────────────────

  getLists: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx)
    const { data, error } = await ctx.supabase
      .from('contact_lists')
      .select('*, contact_list_members(count)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true })
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return (data ?? []).map((l: any) => ({
      ...l,
      member_count: l.contact_list_members?.[0]?.count ?? 0,
    }))
  }),

  createList: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      color: z.string().default('#6366f1'),
      list_type: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { data, error } = await ctx.supabase
        .from('contact_lists')
        .insert({
          organization_id: orgId,
          name: input.name,
          description: input.description ?? '',
          color: input.color,
          list_type: input.list_type ?? '',
        })
        .select()
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  getAllTags: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx)
    const { data, error } = await ctx.supabase
      .from('contacts')
      .select('tags')
      .eq('organization_id', orgId)
      .not('tags', 'eq', '{}')
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    const allTags = [...new Set((data ?? []).flatMap((c: any) => c.tags ?? []))].sort()
    return allTags as string[]
  }),

  deleteList: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      await ctx.supabase.from('contact_list_members').delete().eq('list_id', input.id)
      const { error } = await ctx.supabase.from('contact_lists').delete().eq('id', input.id).eq('organization_id', orgId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // ─── Contacts ─────────────────────────────────────────────────────────────

  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      tag: z.string().optional(),
      listId: z.string().uuid().optional(),
      limit: z.number().default(100),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)

      // If filtering by list, get contact IDs from members table first
      let contactIdFilter: string[] | null = null
      if (input.listId) {
        const { data: members } = await ctx.supabase
          .from('contact_list_members')
          .select('contact_id')
          .eq('list_id', input.listId)
        contactIdFilter = (members ?? []).map((m: any) => m.contact_id)
        if (contactIdFilter.length === 0) return { contacts: [], total: 0 }
      }

      let query = ctx.supabase
        .from('contacts')
        .select('*', { count: 'exact' })
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .range(input.offset, input.offset + input.limit - 1)

      if (contactIdFilter) query = query.in('id', contactIdFilter)
      if (input.search) query = query.or(`name.ilike.%${input.search}%,phone.ilike.%${input.search}%`)
      if (input.tag) query = query.contains('tags', [input.tag])

      const { data, error, count } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { contacts: data ?? [], total: count ?? 0 }
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      phone: z.string().min(8),
      tags: z.array(z.string()).default([]),
      listId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const phone = normalizePhone(input.phone)

      const { data, error } = await ctx.supabase
        .from('contacts')
        .upsert({
          organization_id: orgId,
          external_id: phone,
          channel_type: 'whatsapp',
          name: input.name,
          phone,
          tags: input.tags,
          kanban_stage: 'new',
        }, { onConflict: 'organization_id,external_id,channel_type', ignoreDuplicates: false })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      // Add to list if provided
      if (input.listId && data?.id) {
        await ctx.supabase.from('contact_list_members')
          .upsert({ list_id: input.listId, contact_id: data.id }, { ignoreDuplicates: true })
      }

      return data
    }),

  importBulk: protectedProcedure
    .input(z.object({
      contacts: z.array(z.object({ name: z.string(), phone: z.string() })).min(1).max(500),
      tags: z.array(z.string()).default([]),
      listId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)

      const rows = input.contacts
        .map((c) => ({
          organization_id: orgId,
          external_id: normalizePhone(c.phone),
          channel_type: 'whatsapp',
          name: c.name.trim() || normalizePhone(c.phone),
          phone: normalizePhone(c.phone),
          tags: input.tags,
          kanban_stage: 'new',
        }))
        .filter((r) => r.external_id.length >= 10)

      if (rows.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum contato válido encontrado' })

      let inserted = 0
      let skipped = 0
      const insertedIds: string[] = []

      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50)
        const { data, error } = await ctx.supabase
          .from('contacts')
          .upsert(batch, { onConflict: 'organization_id,external_id,channel_type', ignoreDuplicates: true })
          .select('id')
        if (!error && data) {
          inserted += data.length
          insertedIds.push(...data.map((d: any) => d.id))
        } else {
          skipped += batch.length
        }
      }

      // Add to list
      if (input.listId && insertedIds.length > 0) {
        const members = insertedIds.map((id) => ({ list_id: input.listId!, contact_id: id }))
        for (let i = 0; i < members.length; i += 50) {
          await ctx.supabase.from('contact_list_members')
            .upsert(members.slice(i, i + 50), { ignoreDuplicates: true })
        }
      }

      return { inserted, skipped, total: rows.length }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      await ctx.supabase.from('contact_list_members').delete().eq('contact_id', input.id)
      const { error } = await ctx.supabase.from('contacts').delete().eq('id', input.id).eq('organization_id', orgId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  removeFromList: protectedProcedure
    .input(z.object({ contactId: z.string().uuid(), listId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.supabase.from('contact_list_members')
        .delete()
        .eq('contact_id', input.contactId)
        .eq('list_id', input.listId)
      return { success: true }
    }),

  updateTags: protectedProcedure
    .input(z.object({ id: z.string().uuid(), tags: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { error } = await ctx.supabase
        .from('contacts').update({ tags: input.tags }).eq('id', input.id).eq('organization_id', orgId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),
})
