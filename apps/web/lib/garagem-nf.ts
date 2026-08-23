/**
 * Integração WHITE CHAT → Sistema de Rotograma (Ativa Rio) — Nota Fiscal da garagem.
 *
 * Direção REVERSA do garagem-alert: aqui o WHITE CHAT RECEBE a foto da NF que o
 * motorista mandou no WhatsApp, extrai os dados com visão (GPT-4o) e repassa
 * para os endpoints do rotograma:
 *   • POST /api/garagem/nf-extraida  → grava confirmação 'aguardando' + devolve o resumo
 *   • POST /api/garagem/nf-confirmar → recebe o "SIM"/correção do motorista
 *
 * Escopo: só dispara para a(s) organização(ões) da garagem (Ativa Rio), via
 * env GARAGEM_ORG_IDS (lista de organization_id separada por vírgula) ou flag
 * org.settings.garagem.enabled. Para todas as outras orgs é um no-op barato.
 *
 * Config necessária (env do WHITE CHAT):
 *   ROTOGRAMA_BASE_URL           — ex.: https://rotograma.ativario.com.br
 *   GARAGEM_INTEGRATION_API_KEY  — mesma chave usada pelo rotograma (x-api-key)
 *   GARAGEM_ORG_SLUGS            — slugs das orgs com a garagem ligada (ex.: luizmarques-88e7ec83)
 *   GARAGEM_ORG_IDS              — (alternativa) organization_id das orgs, separados por vírgula
 */

type OrgLike = { id?: string; slug?: string | null; settings?: unknown }

import { PRODUTOS_CATALOGO } from './garagem-grupo'

export interface NfFields {
  isNotaFiscal: boolean
  chaveAcesso: string | null
  nfNumero: string | null
  produto: string | null
  quantidade: string | null
  transportadora: string | null
  placaVeiculo: string | null
  placaCavalo: string | null
  placaCarreta: string | null
  dataEmissao: string | null
  horaEmissao: string | null
}

/** A org está habilitada para o fluxo de NF da garagem? Checagem barata. */
export function garagemEnabled(org: OrgLike): boolean {
  const csv = (v: string | undefined) =>
    (v ?? '').split(',').map((s) => s.trim()).filter(Boolean)

  const slugs = csv(process.env.GARAGEM_ORG_SLUGS)
  if (slugs.length && org.slug && slugs.includes(org.slug)) return true

  const ids = csv(process.env.GARAGEM_ORG_IDS)
  if (ids.length && org.id && ids.includes(org.id)) return true

  const s = org.settings as { garagem?: { enabled?: boolean } } | null
  return !!s?.garagem?.enabled
}

function rotogramaConfig() {
  const baseUrl = (process.env.ROTOGRAMA_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const apiKey = (process.env.GARAGEM_INTEGRATION_API_KEY ?? '').trim()
  return { baseUrl, apiKey }
}

async function callRotograma(path: string, body: unknown): Promise<Record<string, unknown> | null> {
  const { baseUrl, apiKey } = rotogramaConfig()
  if (!baseUrl || !apiKey) {
    console.warn('[garagem-nf] ROTOGRAMA_BASE_URL ou GARAGEM_INTEGRATION_API_KEY ausente — pulando')
    return null
  }
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.error('[garagem-nf]', path, 'HTTP', res.status, (await res.text().catch(() => '')).slice(0, 200))
      return null
    }
    return (await res.json()) as Record<string, unknown>
  } catch (err) {
    console.error('[garagem-nf] erro chamando', path, err instanceof Error ? err.message : err)
    return null
  }
}

