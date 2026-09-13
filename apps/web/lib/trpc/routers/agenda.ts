import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../init'
import { createClient } from '@supabase/supabase-js'
import { PRESETS, acharPreset, SETTINGS_PADRAO } from '@/lib/agenda/presets'
import { localParaUtc, somarDias, partesLocais } from '@/lib/agenda/tempo'
import { slotsDoDia, fimDoCompromisso, type Intervalo } from '@/lib/agenda/slots'
import { calcularEnvioConfirmacao } from '@/lib/agenda/lembretes'

function getDb() {
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

type Db = ReturnType<typeof getDb>

async function lerSettings(db: Db, orgId: string) {
  const { data } = await db.from('agenda_settings').select('*').eq('organization_id', orgId).maybeSingle()
  return {
    ...SETTINGS_PADRAO,
    organization_id: orgId,
    ...((data ?? {}) as Record<string, unknown>),
  } as typeof SETTINGS_PADRAO & { organization_id: string }
}

/**
 * Enfileira o pedido de confirmação de um compromisso.
 *
 * O índice único parcial (appointment_id, kind) impede duplicata quando a
 * criação é reprocessada, então aqui não há checagem prévia: se colidir, a
 * inserção falha e o erro é descartado — que é o comportamento desejado.
 */
async function agendarConfirmacao(db: Db, orgId: string, appointmentId: string, inicio: Date) {
  const s = await lerSettings(db, orgId)
  const quando = calcularEnvioConfirmacao({
    tz: s.timezone,
    inicioCompromisso: inicio,
    horasAntes: s.confirmation_hours_before,
    janela: { inicio: s.send_window_start, fim: s.send_window_end },
  })
  if (!quando) return

  await db.from('agenda_reminders').insert({
    organization_id: orgId,
    appointment_id: appointmentId,
    kind: 'confirmacao',
    scheduled_for: quando.toISOString(),
  })
}

async function cancelarLembretes(db: Db, appointmentId: string) {
  await db
    .from('agenda_reminders')
    .update({ status: 'cancelado' })
    .eq('appointment_id', appointmentId)
    .eq('status', 'pendente')
}

const SELECT_COMPROMISSO = `
  id, starts_at, ends_at, status, confirmation, confirmed_at, notes, custom_data, source,
  resource_id, service_id, contact_id,
  agenda_resources(id, name, color, kind),
  agenda_services(id, name, duration_minutes, buffer_minutes, price_cents),
  contacts(id, name, phone, external_id)
`

const campoExtraSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'select', 'number', 'date']),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
})

function erroDeBanco(error: { code?: string; message: string }): never {
  // 23P01 = exclusion_violation, a restrição agenda_appointments_no_overlap.
  // É o banco recusando dupla marcação; vira mensagem de negócio, não 500.
  if (error.code === '23P01') {
    throw new TRPCError({ code: 'CONFLICT', message: 'Esse horário já está ocupado para o recurso escolhido.' })
  }
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
}

