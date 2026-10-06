/**
 * POST /api/integrations/conectar
 *
 * Troca um código de conexão (WZ-XXXX-XXXX, gerado em Configurações ›
 * Integrações) por uma chave de API da organização que gerou o código.
 *
 * Quem chama é o WHITE FLEET (servidor), autenticado com a chave de plataforma
 * de ambiente. Ele guarda a chave devolvida e, daí em diante, manda as
 * mensagens daquela conta com ela: o relatorio-alert resolve a organização pela
 * chave, e a mensagem sai pelo WhatsApp do cliente.
 *
 * Corpo: { codigo, conta } — `conta` é como o WHITE FLEET identifica quem
 * conectou ("WF-1A2B3C4D · AGM3 LOCACAO"); aparece na lista de conexões e no
 * nome da chave, para o cliente saber o que revogar.
 *
 * Resposta: { chave, organizacao: { id, nome }, numero }. A chave só aparece
 * aqui, uma vez.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  autenticarChaveApi, canalWhatsappDaOrg, gerarChave, hashDaChave, normalizarCodigoConexao, numeroDoCanal,
} from '@/lib/api-key-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const origem = await autenticarChaveApi(request,
    ['RELATORIO_INTEGRATION_API_KEY', 'TRACKER_INTEGRATION_API_KEY'])
  // Só a plataforma troca código: uma chave de cliente não pode gerar outras.
  if (!origem || origem.tipo !== 'env') {
    return NextResponse.json({ error: 'API key inválida ou ausente' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as { codigo?: string; conta?: string }
  const codigo = normalizarCodigoConexao(String(body.codigo ?? ''))
  const conta = String(body.conta ?? '').trim().slice(0, 80) || 'WHITE FLEET'
  if (!codigo) {
    return NextResponse.json({ error: 'Código inválido. O formato é WZ-XXXX-XXXX.' }, { status: 400 })
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: cc } = await supabase
    .from('connection_codes')
    .select('id, organization_id, expires_at, used_at')
    .eq('code_hash', hashDaChave(codigo))
    .maybeSingle()

  if (!cc) return NextResponse.json({ error: 'Código não encontrado. Gere um novo no WHITE ZAP.' }, { status: 404 })
  if (cc.used_at) return NextResponse.json({ error: 'Este código já foi usado. Gere um novo no WHITE ZAP.' }, { status: 409 })
  if (new Date(cc.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Código vencido (vale 24 horas). Gere um novo no WHITE ZAP.' }, { status: 410 })
  }

  // Marca como usado ANTES de criar a chave, e só se ninguém marcou antes:
  // duas chamadas com o mesmo código não podem gerar duas chaves.
  const { data: reservado } = await supabase
    .from('connection_codes')
    .update({ used_at: new Date().toISOString(), used_by: conta })
    .eq('id', cc.id).is('used_at', null)
    .select('id').maybeSingle()
  if (!reservado) return NextResponse.json({ error: 'Este código já foi usado.' }, { status: 409 })

  const { chave, prefixo, hash } = gerarChave()
  const { data: key, error: keyErr } = await supabase
    .from('api_keys')
    .insert({
      organization_id: cc.organization_id,
      name: `WHITE FLEET: ${conta}`.slice(0, 60),
      key_prefix: prefixo,
      key_hash: hash,
      scopes: ['relatorio-alert'],
    })
    .select('id').single()
  if (keyErr || !key) {
    // Devolve o código para a pessoa tentar de novo sem gerar outro.
    await supabase.from('connection_codes').update({ used_at: null, used_by: null }).eq('id', cc.id)
    return NextResponse.json({ error: 'Não foi possível criar a chave. Tente de novo.' }, { status: 500 })
  }
  await supabase.from('connection_codes').update({ api_key_id: key.id }).eq('id', cc.id)

  const [{ data: org }, canal] = await Promise.all([
    supabase.from('organizations').select('id, name').eq('id', cc.organization_id).single(),
    canalWhatsappDaOrg(cc.organization_id),
  ])

  return NextResponse.json({
    chave,
    organizacao: { id: org?.id ?? cc.organization_id, nome: org?.name ?? null },
    numero: canal ? await numeroDoCanal(canal) : null,
    whatsappConectado: !!canal,
  })
}
