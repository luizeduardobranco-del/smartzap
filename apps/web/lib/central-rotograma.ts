/**
 * Central do Motorista (rotograma da Ativa Rio).
 *
 * O robô da operação tem um número próprio no Evolution e fala 1:1 com cada
 * motorista. O WHITE ZAP continua sendo o cérebro (agente, leitura de imagem,
 * transcrição); o rotograma guarda a conversa inteira ligada ao motorista e à
 * viagem, mostra foto e áudio, e deixa a torre assumir e responder pela tela.
 *
 * Aqui só se REPASSA: cada mensagem que entra e cada resposta do robô vão para
 * POST {ROTOGRAMA_BASE_URL}/api/central. A resposta diz se o robô pode falar —
 * quando a torre assumiu no rotograma, o WHITE ZAP fica calado.
 *
 * Liga só para as instâncias listadas em CENTRAL_ROTOGRAMA_INSTANCIAS (separadas
 * por vírgula). Os demais clientes do WHITE ZAP nunca passam por este código.
 *
 * Falha do rotograma não pode calar o robô: sem resposta, segue o fluxo normal.
 *
 * Envs: CENTRAL_ROTOGRAMA_INSTANCIAS, ROTOGRAMA_BASE_URL, GARAGEM_INTEGRATION_API_KEY
 */

export type TipoCentral = 'texto' | 'imagem' | 'audio' | 'documento' | 'localizacao' | 'sistema'

export interface RespostaCentral {
  ok: boolean
  conversaId?: string
  conhecido?: boolean
  roboPodeResponder?: boolean
  sugestao?: string | null
  motorista?: { id: string; nome: string } | null
  viagem?: { id: string; numero: string; status: string } | null
}

const lista = (env: string | undefined) => (env ?? '').split(',').map((s) => s.trim()).filter(Boolean)

/**
 * A conversa é da Central do Motorista? Liga de três jeitos, qualquer um basta:
 *   · pelo AGENTE (o jeito combinado com o Luiz: o robô é o agente Felipe da conta
 *     da Ativa Rio): behavior_config.centralRotograma = true, ou o id do agente em
 *     CENTRAL_ROTOGRAMA_AGENTES. Qualquer chip ligado a esse agente vira canal da central;
 *   · pela instância do Evolution, em CENTRAL_ROTOGRAMA_INSTANCIAS.
 */
export function centralAtiva(
  instancia: string | undefined | null,
  agente?: { id?: string | null; behavior_config?: unknown } | null,
): boolean {
  if (agente?.id && lista(process.env.CENTRAL_ROTOGRAMA_AGENTES).includes(agente.id)) return true
  if ((agente?.behavior_config as { centralRotograma?: boolean } | null)?.centralRotograma === true) return true
  return !!instancia && lista(process.env.CENTRAL_ROTOGRAMA_INSTANCIAS).includes(instancia)
}

/** Chave lida da foto do DANFE (ou digitada) → rotograma grava na viagem do motorista. */
export function enviarNotaCentral(m: { instancia: string; telefone: string; chave: string }) {
  return postar({ acao: 'nota', canal: m.instancia, telefone: m.telefone, chave: m.chave }) as
    Promise<(RespostaCentral & { reply?: string; precisaTorre?: boolean }) | null>
}

function destino(): { url: string; chave: string } | null {
  const base = (process.env.ROTOGRAMA_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const chave = (process.env.GARAGEM_INTEGRATION_API_KEY ?? '').trim()
  if (!base || !chave) return null
  return { url: `${base}/api/central`, chave }
}

async function postar(corpo: Record<string, unknown>): Promise<RespostaCentral | null> {
  const d = destino()
  if (!d) { console.warn('[central] rotograma não configurado'); return null }
  try {
    const r = await fetch(d.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': d.chave },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(15_000),
    })
    const j = await r.json().catch(() => null)
    if (!r.ok) { console.warn('[central] rotograma respondeu', r.status, j?.error); return null }
    return j as RespostaCentral
  } catch (err) {
    console.warn('[central] falha ao repassar:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Mensagem do motorista (com a mídia já baixada do Evolution, quando houver). */
export function repassarEntrada(m: {
  instancia: string
  telefone: string
  nome?: string | null
  tipo: TipoCentral
  texto?: string | null
  externoId?: string
  em?: Date
  midiaBase64?: string | null
  mime?: string | null
  nomeArquivo?: string | null
  latitude?: number | null
  longitude?: number | null
}) {
  return postar({
    acao: 'entrada', direcao: 'entrada', autor: 'motorista',
    canal: m.instancia, telefone: m.telefone, nome: m.nome ?? null,
    tipo: m.tipo, texto: m.texto ?? null, externoId: m.externoId,
    em: m.em ? m.em.toISOString() : null,
    midiaBase64: m.midiaBase64 ?? null, mime: m.mime ?? null, nomeArquivo: m.nomeArquivo ?? null,
    latitude: m.latitude ?? null, longitude: m.longitude ?? null,
  })
}

/**
 * Resposta do robô que acabou de sair pelo número da central. Com tipo
 * 'sistema' vira só um aviso na tela (nada foi mandado ao motorista).
 * precisaTorre: o robô não deu conta — a conversa sobe para a torre e ele se cala.
 */
export function repassarSaida(m: {
  instancia: string
  telefone: string
  texto: string
  externoId?: string
  precisaTorre?: boolean
  tipo?: 'texto' | 'sistema'
}) {
  return postar({
    acao: 'entrada', direcao: 'saida', autor: 'robo', tipo: m.tipo ?? 'texto',
    canal: m.instancia, telefone: m.telefone, texto: m.texto, externoId: m.externoId || undefined,
    precisaTorre: !!m.precisaTorre,
  })
}

/** Completa uma mensagem já gravada: transcrição do áudio, intenção lida pelo robô. */
export function anotarMensagem(m: {
  instancia: string
  externoId: string
  transcricao?: string | null
  intencao?: string | null
}) {
  return postar({
    acao: 'anotar', canal: m.instancia, externoId: m.externoId,
    transcricao: m.transcricao ?? null, intencao: m.intencao ?? null,
  })
}

/** Tipo de conteúdo do WHITE ZAP → tipo da central. */
export function tipoCentral(contentType: string | undefined): TipoCentral {
  switch (contentType) {
    case 'image': return 'imagem'
    case 'audio': return 'audio'
    case 'document': return 'documento'
    case 'location': return 'localizacao'
    default: return 'texto'
  }
}
