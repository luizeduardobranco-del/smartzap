/**
 * Robô de ABASTECIMENTO (Ativa Rio) — escuta de grupo dedicado.
 *
 * O motorista manda no grupo as fotos de PLACA, TACÓGRAFO (odômetro), BOMBA (litros+valor)
 * e NOTA FISCAL (produto). Aqui classificamos + lemos cada imagem e mandamos os campos +
 * a foto para o Rotograma (action='abast-grupo'), que junta tudo e grava em rg_abastecimentos.
 *
 * Escopo: env ABASTECIMENTO_GROUP_JIDS (lista de JIDs …@g.us).
 */

import { lerChaveCodigoBarras, lerChaveEmBlocos } from './garagem-nf'

/** A mensagem de grupo é do abastecimento? (grupo no escopo). */
export function grupoAbastecimentoNoEscopo(groupJid: string | undefined): boolean {
  const jids = (process.env.ABASTECIMENTO_GROUP_JIDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return !!groupJid && jids.includes(groupJid)
}

const CLASSIF_PROMPT = `Você recebe UMA foto enviada num grupo de WhatsApp de controle de ABASTECIMENTO de caminhões.
Classifique a foto em UM tipo e leia os dados. Responda APENAS JSON:
{
  "tipo": "placa" | "tacografo" | "bomba" | "nota_fiscal" | "outro",
  "placa": string|null,      // placa do veículo (ABC1D23 ou ABC1234). Vem na foto de PLACA E TAMBÉM no rodapé da NOTA FISCAL de combustível (campo "PLACA"). As 3 PRIMEIRAS posições são SEMPRE letras, nunca número (0→O, 1→I, 5→S, 2→Z, 6→G, 8→B).
  "odometro": string|null,   // hodômetro/KM do veículo. Transcreva EXATAMENTE como está no visor, INCLUSIVE A CASA DECIMAL (ex.: "1064.6", "281297,6"). Muitos tacógrafos mostram os décimos em fundo/cor diferente ou em dígito menor — ELES FAZEM PARTE DO NÚMERO e não podem ser colados nos inteiros. Vem no painel/TACÓGRAFO E TAMBÉM no rodapé da NOTA FISCAL (campo "ODOMETRO" ou "KM").
  "litros": number|null,     // se BOMBA ou NOTA: litros abastecidos (ponto decimal)
  "valor": number|null,      // se BOMBA ou NOTA: valor total pago em R$ (ponto decimal)
  "produto": string|null,    // se NOTA FISCAL/cupom: combustível. Use um destes: "GASOLINA COMUM","GASOLINA ADITIVADA","DIESEL S10","DIESEL S500","ETANOL","GNV","ARLA 32". Se não bater, a melhor leitura.
  "nroNf": string|null,      // se NOTA: número do cupom/NF
  "posto": string|null,      // se NOTA: nome/razão social do posto
  "chaveAcesso": string|null,// se NOTA FISCAL: a CHAVE DE ACESSO de 44 dígitos (perto do código de barras / do texto "CHAVE DE ACESSO" / abaixo do QR code). Transcreva TODOS os 44 números, só dígitos.
  "resumo": string           // 1 linha em pt-BR do que leu
}
Regras: BOMBA = visor da bomba de combustível (mostra litros e valor R$, sem CNPJ/itens). NOTA_FISCAL = cupom/nota fiscal do posto (tem produto, CNPJ, nº). IMPORTANTE: a NOTA FISCAL de combustível quase sempre traz no RODAPÉ a PLACA e o ODOMETRO/KM do veículo — leia-os e preencha "placa" e "odometro" também. TACÓGRAFO = painel/hodômetro com a quilometragem. PLACA = placa do veículo. Não invente; use null quando não houver.`

export interface AbastLeitura {
  tipo: 'placa' | 'tacografo' | 'bomba' | 'nota_fiscal' | 'outro'
  placa?: string | null
  odometro?: string | null
  litros?: number | null
  valor?: number | null
  produto?: string | null
  nroNf?: string | null
  posto?: string | null
  chaveAcesso?: string | null
  resumo?: string
}

// As 3 primeiras posições da placa BR são sempre letras. Corrige dígito→letra lidos por engano
// ali (0→O, 1→I, 5→S…). Só corrige se já houver ao menos uma letra nas 3 primeiras.
const DIG2LET: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '7': 'T', '8': 'B' }
function corrigePlaca(raw: string): string {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s.length !== 7) return String(raw || '').toUpperCase().trim()
  const tres = s.slice(0, 3)
  if (!/[A-Z]/.test(tres)) return s
  return tres.replace(/[0-9]/g, (d) => DIG2LET[d] || d) + s.slice(3)
}

