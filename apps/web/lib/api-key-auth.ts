import { createHash, randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'

/**
 * Autenticação das integrações por chave de API, uma por organização.
 *
 * Antes, cada integração tinha uma chave no ambiente do servidor e o chamador
 * dizia de qual organização ele era (`organizationSlug` no corpo do POST).
 * Isso é frágil em SaaS: uma chave vazada manda mensagem por QUALQUER canal, e
 * cadastrar cliente novo exigia mexer em variável de ambiente.
 *
 * Aqui a chave É a identidade: quem autentica já chegou como uma organização
 * específica, e não existe parâmetro para dizer o contrário.
 *
 * As chaves de ambiente continuam aceitas (garagem-alert, tracker-alert e os
 * testes dependem delas), mas sem organização embutida — nesse caso o chamador
 * ainda precisa informar o slug.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const PREFIXO = 'wz_live_'

export interface OrigemAutenticada {
  organizationId: string | null
  /** id da linha em api_keys, quando veio de chave de cliente */
  keyId: string | null
  /** 'api_key' (por organização) | 'env' (chave de servidor, legado) */
  tipo: 'api_key' | 'env'
}

export function hashDaChave(chave: string): string {
  return createHash('sha256').update(chave.trim()).digest('hex')
}

/** Gera uma chave nova. O texto puro só existe aqui e na resposta ao cliente. */
export function gerarChave(): { chave: string; prefixo: string; hash: string } {
  const chave = PREFIXO + randomBytes(24).toString('base64url')
  return { chave, prefixo: chave.slice(0, 12), hash: hashDaChave(chave) }
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Resolve o header `x-api-key`.
 *
 * @param chavesDeAmbiente nomes de env aceitos como chave de servidor (legado)
 * @returns a origem autenticada, ou null quando a chave não vale
 */
export async function autenticarChaveApi(
  request: Request,
  chavesDeAmbiente: string[] = []
): Promise<OrigemAutenticada | null> {
  const recebida = request.headers.get('x-api-key')?.trim()
  if (!recebida) return null

  // ── Chave de organização ───────────────────────────────────────────────────
  if (recebida.startsWith(PREFIXO)) {
    const supabase = admin()
    const { data } = await supabase
      .from('api_keys')
      .select('id, organization_id, revoked_at')
      .eq('key_hash', hashDaChave(recebida))
      .maybeSingle()

    if (!data || data.revoked_at) return null

    // Último uso é o que permite o cliente perceber chave esquecida em produção.
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)

    return { organizationId: data.organization_id, keyId: data.id, tipo: 'api_key' }
  }

  // ── Chave de ambiente (integrações antigas) ────────────────────────────────
  for (const nome of chavesDeAmbiente) {
    const esperada = process.env[nome]
    if (esperada && recebida === esperada) {
      return { organizationId: null, keyId: null, tipo: 'env' }
    }
  }

  return null
}

/**
 * Canal de WhatsApp conectado de uma organização — é ele que define de qual
 * número a mensagem sai. Sem organização, pega o primeiro conectado (só
 * acontece com chave de ambiente).
 */
export async function canalWhatsappDaOrg(organizationId: string | null) {
  const supabase = admin()

  let query = supabase
    .from('channels')
    .select('id, organization_id, agent_id, credentials, type, name, status')
    .eq('type', 'whatsapp')
    .eq('status', 'connected')
    .limit(1)

  if (organizationId) query = query.eq('organization_id', organizationId)

  const { data } = await query
  return data?.[0] ?? null
}

/** Número/instância que o cliente vê no handshake, para não enviar pelo canal errado. */
export function descreverCanal(canal: any): { instancia: string | null; numero: string | null } {
  const cred = (canal?.credentials ?? {}) as Record<string, string>
  return {
    instancia: cred.instanceName ?? cred.phoneNumberId ?? null,
    numero: cred.number ?? cred.phoneNumber ?? cred.phone ?? null,
  }
}
