/**
 * Integração WHITE CHAT → Rotograma (Ativa Rio) — ESCUTA DE GRUPO (modo teste).
 *
 * Objetivo desta fase: apenas CAPTURAR e REGISTRAR tudo que chega nos grupos
 * monitorados (texto, transcrição de áudio, leitura de imagem placa/NF) — SEM
 * responder no grupo. Serve para validar que estamos lendo tudo corretamente.
 *
 * Escopo: só dispara para a org da garagem (mesma flag garagemEnabled do garagem-nf).
 * Config (env WHITE CHAT): ROTOGRAMA_BASE_URL, GARAGEM_INTEGRATION_API_KEY.
 * Opcional: GARAGEM_GROUP_JIDS = lista de JIDs (…@g.us) a monitorar; se vazio,
 * durante o teste monitora TODOS os grupos da org (para descobrir os JIDs).
 */

/** A msg de grupo deve ser capturada? (org habilitada + grupo no escopo). */
export function grupoNoEscopo(groupJid: string | undefined): boolean {
  const jids = (process.env.GARAGEM_GROUP_JIDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!jids.length) return true // fase de teste: sem lista → aceita todos p/ descobrir os JIDs
  return !!groupJid && jids.includes(groupJid)
}

function rotogramaConfig() {
  return {
    baseUrl: (process.env.ROTOGRAMA_BASE_URL ?? '').trim().replace(/\/+$/, ''),
    apiKey: (process.env.GARAGEM_INTEGRATION_API_KEY ?? '').trim(),
  }
}

