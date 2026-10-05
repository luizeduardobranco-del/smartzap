// Alerta de desconexão do WhatsApp por WhatsApp.
//
// Quando o número de um cliente cai, o agente para de receber mensagens e
// ninguém fica sabendo até um contato reclamar. Este módulo avisa os telefones
// cadastrados em organizations.settings.alertaDesconexao, saindo de uma
// instância da PLATAFORMA (a do cliente está justamente fora do ar).
//
// Config por organização (settings.alertaDesconexao):
//   { ativo: true, telefones: ['5521999999999'], ultimoAviso?: { [channelId]: iso } }
// ultimoAviso marca o canal que está "devendo" a mensagem de reconexão.
// Remetente: env ALERTA_EVOLUTION_INSTANCE.

import type { SupabaseClient } from '@supabase/supabase-js'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://atendente.whiteerp.com'
// Sem intervalo mínimo de propósito: o handler só chama em mudança de status
// (connected → disconnected), e silenciar uma 2ª queda depois de um "reconectou"
// deixaria o cliente achando que está tudo no ar.

type ConfigAlerta = {
  ativo?: boolean
  telefones?: string[]
  ultimoAviso?: Record<string, string>
}

type Canal = { id: string; organization_id: string; agent_id?: string | null }

function horaBrasilia(d = new Date()) {
  return d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

function soDigitos(tel: string) {
  return tel.replace(/\D/g, '')
}

async function enviarTexto(numero: string, texto: string): Promise<boolean> {
  const instancia = process.env.ALERTA_EVOLUTION_INSTANCE?.trim()
  if (!instancia) {
    console.warn('[alerta-desconexao] ALERTA_EVOLUTION_INSTANCE não configurada, aviso não enviado')
    return false
  }
  const res = await fetch(
    `${process.env.EVOLUTION_API_URL}/message/sendText/${encodeURIComponent(instancia)}`,
    {
      method: 'POST',
      headers: { apikey: process.env.EVOLUTION_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: numero, text: texto }),
    }
  )
  if (!res.ok) {
    console.error(`[alerta-desconexao] envio para ${numero} falhou: HTTP ${res.status}`)
    return false
  }
  return true
}

async function lerConfig(supabase: SupabaseClient, orgId: string) {
  const { data: org } = await supabase
    .from('organizations').select('name, settings').eq('id', orgId).maybeSingle()
  const settings = (org?.settings ?? {}) as Record<string, unknown>
  const cfg = (settings.alertaDesconexao ?? {}) as ConfigAlerta
  return { nomeOrg: (org?.name as string | undefined) ?? 'sua empresa', cfg }
}

async function gravarUltimoAviso(supabase: SupabaseClient, orgId: string, channelId: string, valor: string | null) {
  // Relê settings na hora de gravar: o handler de conexão também escreve channelAlerts.
  const { data: org } = await supabase.from('organizations').select('settings').eq('id', orgId).maybeSingle()
  const settings = (org?.settings ?? {}) as Record<string, unknown>
  const cfg = { ...((settings.alertaDesconexao ?? {}) as ConfigAlerta) }
  const ultimo = { ...(cfg.ultimoAviso ?? {}) }
  if (valor) ultimo[channelId] = valor
  else delete ultimo[channelId]
  await supabase
    .from('organizations')
    .update({ settings: { ...settings, alertaDesconexao: { ...cfg, ultimoAviso: ultimo } } })
    .eq('id', orgId)
}

function linkCanal(canal: Canal) {
  return canal.agent_id ? `${APP_URL}/agents/${canal.agent_id}` : `${APP_URL}/agents`
}

export async function avisarDesconexao(
  supabase: SupabaseClient,
  canal: Canal,
  numeroCanal: string | null
) {
  try {
    const { nomeOrg, cfg } = await lerConfig(supabase, canal.organization_id)
    const telefones = (cfg.telefones ?? []).map(soDigitos).filter(Boolean)
    if (!cfg.ativo || telefones.length === 0) return

    const numero = numeroCanal ? ` (${numeroCanal})` : ''
    const texto =
      `⚠️ Alerta WHITE ZAP\n\n` +
      `O WhatsApp da ${nomeOrg}${numero} desconectou às ${horaBrasilia()}.\n` +
      `Enquanto estiver desconectado, o atendimento automático não recebe nem responde mensagens.\n\n` +
      `Para reconectar, abra o WHITE ZAP e leia o QR code do canal WhatsApp:\n${linkCanal(canal)}`

    let algumEnviado = false
    for (const tel of telefones) {
      if (await enviarTexto(tel, texto)) algumEnviado = true
    }
    if (algumEnviado) {
      await gravarUltimoAviso(supabase, canal.organization_id, canal.id, new Date().toISOString())
      console.log(`[alerta-desconexao] canal ${canal.id}: aviso enviado para ${telefones.length} telefone(s)`)
    }
  } catch (err) {
    console.error('[alerta-desconexao] erro:', err instanceof Error ? err.message : err)
  }
}

export async function avisarReconexao(
  supabase: SupabaseClient,
  canal: Canal,
  numeroCanal: string | null
) {
  try {
    const { nomeOrg, cfg } = await lerConfig(supabase, canal.organization_id)
    const telefones = (cfg.telefones ?? []).map(soDigitos).filter(Boolean)
    // Só confirma a volta de quem recebeu o aviso de queda.
    if (!cfg.ativo || telefones.length === 0 || !cfg.ultimoAviso?.[canal.id]) return

    const numero = numeroCanal ? ` (${numeroCanal})` : ''
    const texto =
      `✅ Alerta WHITE ZAP\n\n` +
      `O WhatsApp da ${nomeOrg}${numero} reconectou às ${horaBrasilia()}. O atendimento automático voltou a funcionar.`

    for (const tel of telefones) await enviarTexto(tel, texto)
    await gravarUltimoAviso(supabase, canal.organization_id, canal.id, null)
  } catch (err) {
    console.error('[alerta-desconexao] erro na reconexão:', err instanceof Error ? err.message : err)
  }
}