const NF_PROMPT = `Você analisa a imagem enviada por um motorista de caminhão no WhatsApp.
Decida se é uma NOTA FISCAL (DANFE/NF-e) de transporte de carga. Extraia os campos quando existirem.
Responda APENAS um objeto JSON com exatamente estas chaves:
{
  "isNotaFiscal": boolean,        // true só se for claramente uma nota fiscal
  "chaveAcesso": string|null,     // a CHAVE DE ACESSO de 44 dígitos (fica no campo "CHAVE DE ACESSO", logo abaixo do código de barras). Transcreva TODOS os 44 dígitos, só números.
  "nfNumero": string|null,        // número da DANFE/NF-e (campo "Nº" / "NÚMERO", só dígitos, sem pontos)
  "produto": string|null,         // Identifique o produto e retorne EXATAMENTE um destes nomes padronizados quando corresponder (a NF traz descrição longa — mapeie p/ o nome curto): ${PRODUTOS_CATALOGO.join(' | ')}. Ex.: "ÓLEO BAS NEUTRO LEVE-PML-30"→"NEUTRO LEVE"; "CHEVRON NEUTRAL OIL 220R"→"CHEVRON 220R"; "...3043..."→"NEXBASE 3043". Se não bater com nenhum, retorne a melhor leitura.
  "quantidade": string|null,      // QUANTIDADE do produto — coluna "QTD"/"QUANTIDADE" no quadro DADOS DOS PRODUTOS/SERVIÇOS. NÃO confunda com as colunas vizinhas "VALOR UNITÁRIO"/"VL. UNIT" nem "VALOR TOTAL". Inclua a unidade se houver (ex.: "43854", "30000 KG").
  "transportadora": string|null,  // nome da transportadora (quadro "TRANSPORTADOR / VOLUMES TRANSPORTADOS"); se ausente, o emitente
  "placaVeiculo": string|null,    // transcreva EXATAMENTE o conteúdo do campo "PLACA DO VEÍCULO" (quadro TRANSPORTADOR), mantendo a ORDEM e a barra. Costuma ter DUAS placas no padrão CARRETA/CAVALO, ex.: "RDW1I19 / KWC6H62". Transcreva os 7 caracteres de cada placa com o máximo de cuidado (cuidado com I×1, O×0, B×8, G×6, Z×2). REGRA: as 3 PRIMEIRAS posições de toda placa são SEMPRE letras, nunca número — se enxergar dígito ali é erro (0→O, 1→I, 5→S, 2→Z, 6→G, 8→B).
  "placaCavalo": string|null,     // a placa do CAVALO = a SEGUNDA placa do campo PLACA DO VEÍCULO (depois da "/"). Se só houver uma placa, é ela.
  "placaCarreta": string|null,    // a placa da CARRETA = a PRIMEIRA placa do campo PLACA DO VEÍCULO (antes da "/"). null se só houver uma placa.
  "dataEmissao": string|null,     // data de emissão da NF no formato DD/MM/AAAA
  "horaEmissao": string|null      // hora de emissão/saída no formato HH:MM (24h)
}
Não invente dados: se um campo não aparecer, use null. Não escreva nada fora do JSON.`

// Placa BR válida: ABC1234 (antiga) ou ABC1D23 (Mercosul). Usado para descartar
// leituras malformadas (ex.: "QPDI43A") que o modelo às vezes inventa.
const PLACA_RE = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/
// As 3 primeiras posições da placa BR são sempre letras. Corrige dígito→letra lidos por engano
// ali (0→O, 1→I, 5→S…). Só corrige se já houver ao menos uma letra nas 3 primeiras.
const DIG2LET: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '7': 'T', '8': 'B' }
function corrigePlaca(raw: string): string {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s.length !== 7) return s
  const tres = s.slice(0, 3)
  if (!/[A-Z]/.test(tres)) return s
  return tres.replace(/[0-9]/g, (d) => DIG2LET[d] || d) + s.slice(3)
}
function placaValida(v: unknown): string | null {
  const n = corrigePlaca((typeof v === 'string' ? v : '').toUpperCase().replace(/[^A-Z0-9]/g, ''))
  return PLACA_RE.test(n) ? n : null
}

