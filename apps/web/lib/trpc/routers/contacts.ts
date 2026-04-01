import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

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

// Lists are stored in organizations.settings.contactLists (JSON array)
// List membership is stored as tag "_list:{listId}" in contacts.tags
// This avoids dependency on contact_lists / contact_list_members PostgREST cache

async function getOrgLists(supabase: any, orgId: string): Promise<any[]> {
  const { data: org } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .single()
  return (org?.settings as any)?.contactLists ?? []
}

async function saveOrgLists(orgId: string, lists: any[]) {
  const db = getServiceClient()
  const { data: org } = await db.from('organizations').select('settings').eq('id', orgId).single()
  const current = (org?.settings as Record<string, unknown>) ?? {}
  await db.from('organizations').update({
    settings: { ...current, contactLists: lists },
    updated_at: new Date().toISOString(),
  }).eq('id', orgId)
}

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = digits.slice(1)
  if (!digits.startsWith('55') && digits.length <= 11) digits = '55' + digits
  return digits
}

const LIST_TAG_PREFIX = '_list:'

export const contactsRouter = router({
  // ─── Lists ────────────────────────────────────────────────────────────────

  getLists: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx)
    const lists = await getOrgLists(ctx.supabase, orgId)
    if (lists.length === 0) return []

    // Count members per list — count unique contacts, not tag occurrences
    const { data: contacts } = await ctx.supabase
      .from('contacts')
      .select('tags')
      .eq('organization_id', orgId)
      .not('tags', 'eq', '{}')

    const contactTags: string[][] = (contacts ?? []).map((c: any) => c.tags ?? [])
    return lists.map((list: any) => {
      const listTag = `${LIST_TAG_PREFIX}${list.id}`
      const member_count = contactTags.filter((tags) => tags.includes(listTag)).length
      return { ...list, member_count }
    })
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
      const lists = await getOrgLists(ctx.supabase, orgId)
      const newList = {
        id: randomUUID(),
        organization_id: orgId,
        name: input.name,
        description: input.description ?? '',
        color: input.color,
        list_type: input.list_type ?? '',
        created_at: new Date().toISOString(),
      }
      await saveOrgLists(orgId, [...lists, newList])
      return newList
    }),

  getAllTags: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx)
    const { data, error } = await ctx.supabase
      .from('contacts')
      .select('tags')
      .eq('organization_id', orgId)
      .not('tags', 'eq', '{}')
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    // Filter out internal list tags
    const allTags = [...new Set(
      (data ?? []).flatMap((c: any) => (c.tags ?? []).filter((t: string) => !t.startsWith(LIST_TAG_PREFIX)))
    )].sort()
    return allTags as string[]
  }),

  renameList: protectedProcedure
    .input(z.object({ id: z.string().uuid(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const lists = await getOrgLists(ctx.supabase, orgId)
      const updated = lists.map((l: any) => l.id === input.id ? { ...l, name: input.name } : l)
      await saveOrgLists(orgId, updated)
      return { success: true }
    }),

  deleteList: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const lists = await getOrgLists(ctx.supabase, orgId)
      const filtered = lists.filter((l: any) => l.id !== input.id)
      await saveOrgLists(orgId, filtered)

      // Remove _list:{id} tag from all contacts in this org
      const db = getServiceClient()
      const listTag = `${LIST_TAG_PREFIX}${input.id}`
      const { data: members } = await db
        .from('contacts')
        .select('id, tags')
        .eq('organization_id', orgId)
        .contains('tags', [listTag])

      if (members && members.length > 0) {
        for (const contact of members) {
          await db.from('contacts').update({
            tags: (contact.tags ?? []).filter((t: string) => t !== listTag),
          }).eq('id', contact.id)
        }
      }
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

      let query = ctx.supabase
        .from('contacts')
        .select('*', { count: 'exact' })
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .range(input.offset, input.offset + input.limit - 1)

      if (input.listId) query = query.contains('tags', [`${LIST_TAG_PREFIX}${input.listId}`])
      if (input.search) query = query.or(`name.ilike.%${input.search}%,phone.ilike.%${input.search}%`)
      if (input.tag) query = query.contains('tags', [input.tag])

      const { data, error, count } = await query
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      // Strip internal list tags from returned contacts
      const contacts = (data ?? []).map((c: any) => ({
        ...c,
        tags: (c.tags ?? []).filter((t: string) => !t.startsWith(LIST_TAG_PREFIX)),
      }))
      return { contacts, total: count ?? 0 }
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      phone: z.string().min(8),
      tags: z.array(z.string()).default([]),
      listId: z.string().uuid().optional(),
      company_name: z.string().optional(),
      address: z.string().optional(),
      website: z.string().optional(),
      specialties: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const phone = normalizePhone(input.phone)
      const allTags = [...input.tags]
      if (input.listId) allTags.push(`${LIST_TAG_PREFIX}${input.listId}`)

      const { data, error } = await ctx.supabase
        .from('contacts')
        .upsert({
          organization_id: orgId,
          external_id: phone,
          channel_type: 'whatsapp',
          name: input.name,
          phone,
          tags: allTags,
          kanban_stage: 'new',
          company_name: input.company_name ?? null,
          address: input.address ?? null,
          website: input.website ?? null,
          specialties: input.specialties ?? null,
        }, { onConflict: 'organization_id,external_id,channel_type', ignoreDuplicates: false })
        .select()
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  importBulk: protectedProcedure
    .input(z.object({
      contacts: z.array(z.object({
        name: z.string(),
        phone: z.string(),
        company_name: z.string().optional(),
        address: z.string().optional(),
        website: z.string().optional(),
        specialties: z.string().optional(),
      })).min(1).max(500),
      tags: z.array(z.string()).default([]),
      listId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getServiceClient()

      const listTag = input.listId ? `${LIST_TAG_PREFIX}${input.listId}` : null
      const allTags = listTag ? [...input.tags, listTag] : input.tags

      // Build rows and filter invalid phones
      const allRows = input.contacts
        .map((c) => ({
          organization_id: orgId,
          external_id: normalizePhone(c.phone),
          channel_type: 'whatsapp',
          name: c.name.trim() || normalizePhone(c.phone),
          phone: normalizePhone(c.phone),
          tags: allTags,
          kanban_stage: 'new',
          company_name: c.company_name ?? null,
          address: c.address ?? null,
          website: c.website ?? null,
          specialties: c.specialties ?? null,
        }))
        .filter((r) => r.external_id.length >= 10)

      if (allRows.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum contato válido encontrado' })
      }

      // Deduplicate within the input by external_id — keeps last occurrence
      // This prevents PostgreSQL "ON CONFLICT DO UPDATE cannot affect row a second time" error
      const seen = new Map<string, typeof allRows[number]>()
      for (const row of allRows) {
        seen.set(row.external_id, row)
      }
      const rows = Array.from(seen.values())
      const fileDuplicates = allRows.length - rows.length

      let inserted = 0
      let skipped = 0

      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50)
        const { data, error } = await db
          .from('contacts')
          .upsert(batch, { onConflict: 'organization_id,external_id,channel_type', ignoreDuplicates: false })
          .select('id')

        if (!error && data) {
          inserted += data.length
        } else {
          // Batch failed — retry row by row to salvage good contacts
          console.error('[importBulk] batch error, retrying individually:', error?.message)
          for (const row of batch) {
            const { data: single, error: singleErr } = await db
              .from('contacts')
              .upsert([row], { onConflict: 'organization_id,external_id,channel_type', ignoreDuplicates: false })
              .select('id')
            if (!singleErr && single) {
              inserted += single.length
            } else {
              console.error('[importBulk] single row error:', singleErr?.message, 'phone:', row.phone)
              skipped += 1
            }
          }
        }
      }

      return { inserted, skipped, fileDuplicates, total: input.contacts.length }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { error } = await ctx.supabase.from('contacts').delete().eq('id', input.id).eq('organization_id', orgId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  removeFromList: protectedProcedure
    .input(z.object({ contactId: z.string().uuid(), listId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getServiceClient()
      const listTag = `${LIST_TAG_PREFIX}${input.listId}`
      const { data: contact } = await db.from('contacts').select('tags').eq('id', input.contactId).single()
      if (contact) {
        await db.from('contacts').update({
          tags: (contact.tags ?? []).filter((t: string) => t !== listTag),
        }).eq('id', input.contactId)
      }
      return { success: true }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1),
      company_name: z.string().optional(),
      address: z.string().optional(),
      website: z.string().optional(),
      specialties: z.string().optional(),
      tags: z.array(z.string()).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      // Preserve internal list tags
      const { data: contact } = await ctx.supabase.from('contacts').select('tags').eq('id', input.id).eq('organization_id', orgId).single()
      if (!contact) throw new TRPCError({ code: 'NOT_FOUND' })
      const listTags = (contact.tags ?? []).filter((t: string) => t.startsWith(LIST_TAG_PREFIX))
      const { error } = await ctx.supabase
        .from('contacts')
        .update({
          name: input.name,
          company_name: input.company_name ?? null,
          address: input.address ?? null,
          website: input.website ?? null,
          specialties: input.specialties ?? null,
          tags: [...input.tags, ...listTags],
        })
        .eq('id', input.id)
        .eq('organization_id', orgId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  updateTags: protectedProcedure
    .input(z.object({ id: z.string().uuid(), tags: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      // Preserve internal list tags
      const { data: contact } = await ctx.supabase.from('contacts').select('tags').eq('id', input.id).single()
      const listTags = (contact?.tags ?? []).filter((t: string) => t.startsWith(LIST_TAG_PREFIX))
      const { error } = await ctx.supabase
        .from('contacts').update({ tags: [...input.tags, ...listTags] }).eq('id', input.id).eq('organization_id', orgId)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { success: true }
    }),

  // ─── Move/copy contacts between lists ─────────────────────────────────────

  moveToList: protectedProcedure
    .input(z.object({
      contactIds: z.array(z.string().uuid()).min(1),
      toListId: z.string(),
      fromListId: z.string().optional(), // when provided, removes from source list
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const toTag = `${LIST_TAG_PREFIX}${input.toListId}`
      const fromTag = input.fromListId ? `${LIST_TAG_PREFIX}${input.fromListId}` : null

      const { data: contacts } = await ctx.supabase
        .from('contacts')
        .select('id, tags')
        .in('id', input.contactIds)
        .eq('organization_id', orgId)

      if (!contacts?.length) throw new TRPCError({ code: 'NOT_FOUND' })

      for (const contact of contacts) {
        let tags: string[] = contact.tags ?? []
        // Remove from source list if moving
        if (fromTag) tags = tags.filter((t: string) => t !== fromTag)
        // Add to destination list (avoid duplicates)
        if (!tags.includes(toTag)) tags.push(toTag)
        await ctx.supabase.from('contacts').update({ tags }).eq('id', contact.id)
      }

      return { success: true, moved: contacts.length }
    }),

  bulkRemoveFromList: protectedProcedure
    .input(z.object({
      contactIds: z.array(z.string().uuid()).min(1),
      listId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const listTag = `${LIST_TAG_PREFIX}${input.listId}`

      const { data: contacts } = await ctx.supabase
        .from('contacts')
        .select('id, tags')
        .in('id', input.contactIds)
        .eq('organization_id', orgId)

      for (const contact of contacts ?? []) {
        const tags = (contact.tags ?? []).filter((t: string) => t !== listTag)
        await ctx.supabase.from('contacts').update({ tags }).eq('id', contact.id)
      }

      return { success: true }
    }),
})