/** Transcreve áudio (nota de voz) em português via Whisper. */
export async function transcreverAudioGrupo(openaiKey: string, base64: string, mime: string | null): Promise<string | null> {
  try {
    const bytes = Buffer.from(base64, 'base64')
    const fd = new FormData()
    fd.append('file', new Blob([bytes], { type: mime ?? 'audio/ogg' }), 'audio.ogg')
    fd.append('model', 'whisper-1')
    fd.append('language', 'pt')
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${openaiKey}` }, body: fd,
    })
    if (!r.ok) return null
    const { text } = await r.json()
    return text?.trim() || null
  } catch { return null }
}

// Catálogo oficial de produtos (Iconic). O modelo deve mapear a descrição longa
// da NF para um destes nomes curtos — corrige o produto mesmo com OCR ruim.
/**
 * Produtos que realmente passam pelo pátio (conferido contra rg_garagem_programacao
 * em 17/08/2026). Manter completo é questão de segurança, não de capricho: o que
 * falta aqui o modelo não consegue nomear, e um produto sem nome já virou carro
 * errado enviado ao cliente — foi o caso do NH140, que não estava nesta lista.
 * Ao ver um produto novo chegando nas notas, acrescente-o aqui.
 */
export const PRODUTOS_CATALOGO = [
  'NEXBASE 3030', 'NEXBASE 3043', 'NEXBASE 3050', 'NEXBASE 3060', 'NEXBASE 3080',
  'NEUTRO LEVE', 'NEUTRO PESADO', 'BRIGHT STOCK', 'NYNAS T 110', 'HYGOLD 60',
  'HYGOLD P150BS', 'CHEVRON 220R', 'CHEVRON 600R', 'CHEVRON 60R', 'CHEVRON 100R',
  'PRIMA 220', 'PRIMA 600', 'ULTRA 4', 'ULTRA 8', 'ULTRA S-OIL 4', 'ULTRA S-OIL 8',
  'OLEO BASICO NH10', 'OLEO BASICO NH20', 'OLEO BASICO NH140',
  'INFINEUM D3416', 'INFINEUM D3513', 'IBO SN 150', 'DIESEL S10',
]

const CLASSIF_PROMPT = `Você recebe uma imagem enviada num grupo de WhatsApp de uma garagem de caminhões.
Classifique e leia. Responda APENAS JSON:
{
  "tipo": "placa" | "nota_fiscal" | "outro",
  "placas": string[],   // placas de veículo lidas (formato ABC1D23/ABC1234); [] se não houver. REGRA: as 3 PRIMEIRAS posições da placa são SEMPRE letras, NUNCA número. Se enxergar um dígito ali, é erro de leitura — use a letra correspondente (0→O, 1→I, 5→S, 2→Z, 6→G, 8→B). Ex.: nunca escreva "0ZS3J09"; escreva "OZS3J09".
  "nfNumero": string|null, // número da NF se for nota fiscal
  "produto": string|null,  // Identifique o produto e retorne EXATAMENTE um destes nomes padronizados quando corresponder (a NF traz descrição longa — mapeie p/ o nome curto): ${PRODUTOS_CATALOGO.join(' | ')}. Exemplos: "ÓLEO BAS NEUTRO LEVE-PML-30"→"NEUTRO LEVE"; "CHEVRON NEUTRAL OIL 220R"→"CHEVRON 220R"; qualquer "...3043..."→"NEXBASE 3043"; "...600R"→"CHEVRON 600R". Se NÃO bater com nenhum, retorne a melhor leitura. Ignore VALOR UNITÁRIO.
  "quantidade": string|null, // coluna QUANTIDADE do produto (não confundir com valor)
  "transportadora": string|null, // razão social no quadro "TRANSPORTADOR / VOLUMES TRANSPORTADOS" (ex.: "HENRIQUE STEFANI E CIA LTDA")
  "resumo": string      // 1 linha em pt-BR (ex.: "NF 104370, NEXBASE 3043, transp. HENRIQUE STEFANI, placas RDW1I19/KWC6H62")
}`

// As 3 primeiras posições da placa BR são sempre letras. Corrige dígito→letra lidos por engano
// ali (0→O, 1→I, 5→S…). Só corrige se já houver ao menos uma letra nas 3 primeiras (não mexe em nº de NF).
const DIG2LET: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '7': 'T', '8': 'B' }
function corrigePlaca(raw: string): string {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (s.length !== 7) return String(raw || '').toUpperCase().trim()
  const tres = s.slice(0, 3)
  if (!/[A-Z]/.test(tres)) return s
  return tres.replace(/[0-9]/g, (d) => DIG2LET[d] || d) + s.slice(3)
}

/** Classifica e faz uma leitura rápida da imagem (placa ou NF). */
export async function classificarImagemGrupo(openaiKey: string, base64: string, mime: string | null): Promise<{ tipo: string; resumo: string } | null> {
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o', max_tokens: 300, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CLASSIF_PROMPT },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${mime ?? 'image/jpeg'};base64,${base64}`, detail: 'high' } },
            { type: 'text', text: 'Classifique e leia esta imagem.' },
          ] },
        ],
      }),
    })
    if (!r.ok) {
      // Falha TÉCNICA (sem crédito na OpenAI, chave inválida, indisponibilidade).
      // Antes isso virava `null` e a foto era só arquivada — a portaria seguia
      // mandando nota sem saber que nada estava sendo lido. Agora sinaliza.
      const detalhe = (await r.text().catch(() => '')).slice(0, 300)
      console.error('[garagem-grupo] visão falhou:', r.status, detalhe)
      return { tipo: 'falha_leitura', resumo: `HTTP ${r.status}` }
    }
    const data = await r.json()
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}')
    const tipo = ['placa', 'nota_fiscal', 'outro'].includes(parsed.tipo) ? parsed.tipo : 'outro'
    // Corrige o dígito-por-letra nas 3 primeiras posições (ex.: "0ZS3J09" → "OZS3J09")
    const placas = (Array.isArray(parsed.placas) ? parsed.placas : []).map(corrigePlaca).filter(Boolean)
    const resumo = tipo === 'placa'
      // Placa: monta do valor JÁ corrigido (o texto livre do modelo poderia trazer o zero de volta)
      ? (placas.length ? `Placa ${placas.join('/')}` : (typeof parsed.resumo === 'string' ? parsed.resumo.trim() : ''))
      : (typeof parsed.resumo === 'string' && parsed.resumo.trim()
          ? parsed.resumo.trim()
          : [
              parsed.nfNumero ? `NF ${parsed.nfNumero}` : '',
              parsed.produto || '',
              parsed.quantidade ? `qtd ${parsed.quantidade}` : '',
              parsed.transportadora ? `transp. ${parsed.transportadora}` : '',
              placas.join('/'),
            ].filter(Boolean).join(' · '))
    return { tipo, resumo }
  } catch (e) {
    console.error('[garagem-grupo] visão erro:', e instanceof Error ? e.message : e)
    return { tipo: 'falha_leitura', resumo: 'exceção' }
  }
}

/** Registra no rotograma o que foi capturado no grupo (não responde nada). */
export async function logGrupoGaragem(payload: {
  grupoJid?: string
  grupoNome?: string | null
  remetente?: string
  remetenteNome?: string | null
  tipo: string
  conteudo?: string | null
  classificacao?: string | null
  legenda?: string | null
  fotoBase64?: string | null
  fotoMime?: string | null
}): Promise<{ reply?: string } | void> {
  const { baseUrl, apiKey } = rotogramaConfig()
  if (!baseUrl || !apiKey) { console.warn('[garagem-grupo] rotograma não configurado — pulando log'); return }
  try {
    // Endpoint unificado (nf-extraida despacha por action) p/ respeitar o limite
    // de 12 serverless functions do plano Hobby da Vercel.
    const res = await fetch(`${baseUrl}/api/garagem/nf-extraida`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ action: 'grupo-log', ...payload }),
    })
    const j = await res.json().catch(() => null)
    if (j?.reply) return { reply: j.reply }   // confirmação de entrada p/ publicar no grupo
  } catch (err) {
    console.error('[garagem-grupo] erro no log:', err instanceof Error ? err.message : err)
  }
}
