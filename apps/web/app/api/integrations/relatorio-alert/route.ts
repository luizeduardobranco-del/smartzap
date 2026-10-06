/**
 * POST /api/integrations/relatorio-alert
 *
 * Entrega um relatório agendado do WHITE FLEET por WhatsApp.
 *
 * Diferente de `tracker-alert`, que monta o texto a partir de um tipo de alerta
 * enumerado: aqui o texto vem PRONTO do WHITE FLEET. Quem sabe o que é um
 * resumo de viagens é o sistema de rastreamento, não este — o WHITE ZAP só
 * transporta, como já faz em `pedido-alert`.
 *
 * Vários destinatários por chamada, e o resultado é POR NÚMERO: num relatório
 * com três destinos, um telefone errado não pode impedir os outros dois de
 * receber, e quem corrige precisa saber qual falhou.
 *
 * Fluxo por destinatário: upsert contato → conversa aberta → grava a mensagem →
 * envia. Gravar antes de enviar é de propósito: a conversa é o registro do que
 * foi prometido ao cliente, e uma falha de rede no gateway não pode apagar isso.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EvolutionWhatsAppAdapter, MetaCloudWhatsAppAdapter } from '@zapagent/channel-adapters'
import { findOrCreateOpenConversation } from '@/lib/conversations'
import { autenticarChaveApi, canalWhatsappDaOrg } from '@/lib/api-key-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface RelatorioPayload {
  /** Telefones em formato internacional sem '+' (ex.: 5521985526232). */
  telefones: string[]
  /** Mensagem pronta, montada pelo WHITE FLEET. */
  texto: string
  organizationId?: string
  organizationSlug?: string
}

export async function POST(request: NextRequest) {
  // ── 1. Autenticação ──────────────────────────────────────────────────────────
  // Chave de organização (wz_live_..., criada pelo código de conexão do WHITE
  // FLEET): a mensagem sai pelo WhatsApp DAQUELA conta e o slug do corpo é
  // ignorado. Chave de ambiente (a própria e a do WHITE TRACKERS): plataforma,
  // sai pelo primeiro número conectado ou pela organização informada.
  const origem = await autenticarChaveApi(request,
    ['RELATORIO_INTEGRATION_API_KEY', 'TRACKER_INTEGRATION_API_KEY'])
  if (!origem) {
    return NextResponse.json({ error: 'API key inválida ou ausente' }, { status: 401 })
  }

  // ── 2. Payload ───────────────────────────────────────────────────────────────
  let payload: RelatorioPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const telefones = [...new Set(
    (payload.telefones ?? []).map(t => String(t).replace(/\D/g, '')).filter(Boolean)
  )]
  const texto = String(payload.texto ?? '').trim()

  if (telefones.length === 0) {
    return NextResponse.json({ error: 'Informe ao menos um telefone' }, { status: 400 })
  }
  if (!texto) {
    return NextResponse.json({ error: 'Informe o texto do relatório' }, { status: 400 })
  }

  const supabase = getSupabase()

  // ── 3. Canal WhatsApp conectado ──────────────────────────────────────────────
  let orgId = origem.organizationId ?? payload.organizationId ?? null
  if (!orgId && payload.organizationSlug) {
    const { data: org } = await supabase
      .from('organizations').select('id').eq('slug', payload.organizationSlug).maybeSingle()
    if (!org) {
      return NextResponse.json(
        { error: `Organização não encontrada (slug: ${payload.organizationSlug})` },
        { status: 404 })
    }
    orgId = org.id
  }

  const canal = await canalWhatsappDaOrg(orgId)
  if (!canal) {
    return NextResponse.json(
      { error: 'O WhatsApp está desconectado: nenhuma instância aberta. Reconecte o número no WHITE ZAP.' },
      { status: 503 })
  }

  const credentials = canal.credentials as Record<string, string>
  const organizationId = canal.organization_id

  // ── 4. Um por um ─────────────────────────────────────────────────────────────
  const falhas: { telefone: string; erro: string }[] = []
  let enviados = 0

  for (const phone of telefones) {
    try {
      let contactId: string
      const { data: existente } = await supabase
        .from('contacts').select('id')
        .eq('organization_id', organizationId)
        .eq('channel_type', 'whatsapp')
        .eq('external_id', phone)
        .maybeSingle()

      if (existente) {
        contactId = existente.id
      } else {
        const { data: novo, error: contatoErr } = await supabase
          .from('contacts')
          .insert({
            organization_id: organizationId,
            external_id: phone,
            channel_type: 'whatsapp',
            name: phone,
            phone,
            tags: ['rastreamento', 'relatorio'],
          })
          .select('id')
          .single()
        if (!novo) throw new Error(contatoErr?.message ?? 'falha ao criar contato')
        contactId = novo.id
      }

      const conv = await findOrCreateOpenConversation(supabase, {
        organizationId,
        contactId,
        channelId: canal.id,
        agentId: canal.agent_id,
        // `human`, não `ai`: relatório é entrega, não conversa. Deixar o agente
        // responder faria a IA comentar a planilha do cliente por conta própria.
        mode: 'human',
      })
      if (!conv) throw new Error('falha ao abrir conversa')

      await supabase.from('messages').insert({
        conversation_id: conv.id,
        organization_id: organizationId,
        role: 'assistant',
        content: texto,
        content_type: 'text',
        sender_type: 'relatorio_alert',
      })
      await supabase.from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conv.id)

      if (credentials.provider === 'meta' || credentials.phoneNumberId) {
        const adapter = new MetaCloudWhatsAppAdapter(
          credentials.phoneNumberId, credentials.accessToken)
        await adapter.sendMessage({
          channelType: 'whatsapp',
          channelIdentifier: credentials.phoneNumberId,
          recipientExternalId: phone,
          contentType: 'text',
          text: texto,
        })
      } else {
        const adapter = new EvolutionWhatsAppAdapter(
          process.env.EVOLUTION_API_URL!, process.env.EVOLUTION_API_KEY!,
          credentials.instanceName)
        await adapter.sendMessage({
          channelType: 'whatsapp',
          channelIdentifier: credentials.instanceName,
          recipientExternalId: phone,
          contentType: 'text',
          text: texto,
        })
      }

      enviados++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[relatorio-alert] ${phone}:`, msg)
      falhas.push({ telefone: phone, erro: msg })
    }
  }

  console.log(`[relatorio-alert] enviados ${enviados}/${telefones.length}`)

  // 200 mesmo com falhas parciais: quem chamou precisa do detalhe por número,
  // e um status de erro esconderia os que foram entregues.
  return NextResponse.json({ ok: enviados > 0, enviados, falhas })
}
