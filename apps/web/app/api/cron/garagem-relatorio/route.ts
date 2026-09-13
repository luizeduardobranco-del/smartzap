/**
 * CRON — Relatório periódico de POSIÇÃO DO PÁTIO (garagem Ativa Rio).
 *
 * Busca o texto do relatório no rotograma (action='relatorio-patio') e publica
 * no(s) grupo(s) de WhatsApp da garagem, via Evolution. Pensado para rodar de
 * tempo em tempo (ex.: a cada 2h, das 06h às 20h) por Vercel Cron ou cron externo.
 *
 * Autorização: Vercel Cron envia `Authorization: Bearer ${CRON_SECRET}`. Um cron
 * externo pode chamar `?key=${CRON_SECRET}` (ou header x-cron-key). Se CRON_SECRET
 * não estiver setado, cai no GARAGEM_INTEGRATION_API_KEY.
 *
 * Chave para falar com o rotograma: ROTOGRAMA_CRON_KEY vai no header
 * `x-cron-key` (é a rg_config.garagem_cron_key do rotograma). A antiga
 * GARAGEM_INTEGRATION_API_KEY continua indo em `x-api-key`, mas NÃO pode ser
 * preenchida com a chave de cron: o rotograma rejeita esse valor nesse header
 * (401), e os outros robôs dependem dela estar vazia — do outro lado a
 * comparação vira '' === '' e passa. São chaves diferentes, de propósito.
 *
 * Envs: ROTOGRAMA_BASE_URL, ROTOGRAMA_CRON_KEY, GARAGEM_INTEGRATION_API_KEY, EVOLUTION_API_URL,
 * EVOLUTION_API_KEY, GARAGEM_RELATORIO_GROUP_JIDS (fallback GARAGEM_GROUP_JIDS),
 * GARAGEM_ORG_SLUGS, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function autorizado(req: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET || process.env.GARAGEM_INTEGRATION_API_KEY || '').trim()
  if (!secret) return true // sem secret configurado → não bloqueia (não recomendado)
  const auth = req.headers.get('authorization') || ''
  const key = req.headers.get('x-cron-key') || new URL(req.url).searchParams.get('key') || ''
  return auth === `Bearer ${secret}` || key === secret
}

async function handler(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })

  const baseUrl = (process.env.ROTOGRAMA_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const apiKey = (process.env.GARAGEM_INTEGRATION_API_KEY ?? '').trim()
  const cronKey = (process.env.ROTOGRAMA_CRON_KEY ?? '').trim()
  // Basta UMA das duas: sem chave nenhuma é que não dá para falar com o rotograma.
  if (!baseUrl || (!apiKey && !cronKey)) {
    return NextResponse.json(
      { error: 'rotograma não configurado', detalhe: { baseUrl: !!baseUrl, apiKey: !!apiKey, cronKey: !!cronKey } },
      { status: 500 }
    )
  }

  // Modo: ?tipo=manobristas → só veículos ATIVA RIO, enviado ao grupo dos manobristas.
  const params = new URL(req.url).searchParams
  const tipo = params.get('tipo')
  const manobristas = tipo === 'manobristas'
  const transportadora = manobristas ? 'ATIVA RIO' : (params.get('transportadora') || undefined)

  // Sem isto não dá para saber POR QUE um relatório saiu vazio: o log só
  // mostrava o status HTTP, e um filtro que não casa com nada devolve 200.
  console.log('[garagem-relatorio] pedido', JSON.stringify({
    tipo, transportadora, to: params.get('to'), url: req.url.replace(/([?&]key=)[^&]+/, '$1***'),
  }))

  // 1) Texto do relatório (rotograma é a fonte da verdade).
  const r = await fetch(`${baseUrl}/api/garagem/nf-extraida`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...(cronKey ? { 'x-cron-key': cronKey } : {}),
    },
    body: JSON.stringify({ action: 'relatorio-patio', transportadora }),
  })
  const j = await r.json().catch(() => null)
  if (!r.ok) {
    // 401 aqui é chave errada, não "pátio vazio" — o erro precisa dizer qual é.
    return NextResponse.json(
      { error: `rotograma respondeu ${r.status}`, detalhe: j },
      { status: 502 }
    )
  }
  const texto: string | undefined = j?.texto
  const pdfUrl: string | undefined = j?.pdfUrl
  console.log('[garagem-relatorio] rotograma', JSON.stringify({
    status: r.status, total: j?.total, textoChars: texto?.length ?? 0, temPdf: !!j?.pdfUrl,
  }))
  const destinoCadastrado: string | undefined = j?.destino  // telefone da transportadora (quando filtrado)
  if (!texto) return NextResponse.json({ error: 'sem texto do relatório', detalhe: j }, { status: 502 })

  // 2) Destinos: ?to=<numero> força teste 1:1; senão, se filtrou por transportadora usa o número
  //    CADASTRADO dela; manobristas → grupo próprio; caso geral → grupo padrão.
  const to = params.get('to')
  const grupoEnv = manobristas
    ? (process.env.GARAGEM_MANOBRISTAS_GROUP_JIDS ?? '')
    : (process.env.GARAGEM_RELATORIO_GROUP_JIDS ?? process.env.GARAGEM_GROUP_JIDS ?? '')
  const jids = to
    ? [to.replace(/\D/g, '')]
    : (!manobristas && transportadora && destinoCadastrado) // manobristas SEMPRE vai pro grupo, não pro telefone da ATIVA
      ? [destinoCadastrado.replace(/\D/g, '')]
      : grupoEnv.split(',').map((s) => s.trim()).filter(Boolean)
  if (!jids.length) return NextResponse.json({ error: transportadora ? `transportadora "${transportadora}" sem WhatsApp cadastrado` : `nenhum destino (${manobristas ? 'GARAGEM_MANOBRISTAS_GROUP_JIDS' : 'GARAGEM_RELATORIO_GROUP_JIDS'})` }, { status: 500 })

  const evoUrl = (process.env.EVOLUTION_API_URL || '').trim().replace(/\/+$/, ''), evoKey = process.env.EVOLUTION_API_KEY
  if (!evoUrl || !evoKey) return NextResponse.json({ error: 'Evolution não configurado' }, { status: 500 })

  // 3) Descobre a instância (channelIdentifier) da org da garagem.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const slug = (process.env.GARAGEM_ORG_SLUGS ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0]
  let instanceName = (process.env.GARAGEM_CHANNEL_IDENTIFIER ?? '').trim()
  if (!instanceName && slug) {
    const { data: org } = await supabase.from('organizations').select('id').eq('slug', slug).limit(1)
    const orgId = org?.[0]?.id
    if (orgId) {
      const { data: ch } = await supabase.from('channels').select('credentials').eq('organization_id', orgId).eq('type', 'whatsapp').limit(1)
      instanceName = (ch?.[0]?.credentials as { instanceName?: string } | null)?.instanceName ?? ''
    }
  }
  if (!instanceName) return NextResponse.json({ error: 'instância (channelIdentifier) não encontrada' }, { status: 500 })

  // 4) Publica: resumo em texto + PDF (dashboard) em anexo.
  const adapter = new EvolutionWhatsAppAdapter(evoUrl, evoKey, instanceName)
  const enviarDoc = async (number: string) => {
    if (!pdfUrl) return
    await fetch(`${evoUrl}/message/sendMedia/${instanceName}`, {
      method: 'POST',
      headers: { apikey: evoKey!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, mediatype: 'document', media: pdfUrl, fileName: 'posicao-patio.pdf', caption: '📄 Detalhamento completo — Posição do Pátio' }),
    })
  }
  const enviados: string[] = []
  for (const jid of jids) {
    try {
      await adapter.sendMessage({
        channelType: 'whatsapp', channelIdentifier: instanceName,
        recipientExternalId: jid, contentType: 'text', text: texto,
      })
      await enviarDoc(jid)
      enviados.push(jid)
    } catch (e) {
      console.error('[garagem-relatorio] erro ao enviar para', jid, e instanceof Error ? e.message : e)
    }
  }
  console.log('[garagem-relatorio] enviado', JSON.stringify({ enviados, veiculos: j?.total }))
  return NextResponse.json({ ok: true, enviados, pdf: !!pdfUrl, pdfUrl, veiculos: j?.total })
}

export async function GET(req: NextRequest) { return handler(req) }
export async function POST(req: NextRequest) { return handler(req) }
