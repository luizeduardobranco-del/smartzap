import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { BUCKET_MIDIA, caminhoNoStorage } from '@/lib/midia-recebida'

export const dynamic = 'force-dynamic'

// Entrega a mídia de uma mensagem para o painel SEM expor o endereço do banco: o arquivo
// passa por aqui (proxy em streaming), nunca há redirecionamento para o Storage, e nenhum
// cabeçalho ou mensagem de erro carrega a URL do Supabase.
//
// - A leitura da mensagem usa o cliente do usuário (RLS): só quem vê a conversa baixa.
// - `Range` é repassado, para o player de áudio/vídeo poder avançar e voltar.
// - `?download=1` força o download (documentos).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: msg } = await supabase
    .from('messages')
    .select('media_url')
    .eq('id', params.id)
    .maybeSingle()
  if (!msg?.media_url) return NextResponse.json({ error: 'Mídia não encontrada' }, { status: 404 })

  const origem = await urlDeOrigem(msg.media_url)
  if (!origem) return NextResponse.json({ error: 'Mídia indisponível' }, { status: 404 })

  const range = req.headers.get('range')
  let up: Response
  try {
    up = await fetch(origem, { headers: range ? { Range: range } : {}, cache: 'no-store' })
  } catch {
    return NextResponse.json({ error: 'Mídia indisponível' }, { status: 502 })
  }
  if (!up.ok || !up.body) {
    // Arquivo apagado (passou dos 30 dias) ou falha no Storage — sem detalhes da origem.
    return NextResponse.json({ error: 'Mídia indisponível' }, { status: 404 })
  }

  const headers = new Headers()
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = up.headers.get(h)
    if (v) headers.set(h, v)
  }
  if (!headers.has('accept-ranges')) headers.set('accept-ranges', 'bytes')
  headers.set('cache-control', 'private, max-age=3600')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'no-referrer')
  if (req.nextUrl.searchParams.get('download') === '1') {
    const nome = (caminhoNoStorage(msg.media_url) ?? '').split('/').pop() || 'arquivo'
    headers.set('content-disposition', `attachment; filename="${nome}"`)
  }

  return new Response(up.body, { status: up.status, headers })
}

// Endereço interno do arquivo (fica só no servidor). Aceita a cópia no bucket privado
// e as URLs públicas do NOSSO Storage (vídeos e folders que o agente envia); qualquer
// outro host é recusado, para a rota não virar proxy aberto.
async function urlDeOrigem(mediaUrl: string): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const caminho = caminhoNoStorage(mediaUrl)
  if (caminho) {
    const admin = createClient(base, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data } = await admin.storage.from(BUCKET_MIDIA).createSignedUrl(caminho, 300)
    return data?.signedUrl ?? null
  }
  try {
    const u = new URL(mediaUrl)
    if (u.origin === new URL(base).origin && u.pathname.startsWith('/storage/v1/object/public/')) return u.toString()
  } catch { /* não é URL */ }
  return null
}