export const agendaRouter = router({
  // ── Configuração ──────────────────────────────────────────────
  presets: protectedProcedure.query(() => PRESETS),

  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await getOrgId(ctx)
    return lerSettings(getDb(), orgId)
  }),

  updateSettings: protectedProcedure
    .input(z.object({
      preset: z.string().nullable().optional(),
      label_resource_singular: z.string().min(1).optional(),
      label_resource_plural: z.string().min(1).optional(),
      label_service_singular: z.string().min(1).optional(),
      label_service_plural: z.string().min(1).optional(),
      label_appointment_singular: z.string().min(1).optional(),
      label_appointment_plural: z.string().min(1).optional(),
      custom_fields: z.array(campoExtraSchema).optional(),
      timezone: z.string().optional(),
      confirmation_hours_before: z.number().int().min(0).max(168).optional(),
      auto_confirm_on_no_reply: z.boolean().optional(),
      send_window_start: z.string().optional(),
      send_window_end: z.string().optional(),
      confirmation_template: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()
      const atual = await lerSettings(db, orgId)

      const { data, error } = await db
        .from('agenda_settings')
        .upsert(
          { ...atual, ...input, organization_id: orgId, updated_at: new Date().toISOString() },
          { onConflict: 'organization_id' }
        )
        .select()
        .single()

      if (error) erroDeBanco(error)
      return data
    }),

  /** Aplica um preset de nicho: vocabulário, campos extras e serviços sugeridos. */
  aplicarPreset: protectedProcedure
    .input(z.object({ presetId: z.string(), criarServicos: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()
      const preset = acharPreset(input.presetId)
      if (!preset) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Preset desconhecido' })

      const atual = await lerSettings(db, orgId)
      const { error } = await db.from('agenda_settings').upsert(
        {
          ...atual,
          organization_id: orgId,
          preset: preset.id,
          ...preset.labels,
          custom_fields: preset.custom_fields,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id' }
      )
      if (error) erroDeBanco(error)

      if (input.criarServicos) {
        const { count } = await db
          .from('agenda_services')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)

        // Só semeia em agenda vazia: reaplicar preset não pode duplicar serviço
        // que o cliente já ajustou.
        if (!count) {
          await db.from('agenda_services').insert(
            preset.servicos_sugeridos.map((s) => ({ ...s, organization_id: orgId }))
          )
        }
      }

      return { ok: true }
    }),

  // ── Recursos ──────────────────────────────────────────────────
  listResources: protectedProcedure
    .input(z.object({ incluirInativos: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      let q = getDb()
        .from('agenda_resources')
        .select('*, agenda_resource_services(service_id)')
        .eq('organization_id', orgId)
        .order('name')
      if (!input?.incluirInativos) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) erroDeBanco(error)
      return data ?? []
    }),

  saveResource: protectedProcedure
    .input(z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      kind: z.enum(['pessoa', 'sala', 'equipamento', 'outro']).default('pessoa'),
      color: z.string().nullable().optional(),
      is_active: z.boolean().default(true),
      serviceIds: z.array(z.string().uuid()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()
      const { serviceIds, id, ...campos } = input

      let resourceId = id
      if (id) {
        const { error } = await db
          .from('agenda_resources')
          .update({ ...campos, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('organization_id', orgId)
        if (error) erroDeBanco(error)
      } else {
        const { data, error } = await db
          .from('agenda_resources')
          .insert({ ...campos, organization_id: orgId })
          .select('id')
          .single()
        if (error) erroDeBanco(error)
        resourceId = data.id
      }

      if (serviceIds && resourceId) {
        await db.from('agenda_resource_services').delete().eq('resource_id', resourceId)
        if (serviceIds.length) {
          await db.from('agenda_resource_services').insert(
            serviceIds.map((service_id) => ({ resource_id: resourceId as string, service_id }))
          )
        }
      }

      return { id: resourceId }
    }),

  deleteResource: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()

      // O FK de agenda_appointments.resource_id é `on delete restrict`: recurso
      // com histórico não some, é desativado. Isso preserva a agenda passada.
      const { count } = await db
        .from('agenda_appointments')
        .select('*', { count: 'exact', head: true })
        .eq('resource_id', input.id)

      if (count) {
        const { error } = await db
          .from('agenda_resources')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', input.id)
          .eq('organization_id', orgId)
        if (error) erroDeBanco(error)
        return { desativado: true }
      }

      const { error } = await db.from('agenda_resources').delete().eq('id', input.id).eq('organization_id', orgId)
      if (error) erroDeBanco(error)
      return { desativado: false }
    }),

  // ── Serviços ──────────────────────────────────────────────────
  listServices: protectedProcedure
    .input(z.object({ incluirInativos: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      let q = getDb().from('agenda_services').select('*').eq('organization_id', orgId).order('name')
      if (!input?.incluirInativos) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) erroDeBanco(error)
      return data ?? []
    }),

  saveService: protectedProcedure
    .input(z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      duration_minutes: z.number().int().min(5).max(24 * 60),
      buffer_minutes: z.number().int().min(0).max(240).default(0),
      price_cents: z.number().int().min(0).nullable().optional(),
      is_active: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()
      const { id, ...campos } = input

      if (id) {
        const { error } = await db
          .from('agenda_services')
          .update({ ...campos, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('organization_id', orgId)
        if (error) erroDeBanco(error)
        return { id }
      }

      const { data, error } = await db
        .from('agenda_services')
        .insert({ ...campos, organization_id: orgId })
        .select('id')
        .single()
      if (error) erroDeBanco(error)
      return { id: data.id }
    }),

  deleteService: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()
      const { count } = await db
        .from('agenda_appointments')
        .select('*', { count: 'exact', head: true })
        .eq('service_id', input.id)

      if (count) {
        const { error } = await db
          .from('agenda_services')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', input.id)
          .eq('organization_id', orgId)
        if (error) erroDeBanco(error)
        return { desativado: true }
      }

      const { error } = await db.from('agenda_services').delete().eq('id', input.id).eq('organization_id', orgId)
      if (error) erroDeBanco(error)
      return { desativado: false }
    }),

  // ── Expediente ────────────────────────────────────────────────
  listAvailability: protectedProcedure
    .input(z.object({ resourceId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      let q = getDb()
        .from('agenda_availability')
        .select('*')
        .eq('organization_id', orgId)
        .order('weekday')
        .order('start_time')
      if (input?.resourceId) q = q.eq('resource_id', input.resourceId)
      const { data, error } = await q
      if (error) erroDeBanco(error)
      return data ?? []
    }),

  /** Substitui o expediente inteiro de um recurso — a tela edita a semana toda. */
  saveAvailability: protectedProcedure
    .input(z.object({
      resourceId: z.string().uuid(),
      faixas: z.array(z.object({
        weekday: z.number().int().min(0).max(6),
        start_time: z.string(),
        end_time: z.string(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()

      for (const f of input.faixas) {
        if (f.start_time >= f.end_time) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Hora final tem que ser depois da inicial.' })
        }
      }

      await db.from('agenda_availability').delete().eq('resource_id', input.resourceId).eq('organization_id', orgId)

      if (input.faixas.length) {
        const { error } = await db.from('agenda_availability').insert(
          input.faixas.map((f) => ({ ...f, resource_id: input.resourceId, organization_id: orgId }))
        )
        if (error) erroDeBanco(error)
      }
      return { ok: true }
    }),

  // ── Bloqueios ─────────────────────────────────────────────────
  listBlocks: protectedProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { data, error } = await getDb()
        .from('agenda_blocks')
        .select('*, agenda_resources(id, name)')
        .eq('organization_id', orgId)
        .lt('starts_at', input.to)
        .gt('ends_at', input.from)
        .order('starts_at')
      if (error) erroDeBanco(error)
      return data ?? []
    }),

  createBlock: protectedProcedure
    .input(z.object({
      resourceId: z.string().uuid().nullable().optional(),
      startsAt: z.string(),
      endsAt: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      if (new Date(input.endsAt) <= new Date(input.startsAt)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Fim do bloqueio tem que ser depois do início.' })
      }
      const { data, error } = await getDb()
        .from('agenda_blocks')
        .insert({
          organization_id: orgId,
          resource_id: input.resourceId ?? null,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          reason: input.reason ?? null,
        })
        .select()
        .single()
      if (error) erroDeBanco(error)
      return data
    }),

  deleteBlock: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { error } = await getDb().from('agenda_blocks').delete().eq('id', input.id).eq('organization_id', orgId)
      if (error) erroDeBanco(error)
      return { ok: true }
    }),

  // ── Compromissos ──────────────────────────────────────────────
  listAppointments: protectedProcedure
    .input(z.object({
      from: z.string(),
      to: z.string(),
      resourceId: z.string().uuid().optional(),
      status: z.array(z.string()).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      let q = getDb()
        .from('agenda_appointments')
        .select(SELECT_COMPROMISSO)
        .eq('organization_id', orgId)
        .lt('starts_at', input.to)
        .gt('ends_at', input.from)
        .order('starts_at')
      if (input.resourceId) q = q.eq('resource_id', input.resourceId)
      if (input.status?.length) q = q.in('status', input.status)
      const { data, error } = await q
      if (error) erroDeBanco(error)
      return data ?? []
    }),

  /** Horários livres de cada recurso capaz de executar o serviço, num dia. */
  availableSlots: protectedProcedure
    .input(z.object({
      ymd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      serviceId: z.string().uuid(),
      resourceId: z.string().uuid().optional(),
      /** Ignora um compromisso ao recalcular — usado ao remarcar. */
      ignorarAppointmentId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()
      const s = await lerSettings(db, orgId)

      const { data: servico } = await db
        .from('agenda_services')
        .select('id, name, duration_minutes, buffer_minutes')
        .eq('id', input.serviceId)
        .eq('organization_id', orgId)
        .single()
      if (!servico) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não encontrado' })

      const inicioDia = localParaUtc(s.timezone, input.ymd, '00:00')
      const fimDia = localParaUtc(s.timezone, somarDias(input.ymd, 1), '00:00')
      // Meio-dia local: imune a virada de fuso na leitura do dia da semana.
      const weekday = partesLocais(s.timezone, new Date(inicioDia.getTime() + 12 * 3_600_000)).weekday

      const { data: recursos } = await db
        .from('agenda_resources')
        .select('id, name, color, agenda_resource_services(service_id)')
        .eq('organization_id', orgId)
        .eq('is_active', true)

      // Recurso sem vínculo em agenda_resource_services atende qualquer serviço
      // — é o caso da organização que nunca configurou a matriz.
      const elegiveis = (recursos ?? []).filter((r: any) => {
        if (input.resourceId && r.id !== input.resourceId) return false
        const vinculos = (r.agenda_resource_services ?? []) as { service_id: string }[]
        return vinculos.length === 0 || vinculos.some((v) => v.service_id === input.serviceId)
      })
      if (!elegiveis.length) return []

      const ids = elegiveis.map((r: any) => r.id)

      const [expedientes, compromissos, bloqueios] = await Promise.all([
        db.from('agenda_availability').select('resource_id, start_time, end_time').in('resource_id', ids).eq('weekday', weekday),
        db.from('agenda_appointments')
          .select('id, resource_id, starts_at, ends_at')
          .in('resource_id', ids)
          .in('status', ['scheduled', 'confirmed'])
          .lt('starts_at', fimDia.toISOString())
          .gt('ends_at', inicioDia.toISOString()),
        db.from('agenda_blocks')
          .select('resource_id, starts_at, ends_at')
          .eq('organization_id', orgId)
          .lt('starts_at', fimDia.toISOString())
          .gt('ends_at', inicioDia.toISOString()),
      ])

      return elegiveis.map((r: any) => {
        const ocupados: Intervalo[] = [
          ...(compromissos.data ?? [])
            .filter((a: any) => a.resource_id === r.id && a.id !== input.ignorarAppointmentId)
            .map((a: any) => ({ inicio: new Date(a.starts_at), fim: new Date(a.ends_at) })),
          ...(bloqueios.data ?? [])
            .filter((b: any) => b.resource_id === null || b.resource_id === r.id)
            .map((b: any) => ({ inicio: new Date(b.starts_at), fim: new Date(b.ends_at) })),
        ]

        const slots = slotsDoDia({
          tz: s.timezone,
          ymd: input.ymd,
          expediente: (expedientes.data ?? []).filter((e: any) => e.resource_id === r.id),
          ocupados,
          duracaoMin: servico.duration_minutes,
          bufferMin: servico.buffer_minutes,
        })

        return {
          resource: { id: r.id, name: r.name, color: r.color },
          slots: slots.map((d) => d.toISOString()),
        }
      })
    }),

  createAppointment: protectedProcedure
    .input(z.object({
      resourceId: z.string().uuid(),
      serviceId: z.string().uuid(),
      contactId: z.string().uuid().optional(),
      novoContato: z.object({ name: z.string().min(1), phone: z.string().min(8) }).optional(),
      startsAt: z.string(),
      notes: z.string().optional(),
      customData: z.record(z.any()).default({}),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()

      const { data: servico } = await db
        .from('agenda_services')
        .select('duration_minutes, buffer_minutes')
        .eq('id', input.serviceId)
        .eq('organization_id', orgId)
        .single()
      if (!servico) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não encontrado' })

      let contactId = input.contactId
      if (!contactId) {
        if (!input.novoContato) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Informe um contato.' })
        }
        // Mesma normalização de contacts.create: o external_id do WhatsApp é o
        // telefone só com dígitos e DDI, e é por ele que o lembrete sai.
        let digitos = input.novoContato.phone.replace(/\D/g, '')
        if (digitos.startsWith('0')) digitos = digitos.slice(1)
        if (!digitos.startsWith('55') && digitos.length <= 11) digitos = '55' + digitos

        const { data: contato, error } = await db
          .from('contacts')
          .upsert(
            {
              organization_id: orgId,
              external_id: digitos,
              channel_type: 'whatsapp',
              name: input.novoContato.name,
              phone: digitos,
              kanban_stage: 'new',
            },
            { onConflict: 'organization_id,external_id,channel_type', ignoreDuplicates: false }
          )
          .select('id')
          .single()
        if (error) erroDeBanco(error)
        contactId = contato.id
      }

      const inicio = new Date(input.startsAt)
      const fim = fimDoCompromisso(inicio, servico.duration_minutes, servico.buffer_minutes)

      const { data, error } = await db
        .from('agenda_appointments')
        .insert({
          organization_id: orgId,
          resource_id: input.resourceId,
          service_id: input.serviceId,
          contact_id: contactId,
          starts_at: inicio.toISOString(),
          ends_at: fim.toISOString(),
          notes: input.notes ?? null,
          custom_data: input.customData,
          source: 'painel',
          created_by: ctx.user.id,
        })
        .select(SELECT_COMPROMISSO)
        .single()
      if (error) erroDeBanco(error)

      await agendarConfirmacao(db, orgId, (data as any).id, inicio)
      return data
    }),

  updateAppointment: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      notes: z.string().nullable().optional(),
      customData: z.record(z.any()).optional(),
      status: z.enum(['scheduled', 'confirmed', 'completed', 'no_show', 'cancelled']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.notes !== undefined) patch.notes = input.notes
      if (input.customData !== undefined) patch.custom_data = input.customData
      if (input.status) {
        patch.status = input.status
        if (input.status === 'confirmed') {
          patch.confirmation = 'confirmada'
          patch.confirmed_at = new Date().toISOString()
        }
      }

      const { data, error } = await db
        .from('agenda_appointments')
        .update(patch)
        .eq('id', input.id)
        .eq('organization_id', orgId)
        .select(SELECT_COMPROMISSO)
        .single()
      if (error) erroDeBanco(error)

      if (input.status && ['cancelled', 'completed', 'no_show'].includes(input.status)) {
        await cancelarLembretes(db, input.id)
      }
      return data
    }),

  rescheduleAppointment: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      startsAt: z.string(),
      resourceId: z.string().uuid().optional(),
      serviceId: z.string().uuid().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const db = getDb()

      const { data: atual } = await db
        .from('agenda_appointments')
        .select('id, resource_id, service_id')
        .eq('id', input.id)
        .eq('organization_id', orgId)
        .single()
      if (!atual) throw new TRPCError({ code: 'NOT_FOUND' })

      const serviceId = input.serviceId ?? atual.service_id
      const { data: servico } = await db
        .from('agenda_services')
        .select('duration_minutes, buffer_minutes')
        .eq('id', serviceId)
        .single()
      if (!servico) throw new TRPCError({ code: 'NOT_FOUND', message: 'Serviço não encontrado' })

      const inicio = new Date(input.startsAt)
      const fim = fimDoCompromisso(inicio, servico.duration_minutes, servico.buffer_minutes)

      const { data, error } = await db
        .from('agenda_appointments')
        .update({
          resource_id: input.resourceId ?? atual.resource_id,
          service_id: serviceId,
          starts_at: inicio.toISOString(),
          ends_at: fim.toISOString(),
          // Remarcou: a confirmação anterior não vale para o horário novo.
          status: 'scheduled',
          confirmation: 'pendente',
          confirmed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
        .eq('organization_id', orgId)
        .select(SELECT_COMPROMISSO)
        .single()
      if (error) erroDeBanco(error)

      await cancelarLembretes(db, input.id)
      await agendarConfirmacao(db, orgId, input.id, inicio)
      return data
    }),

  /** Painel do período: contagem por status e por confirmação. */
  resumo: protectedProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ ctx, input }) => {
      const orgId = await getOrgId(ctx)
      const { data, error } = await getDb()
        .from('agenda_appointments')
        .select('status, confirmation')
        .eq('organization_id', orgId)
        .lt('starts_at', input.to)
        .gt('ends_at', input.from)
      if (error) erroDeBanco(error)

      const contar = (arr: any[], campo: string) =>
        arr.reduce<Record<string, number>>((acc, r) => {
          acc[r[campo]] = (acc[r[campo]] ?? 0) + 1
          return acc
        }, {})

      const linhas = (data ?? []) as any[]
      return { total: linhas.length, porStatus: contar(linhas, 'status'), porConfirmacao: contar(linhas, 'confirmation') }
    }),
})
