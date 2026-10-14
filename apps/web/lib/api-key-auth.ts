import { createHash, randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { EvolutionWhatsAppAdapter } from '@zapagent/channel-adapters'

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

// Sem 0/O, 1/I/L: o código é lido na tela e digitado em outro sistema.
const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/**
 * Código de conexão (WZ-XXXX-XXXX): 8 caracteres de 31 possíveis, uso único,
 * 24 h. Curto para digitar, e o uso único + prazo é o que o protege.
 */
export function gerarCodigoConexao(): string {
  const b = randomBytes(8)
  const c = Array.from(b, x => ALFABETO_CODIGO[x % ALFABETO_CODIGO.length]).join('')
  return `WZ-${c.slice(0, 4)}-${c.slice(4)}`
}

/** Normaliza o que a pessoa digitou: maiúsculas, sem espaço, com os hífens. */
export function normalizarCodigoConexao(digitado: string): string | null {
  const so = digitado.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^WZ/, '')
  if (so.length !== 8) return null
  return `WZ-${so.slice(0, 4)}-${so.slice(4)}`
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
 *
 * `status = connected` é o que o banco lembra, não o estado do WhatsApp: uma
 * instância Evolution que caiu continua "connected" aqui e o envio volta 500
 * do gateway (06/10/2026: a instância "Teste Luiz Marques", fechada, era a
 * escolhida e toda mensagem do WHITE FLEET falhava). Por isso pergunta ao
 * gateway e devolve a primeira instância realmente aberta. Canal Meta não tem
 * sessão a cair.
 */
export async function canalWhatsappDaOrg(organizationId: string | null) {
  const supabase = admin()

  let query = supabase
    .from('channels')
    // channels não tem coluna `name`: pedir ela fazia a consulta falhar calada e
    // devolver "sem WhatsApp" para todo mundo (06/10–14/10/2026, nada saiu).
    .select('id, organization_id, agent_id, credentials, type, status')
    .eq('type', 'whatsapp')
    .eq('status', 'connected')
    .order('created_at', { ascending: true })

  if (organizationId) query = query.eq('organization_id', organizationId)

  const { data, error } = await query
  if (error) throw new Error(`Falha ao ler os canais de WhatsApp: ${error.message}`)
  for (const c of data ?? []) {
    const cred = (c.credentials ?? {}) as Record<string, string>
    if (cred.provider === 'meta' || cred.phoneNumberId) return c
    const estado = await new EvolutionWhatsAppAdapter(
      process.env.EVOLUTION_API_URL!, process.env.EVOLUTION_API_KEY!, cred.instanceName,
    ).getConnectionState().catch(() => 'close' as const)
    if (estado === 'open') return c
  }
  return null
}

/** Número que está enviando, lido do próprio WhatsApp quando possível. */
export async function numeroDoCanal(canal: any): Promise<string | null> {
  const cred = (canal?.credentials ?? {}) as Record<string, string>
  const salvo = cred.number ?? cred.phoneNumber ?? cred.phone ?? null
  if (salvo || cred.provider === 'meta' || cred.phoneNumberId) return salvo
  try {
    const r = await fetch(
      `${process.env.EVOLUTION_API_URL}/instance/fetchInstances?instanceName=${encodeURIComponent(cred.instanceName)}`,
      { headers: { apikey: process.env.EVOLUTION_API_KEY! }, signal: AbortSignal.timeout(8000) })
    const j = await r.json()
    const inst = Array.isArray(j) ? j[0] : j
    const jid: string | undefined = inst?.ownerJid ?? inst?.instance?.owner
    return jid ? jid.split('@')[0].split(':')[0] : null
  } catch {
    return null
  }
}

/** Número/instância que o cliente vê no handshake, para não enviar pelo canal errado. */
export function descreverCanal(canal: any): { instancia: string | null; numero: string | null } {
  const cred = (canal?.credentials ?? {}) as Record<string, string>
  return {
    instancia: cred.instanceName ?? cred.phoneNumberId ?? null,
    numero: cred.number ?? cred.phoneNumber ?? cred.phone ?? null,
  }
}
