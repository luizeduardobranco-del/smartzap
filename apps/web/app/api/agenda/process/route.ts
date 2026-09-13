import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findOrCreateOpenConversation } from '@/lib/conversations'
import { SETTINGS_PADRAO } from '@/lib/agenda/presets'
import {
  calcularEnvioConfirmacao,
  dentroDaJanela,
  empurrarParaJanela,
  montarTextoConfirmacao,
} from '@/lib/agenda/lembretes'

// Cron da Agenda. Faz três coisas, nesta ordem:
//   1. enfileira o pedido de confirmação de quem entrou sem lembrete
//      (compromisso criado pelo agente ou por importação);
//   2. dispara os pedidos vencidos, respeitando a janela de envio;
//   3. fecha como 'sem_resposta' (ou confirma, se a organização mandar) quem
//      não respondeu até a véspera do horário.
//
// Mesma forma de /api/funnels/process, inclusive no adiamento em caso de erro:
// item que falha volta para daqui a 10 minutos em vez de virar martelo em cima
// da Evolution.

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

type Db = ReturnType<typeof getDb>

function autorizado(req: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET ?? '').trim()
  if (!secret) return true
  const auth = req.headers.get('authorization') ?? ''
  const key =
    req.headers.get('x-cron-secret') ??
    req.headers.get('x-cron-key') ??
    new URL(req.url).searchParams.get('key') ??
    ''
  return auth === `Bearer ${secret}` || key === secret
}

async function settingsDaOrg(db: Db, cache: Map<string, any>, orgId: string) {
  if (cache.has(orgId)) return cache.get(orgId)
  const { data } = await db.from('agenda_settings').select('*').eq('organization_id', orgId).maybeSingle()
  const s = { ...SETTINGS_PADRAO, ...(data ?? {}) }
  cache.set(orgId, s)
  return s
}

/** Canal WhatsApp por onde o lembrete sai. Compromisso não guarda canal. */
async function canalDaOrg(db: Db, cache: Map<string, any>, orgId: string) {
  if (cache.has(orgId)) return cache.get(orgId)
  const { data } = await db
    .from('channels')
    .select('id, agent_id, credentials, status')
    .eq('organization_id', orgId)
    .eq('type', 'whatsapp')
    .order('status', { ascending: true })
    .limit(5)
  const conectado = (data ?? []).find((c: any) => c.status === 'connected') ?? (data ?? [])[0] ?? null
  cache.set(orgId, conectado)
  return conectado
}

async function enviarTexto(instanceName: string, phone: string, texto: string) {
  const url = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!url || !apiKey) throw new Error('EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes no ambiente')

  const res = await fetch(`${url}/message/sendText/${instanceName}`, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: phone, text: texto }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

async function registrarNaConversa(
  db: Db,
  opts: { orgId: string; contactId: string; channelId: string; agentId: string | null; texto: string; appointmentId: string }
) {
  try {
    const conv = await findOrCreateOpenConversation(db, {
      organizationId: opts.orgId,
      contactId: opts.contactId,
      channelId: opts.channelId,
      agentId: opts.agentId,
    })
    if (!conv?.id) return

    await db.from('messages').insert({
      conversation_id: conv.id,
      organization_id: opts.orgId,
      role: 'assistant',
      content: opts.texto,
      content_type: 'text',
      sender_type: 'agenda',
      metadata: { agenda_appointment_id: opts.appointmentId, kind: 'confirmacao' },
    })
    await db.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id)
  } catch (err: any) {
    // O pedido saiu; não registrar no histórico é ruim, mas não é motivo para
    // marcar o lembrete como falho e reenviar.
    console.warn('[agenda/process] registrarNaConversa falhou:', err?.message)
  }
}

// ── 1. Enfileira quem ficou sem lembrete ─────────────────────────────────────
async function enfileirarFaltantes(db: Db, cacheSettings: Map<string, any>, agora: Date): Promise<number> {
  const limite = new Date(agora.getTime() + 7 * 24 * 3_600_000).toISOString()

  const { data: futuros } = await db
    .from('agenda_appointments')
    .select('id, organization_id, starts_at')
    .in('status', ['scheduled', 'confirmed'])
    .eq('confirmation', 'pendente')
    .gt('starts_at', agora.toISOString())
    .lt('starts_at', limite)
    .limit(200)

  if (!futuros?.length) return 0

  const ids = futuros.map((a: any) => a.id)
  const { data: existentes } = await db
    .from('agenda_reminders')
    .select('appointment_id')
    .in('appointment_id', ids)
    .eq('kind', 'confirmacao')
    .in('status', ['pendente', 'enviado'])

  const jaTem = new Set((existentes ?? []).map((r: any) => r.appointment_id))
  const novos: any[] = []

  for (const a of futuros) {
    if (jaTem.has(a.id)) continue
    const s = await settingsDaOrg(db, cacheSettings, a.organization_id)
    const quando = calcularEnvioConfirmacao({
      tz: s.timezone,
      inicioCompromisso: new Date(a.starts_at),
      horasAntes: s.confirmation_hours_before,
      janela: { inicio: s.send_window_start, fim: s.send_window_end },
      agora,
    })
    if (!quando) continue
    novos.push({
      organization_id: a.organization_id,
      appointment_id: a.id,
      kind: 'confirmacao',
      scheduled_for: quando.toISOString(),
    })
  }

  if (!novos.length) return 0
  // O índice único parcial resolve corrida com o router; inserir em lote pode
  // falhar por causa de uma linha só, então vai uma a uma.
  let criados = 0
  for (const n of novos) {
    const { error } = await db.from('agenda_reminders').insert(n)
    if (!error) criados++
  }
  return criados
}