/** Extrai os campos da NF a partir da imagem (base64) usando visão GPT-4o. */
export async function extractNf(openaiKey: string, base64: string, mime: string | null): Promise<NfFields | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: NF_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mime ?? 'image/jpeg'};base64,${base64}`, detail: 'high' } },
              { type: 'text', text: 'Extraia os dados da nota fiscal desta imagem.' },
            ],
          },
        ],
      }),
    })
    if (!res.ok) {
      console.error('[garagem-nf] extractNf HTTP', res.status)
      return null
    }
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<NfFields>
    const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

    const placaVeiculo = clean(parsed.placaVeiculo)
    let placaCavalo = placaValida(parsed.placaCavalo)
    let placaCarreta = placaValida(parsed.placaCarreta)
    // O campo PLACA DO VEÍCULO vem como CARRETA/CAVALO (1ª = carreta, 2ª = cavalo).
    // Derivamos a atribuição pela transcrição bruta do campo — determinístico e
    // mais confiável que a rotulagem do modelo (que às vezes inverte as duas).
    if (placaVeiculo) {
      const toks = (placaVeiculo.toUpperCase().replace(/[^A-Z0-9]/g, ' ').match(/[A-Z0-9]{7}/g) || [])
        .map(corrigePlaca)
        .filter((t) => PLACA_RE.test(t))
      if (toks.length >= 2) { placaCarreta = toks[0]; placaCavalo = toks[1] }
      else if (toks.length === 1 && !placaCavalo) { placaCavalo = toks[0] }
    }

    return {
      isNotaFiscal: !!parsed.isNotaFiscal,
      chaveAcesso: clean(parsed.chaveAcesso)?.replace(/\D/g, '') || null,
      nfNumero: clean(parsed.nfNumero)?.replace(/\D/g, '') || null,
      produto: clean(parsed.produto),
      quantidade: clean(parsed.quantidade),
      transportadora: clean(parsed.transportadora),
      placaVeiculo,
      placaCavalo,
      placaCarreta,
      dataEmissao: clean(parsed.dataEmissao),
      horaEmissao: clean(parsed.horaEmissao),
    }
  } catch (err) {
    console.error('[garagem-nf] extractNf erro:', err instanceof Error ? err.message : err)
    return null
  }
}

// Leitura da CHAVE pelo CÓDIGO DE BARRAS (Code-128) da DANFE — 100% exata quando
// decodifica. Usa jimp (decodifica a imagem) + @zxing/library (lê o Code-128).
export async function lerChaveCodigoBarras(base64: string): Promise<string | null> {
  try {
    const JimpMod: any = await import('jimp')
    const Jimp: any = JimpMod.default || JimpMod
    const { Code128Reader, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer } = await import('@zxing/library')
    const img = await Jimp.read(Buffer.from(base64, 'base64'))
    if (img.bitmap.width > 2200) img.resize(2200, Jimp.AUTO)
    const flat = new Jimp(img.bitmap.width, img.bitmap.height, 0xFFFFFFFF) // achata sobre branco (caso alpha)
    flat.composite(img, 0, 0).greyscale()
    const { data, width, height } = flat.bitmap
    const lum = new Uint8ClampedArray(width * height)
    for (let i = 0; i < width * height; i++) lum[i] = data[i * 4]
    const hints = new Map(); hints.set(DecodeHintType.TRY_HARDER, true)
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, width, height)))
    const chave = new Code128Reader().decode(bitmap, hints).getText().replace(/\D/g, '')
    return chave.length === 44 ? chave : null
  } catch { return null }
}

// 2ª tentativa de leitura da CHAVE DE ACESSO: lê os 11 GRUPOS de 4 dígitos
// (como impresso na DANFE) separadamente — bem mais confiável que a string de 44.
export async function lerChaveEmBlocos(openaiKey: string, base64: string, mime: string | null): Promise<string | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o', max_tokens: 200, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Na imagem de uma DANFE (nota fiscal eletrônica), localize a CHAVE DE ACESSO — os números logo ABAIXO do código de barras, impressos em 11 GRUPOS de 4 dígitos (44 no total). Leia GRUPO POR GRUPO, com muita atenção (0×O, 1×I, 5×S, 8×B, 2×Z). Responda APENAS JSON: {"blocos":["1234","5678", ...]} com os 11 grupos exatamente como aparecem, só dígitos.' },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${mime ?? 'image/jpeg'};base64,${base64}`, detail: 'high' } },
            { type: 'text', text: 'Leia a chave de acesso grupo por grupo.' },
          ] },
        ],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}')
    const chave = Array.isArray(parsed.blocos) ? parsed.blocos.join('').replace(/\D/g, '') : ''
    return chave.length === 44 ? chave : null
  } catch { return null }
}

/**
 * Trata uma IMAGEM recebida na org da garagem. Se for NF, extrai e registra no
 * rotograma, devolvendo o texto-resumo para o motorista confirmar.
 * Retorna null quando NÃO é nota fiscal (deixa o fluxo normal de visão seguir).
 */