/** Classifica e lê a imagem do abastecimento (GPT-4o vision). */
export async function lerImagemAbastecimento(openaiKey: string, base64: string, mime: string | null): Promise<AbastLeitura | null> {
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o', max_tokens: 400, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CLASSIF_PROMPT },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${mime ?? 'image/jpeg'};base64,${base64}`, detail: 'high' } },
            { type: 'text', text: 'Classifique e leia esta imagem de abastecimento.' },
          ] },
        ],
      }),
    })
    if (!r.ok) return null
    const data = await r.json()
    const p = JSON.parse(data.choices?.[0]?.message?.content || '{}')
    const tipo = ['placa', 'tacografo', 'bomba', 'nota_fiscal', 'outro'].includes(p.tipo) ? p.tipo : 'outro'
    const num = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(/[^\d.,]/g, '').replace(',', '.')); return isNaN(n) ? null : n }
    // Chave de acesso (44 díg.): 1) CÓDIGO DE BARRAS (exato) 2) leitura direta da IA
    // 3) leitura em BLOCOS de 4 dígitos.
    // Antes só tentava quando a IA classificava a foto como 'nota_fiscal' — só que o
    // cupom de posto mostra litros e valor em destaque e é classificado como 'bomba'
    // com facilidade; nesses casos a chave nunca era lida. E o Code128 sozinho não dá
    // conta: a maioria dos cupons (NFC-e) imprime a chave como texto + QR, sem código
    // de barras linear. A leitura em blocos já existia no fluxo da garagem e resolvia
    // justamente isso, mas nunca tinha sido ligada aqui.
    let chave: string | null = null
    const podeSerFiscal = tipo === 'nota_fiscal' || tipo === 'bomba' || !!p.chaveAcesso
    if (podeSerFiscal) {
      chave = await lerChaveCodigoBarras(base64).catch(() => null)
      if (!chave) {
        const d = String(p.chaveAcesso ?? '').replace(/\D/g, '')
        if (d.length === 44) chave = d
      }
      if (!chave) chave = await lerChaveEmBlocos(openaiKey, base64, mime).catch(() => null)
      if (!chave) console.warn('[abast-grupo] chave de acesso NÃO lida', { tipo, iaMandouChave: !!p.chaveAcesso })
    }
    return {
      tipo,
      placa: typeof p.placa === 'string' ? corrigePlaca(p.placa) : null,
      // Preserva o separador decimal: `[^\d]` apagava o ponto/vírgula e transformava
      // 1064,6 km em 10646 km (10× maior). Isso estourava a conferência tacógrafo ×
      // nota no rotograma e travava o abastecimento em 'aberto' para sempre — o robô
      // pedia a foto de novo e a releitura devolvia o mesmo número inflado.
      odometro: p.odometro != null ? (String(p.odometro).replace(/[^\d.,]/g, '').trim() || null) : null,
      litros: num(p.litros), valor: num(p.valor),
      produto: typeof p.produto === 'string' ? p.produto : null,
      nroNf: p.nroNf != null ? String(p.nroNf) : null,
      posto: typeof p.posto === 'string' ? p.posto : null,
      chaveAcesso: chave,
      resumo: typeof p.resumo === 'string' ? p.resumo : '',
    }
  } catch { return null }
}

/** Ação decidida pelo Rotograma: gravado (responde na hora) | incompleto/divergencia (cobra após silêncio). */
export type AbastAcao = 'gravado' | 'incompleto' | 'divergencia'

/** Manda a leitura + a foto para o Rotograma juntar/gravar. Devolve reply + ação + updatedAt. */
export async function enviarAbastecimentoGrupo(payload: {
  grupoJid?: string
  remetente?: string
  remetenteNome?: string | null
  leitura: AbastLeitura
  fotoBase64?: string | null
  fotoMime?: string | null
}): Promise<{ reply?: string; acao?: AbastAcao; updatedAt?: string | null } | void> {
  const baseUrl = (process.env.ROTOGRAMA_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const apiKey = (process.env.GARAGEM_INTEGRATION_API_KEY ?? '').trim()
  if (!baseUrl || !apiKey) { console.warn('[abast-grupo] rotograma não configurado'); return }
  const l = payload.leitura
  try {
    const res = await fetch(`${baseUrl}/api/garagem/nf-extraida`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        action: 'abast-grupo',
        grupoJid: payload.grupoJid, remetente: payload.remetente, remetenteNome: payload.remetenteNome,
        tipo: l.tipo, placa: l.placa, odometro: l.odometro, litros: l.litros, valor: l.valor,
        produto: l.produto, nroNf: l.nroNf, posto: l.posto, chaveAcesso: l.chaveAcesso,
        fotoBase64: payload.fotoBase64, fotoMime: payload.fotoMime,
      }),
    })
    const j = await res.json().catch(() => null)
    if (j?.reply) return { reply: j.reply, acao: j.acao, updatedAt: j.updatedAt ?? null }
  } catch (err) {
    console.error('[abast-grupo] erro:', err instanceof Error ? err.message : err)
  }
}

/** Motorista respondeu CHEIO/PARCIAL no grupo → marca o último abastecimento dele. */
export async function marcarTanqueAbast(remetente: string, cheio: boolean): Promise<{ reply?: string } | void> {
  const baseUrl = (process.env.ROTOGRAMA_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const apiKey = (process.env.GARAGEM_INTEGRATION_API_KEY ?? '').trim()
  if (!baseUrl || !apiKey) return
  try {
    const res = await fetch(`${baseUrl}/api/garagem/nf-extraida`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ action: 'abast-tanque', remetente, cheio }),
    })
    const j = await res.json().catch(() => null)
    if (j?.reply) return { reply: j.reply }
  } catch (err) {
    console.error('[abast-tanque] erro:', err instanceof Error ? err.message : err)
  }
}

/** Estado atual do buffer do remetente (p/ o debounce: só cobra se nada novo chegou). */
export async function statusAbastecimentoGrupo(remetente: string): Promise<{ status: string | null; updatedAt: string | null } | null> {
  const baseUrl = (process.env.ROTOGRAMA_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const apiKey = (process.env.GARAGEM_INTEGRATION_API_KEY ?? '').trim()
  if (!baseUrl || !apiKey) return null
  try {
    const res = await fetch(`${baseUrl}/api/garagem/nf-extraida`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ action: 'abast-grupo-status', remetente }),
    })
    const j = await res.json().catch(() => null)
    if (j) return { status: j.status ?? null, updatedAt: j.updatedAt ?? null }
  } catch { /* ignora */ }
  return null
}
