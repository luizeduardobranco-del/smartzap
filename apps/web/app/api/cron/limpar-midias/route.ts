/**
 * CRON — apaga as mídias recebidas com mais de 30 dias (bucket `chat-media`).
 *
 * A mensagem continua no histórico (legenda, transcrição do áudio); só o arquivo sai e o
 * `media_url` fica vazio, e o painel mostra "mídia expirada". Roda uma vez por dia e
 * apaga em lotes até acabar ou chegar perto do tempo limite.
 *
 * Autorização: mesma convenção dos outros crons (Bearer CRON_SECRET, x-cron-key ou ?key=).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { BUCKET_MIDIA, PREFIXO_STORAGE, DIAS_RETENCAO_MIDIA, caminhoNoStorage } from '@/lib/midia-recebida'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const LOTE = 200

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

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const limite = new Date(Date.now() - DIAS_RETENCAO_MIDIA * 86_400_000).toISOString()
  const inicio = Date.now()
  let apagadas = 0
  let erros = 0

  while (Date.now() - inicio < 45_000) {
    const { data: lote, error } = await supabase
      .from('messages')
      .select('id, media_url')
      .like('media_url', `${PREFIXO_STORAGE}%`)
      .lt('created_at', limite)
      .limit(LOTE)
    if (error) { console.error('[limpar-midias] consulta:', error.message); erros++; break }
    if (!lote?.length) break

    const caminhos = lote.map((m) => caminhoNoStorage(m.media_url)).filter((c): c is string => !!c)
    const { error: rmErr } = await supabase.storage.from(BUCKET_MIDIA).remove(caminhos)
    if (rmErr) { console.error('[limpar-midias] remover arquivos:', rmErr.message); erros++; break }

    const { error: upErr } = await supabase
      .from('messages')
      .update({ media_url: null })
      .in('id', lote.map((m) => m.id))
    if (upErr) { console.error('[limpar-midias] limpar media_url:', upErr.message); erros++; break }

    apagadas += lote.length
    if (lote.length < LOTE) break
  }

  console.log(`[limpar-midias] ${apagadas} mídias com mais de ${DIAS_RETENCAO_MIDIA} dias apagadas`)
  return NextResponse.json({ ok: erros === 0, apagadas })
}