// ── 2. Dispara os vencidos ───────────────────────────────────────────────────
async function dispararVencidos(
  db: Db,
  cacheSettings: Map<string, any>,
  cacheCanal: Map<string, any>,
  agora: Date
) {
  const { data: vencidos, error } = await db
    .from('agenda_reminders')
    .select(`
      id, organization_id, appointment_id, kind, scheduled_for, attempts,
      agenda_appointments!inner(
        id, status, starts_at, contact_id,
        agenda_resources(name),
        agenda_services(name),
        contacts(id, name, phone, external_id)
      )
    `)
    .eq('status', 'pendente')
    .lte('scheduled_for', agora.toISOString())
    .order('scheduled_for')
    .limit(50)

  if (error) throw new Error(error.message)

  let enviados = 0
  let adiados = 0
  let falhas = 0

  for (const r of vencidos ?? []) {
    const appt = (r as any).agenda_appointments
    try {
      if (!appt || !['scheduled', 'confirmed'].includes(appt.status)) {
        await db.from('agenda_reminders').update({ status: 'cancelado' }).eq('id', r.id)
        continue
      }

      const s = await settingsDaOrg(db, cacheSettings, r.organization_id)
      const janela = { inicio: s.send_window_start, fim: s.send_window_end }

      if (!dentroDaJanela(s.timezone, agora, janela)) {
        await db
          .from('agenda_reminders')
          .update({ scheduled_for: empurrarParaJanela(s.timezone, agora, janela).toISOString() })
          .eq('id', r.id)
        adiados++
        continue
      }

      const contato = appt.contacts
      const telefone = contato?.external_id ?? contato?.phone
      if (!telefone) throw new Error('contato sem telefone')

      const canal = await canalDaOrg(db, cacheCanal, r.organization_id)
      const instanceName = canal?.credentials?.instanceName
      if (!instanceName) throw new Error('organização sem canal WhatsApp com instanceName')

      const texto = montarTextoConfirmacao({
        template: s.confirmation_template,
        tz: s.timezone,
        contato: (contato?.name ?? '').split(' ')[0] || 'tudo bem',
        servico: appt.agenda_services?.name ?? s.label_appointment_singular,
        recurso: appt.agenda_resources?.name ?? '',
        inicio: new Date(appt.starts_at),
      })

      await enviarTexto(instanceName, telefone, texto)

      await db
        .from('agenda_reminders')
        .update({ status: 'enviado', sent_at: new Date().toISOString(), attempts: (r.attempts ?? 0) + 1 })
        .eq('id', r.id)

      await db
        .from('agenda_appointments')
        .update({ confirmation: 'enviada', updated_at: new Date().toISOString() })
        .eq('id', appt.id)

      await registrarNaConversa(db, {
        orgId: r.organization_id,
        contactId: contato.id,
        channelId: canal.id,
        agentId: canal.agent_id ?? null,
        texto,
        appointmentId: appt.id,
      })

      enviados++
    } catch (err: any) {
      const tentativas = (r.attempts ?? 0) + 1
      const desiste = tentativas >= 3
      await db
        .from('agenda_reminders')
        .update({
          attempts: tentativas,
          error_message: String(err?.message ?? err).slice(0, 300),
          status: desiste ? 'falhou' : 'pendente',
          scheduled_for: desiste ? r.scheduled_for : new Date(agora.getTime() + 10 * 60_000).toISOString(),
        })
        .eq('id', r.id)
      falhas++
      console.error('[agenda/process] lembrete', r.id, err?.message)
    }
  }

  return { enviados, adiados, falhas }
}

// ── 3. Fecha quem não respondeu ──────────────────────────────────────────────
async function fecharSemResposta(db: Db, cacheSettings: Map<string, any>, agora: Date): Promise<number> {
  const limite = new Date(agora.getTime() + 2 * 3_600_000).toISOString()

  const { data: pendentes } = await db
    .from('agenda_appointments')
    .select('id, organization_id')
    .eq('confirmation', 'enviada')
    .in('status', ['scheduled'])
    .gt('starts_at', agora.toISOString())
    .lt('starts_at', limite)
    .limit(200)

  let fechados = 0
  for (const a of pendentes ?? []) {
    const s = await settingsDaOrg(db, cacheSettings, a.organization_id)
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (s.auto_confirm_on_no_reply) {
      patch.confirmation = 'confirmada'
      patch.status = 'confirmed'
      patch.confirmed_at = new Date().toISOString()
    } else {
      // Silêncio não é confirmação: fica marcado para a recepção ligar.
      patch.confirmation = 'sem_resposta'
    }
    const { error } = await db.from('agenda_appointments').update(patch).eq('id', a.id)
    if (!error) fechados++
  }
  return fechados
}

async function handler(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getDb()
  const agora = new Date()
  const cacheSettings = new Map<string, any>()
  const cacheCanal = new Map<string, any>()

  try {
    const enfileirados = await enfileirarFaltantes(db, cacheSettings, agora)
    const { enviados, adiados, falhas } = await dispararVencidos(db, cacheSettings, cacheCanal, agora)
    const semResposta = await fecharSemResposta(db, cacheSettings, agora)

    console.log(
      `[agenda/process] enfileirados=${enfileirados} enviados=${enviados} adiados=${adiados} falhas=${falhas} sem_resposta=${semResposta}`
    )
    return NextResponse.json({ enfileirados, enviados, adiados, falhas, semResposta })
  } catch (err: any) {
    console.error('[agenda/process] erro:', err?.message)
    return NextResponse.json({ error: String(err?.message ?? err) }, { status: 500 })
  }
}

export const POST = handler
export const GET = handler
export const dynamic = 'force-dynamic'
export const maxDuration = 60
