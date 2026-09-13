/**
 * GET/POST /api/integrations/whoami
 *
 * Handshake da integração: o sistema cliente manda a chave e descobre a quem
 * ela pertence e de qual número as mensagens vão sair.
 *
 * Existe por dois motivos:
 *  1. O lojista precisa de um "Conectar" que dá certo ou erra na hora, em vez
 *     de descobrir que a chave estava errada quando o primeiro pedido não
 *     avisou o cliente.
 *  2. Uma organização pode ter mais de um WhatsApp. Mostrar o número ANTES
 *     evita o clássico: a loja manda mensagem e ela chega com o perfil errado.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autenticarChaveApi, canalWhatsappDaOrg, descreverCanal } from '@/lib/api-key-auth'

export const runtime = 'nodejs'
export const maxDuration = 15

async function handler(request: NextRequest) {
  const origem = await autenticarChaveApi(request, [
    'WHITEERP_INTEGRATION_API_KEY',
  ])

  if (!origem) {
    return NextResponse.json({ error: 'Chave inválida, revogada ou ausente' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let organizacao: { id: string; name: string; slug: string } | null = null
  if (origem.organizationId) {
    const { data } = await supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('id', origem.organizationId)
      .maybeSingle()
    organizacao = data ?? null
  }

  const canal = await canalWhatsappDaOrg(origem.organizationId)
  const { instancia, numero } = descreverCanal(canal)

  return NextResponse.json({
    ok: true,
    tipo: origem.tipo,
    organizacao,
    canal: canal
      ? { id: canal.id, nome: canal.name ?? null, instancia, numero, status: canal.status }
      : null,
    // Sem canal conectado a chave vale, mas nenhuma mensagem sai: o cliente
    // precisa ver isso no momento de conectar, não depois.
    pronto: Boolean(canal),
  })
}

export const GET = handler
export const POST = handler