export async function handleGaragemNfImage(args: {
  openaiKey: string
  base64: string
  mime: string | null
  telefone: string
  conversationId?: string
}): Promise<{ reply: string } | null> {
  const fields = await extractNf(args.openaiKey, args.base64, args.mime)
  if (!fields || !fields.isNotaFiscal) return null

  // CHAVE DE ACESSO em 3 camadas (da mais exata p/ a mais tolerante):
  //   1) CÓDIGO DE BARRAS (Code-128) — 100% exato quando decodifica;
  //   2) leitura direta da IA (44 díg.);
  //   3) leitura em GRUPOS de 4 dígitos. Com a chave, usa a via OFICIAL (Meu Danfe).
  let chave = await lerChaveCodigoBarras(args.base64)
  if (!chave && fields.chaveAcesso && fields.chaveAcesso.length === 44) chave = fields.chaveAcesso
  if (!chave) chave = await lerChaveEmBlocos(args.openaiKey, args.base64, args.mime)

  if (chave) {
    const oficial = await callRotograma('/api/garagem/nf-extraida', {
      action: 'agendar-chave', chave, telefone: args.telefone,
      // foto da NF enviada no grupo/privado — anexada ao agendamento p/ auditoria futura
      fotoBase64: args.base64, fotoMime: args.mime,
    })
    // Releitura da MESMA NF sem mudança de estado (o webhook do Evolution reenvia por
    // timeout e reprocessa): o agendamento já foi confirmado antes → NÃO republica no
    // grupo, senão sai "Agendamento registrado" várias vezes para o mesmo veículo.
    if (oficial?.jaRegistrado) return null
    const summaryOf = oficial?.summary
    if (typeof summaryOf === 'string' && summaryOf.trim()) return { reply: summaryOf }
    return {
      reply: '📸 Recebi a nota, mas não consegui consultá-la agora. Tente reenviar em instantes.',
    }
  }

  // Não conseguiu ler a chave (nem direta, nem em blocos) → oferece digitar/colar.
  return {
    reply:
      '⚠️ Não consegui ler a *chave de acesso* desta nota.\n\n' +
      'Você pode resolver de dois jeitos:\n' +
      '1️⃣ *Reenviar a foto* enquadrando só a *CHAVE DE ACESSO* (os 44 números abaixo do código de barras); ou\n' +
      '2️⃣ *Digitar ou colar a CHAVE DE ACESSO* (os 44 números) aqui na conversa — eu registro na hora. 🙏',
  }
}

/**
 * Trata uma resposta de TEXTO na org da garagem. Repassa ao rotograma para casar
 * com uma confirmação de NF pendente daquele telefone.
 * Retorna null quando NÃO há NF aguardando (deixa o agente normal responder).
 */
// Extrai os campos digitados no formulário de contingência (quando a consulta da NF falha).
function parseDadosManuais(t: string) {
  const g = (re: RegExp) => { const m = t.match(re); return m ? m[1].trim() : '' }
  return {
    chave: g(/chave\s*:?\s*([0-9\s]{20,})/i).replace(/\D/g, ''),
    nfNumero: g(/\bNF\s*:?\s*([0-9]{2,})/i),
    placaCavalo: g(/placa\s*cavalo\s*:?\s*([A-Za-z0-9-]{6,8})/i),
    placaCarreta: g(/placa\s*carreta\s*:?\s*([A-Za-z0-9-]{6,8})/i),
    produto: g(/produto\s*:?\s*([^\n\r]+)/i),
    quantidade: g(/quantidade\s*:?\s*([0-9.,]+\s*[A-Za-z]{0,4})/i),
    transportadora: g(/transportadora\s*:?\s*([^\n\r]+)/i),
    motorista: g(/motorista\s*:?\s*([^\n\r]+)/i),
  }
}

export async function handleGaragemNfText(args: {
  telefone: string
  texto: string
}): Promise<{ reply: string } | null> {
  const t = args.texto || ''
  // CHAVE DE ACESSO digitada/colada (44 dígitos) — quando a foto não leu a chave.
  const soDigitos = t.replace(/\D/g, '')
  if (soDigitos.length === 44) {
    const oficial = await callRotograma('/api/garagem/nf-extraida', { action: 'agendar-chave', chave: soDigitos, telefone: args.telefone })
    const s = oficial?.summary
    if (typeof s === 'string' && s.trim()) return { reply: s }
  }
  // CONTINGÊNCIA: dados digitados manualmente (o texto tem o formato do formulário).
  if (/placa\s*cavalo\s*:/i.test(t) || (/\bNF\s*:/i.test(t) && /(placa|produto)\s*:/i.test(t))) {
    const campos = parseDadosManuais(t)
    if (campos.nfNumero || campos.placaCavalo || campos.chave) {
      const man = await callRotograma('/api/garagem/nf-extraida', { action: 'agendar-manual', telefone: args.telefone, ...campos })
      const s = man?.summary
      if (typeof s === 'string' && s.trim()) return { reply: s }
    }
  }

  const out = await callRotograma('/api/garagem/nf-confirmar', {
    telefone: args.telefone,
    texto: args.texto,
  })
  if (!out || out.hasPending !== true) return null // sem NF pendente → agente normal

  // O rotograma é a fonte da verdade do diálogo de confirmação: confirmar,
  // aplicar correção por texto (placa/NF) ou pedir o dado certo — tudo já vem
  // pronto no campo `reply`.
  if (typeof out.reply === 'string' && out.reply.trim()) {
    return { reply: out.reply }
  }

  return null
}
