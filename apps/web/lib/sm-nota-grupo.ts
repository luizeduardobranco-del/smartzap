/**
 * Nota do grupo da FROTA → SM da gerenciadora de risco (Ativa Rio).
 *
 * Os grupos de operação (FROTA ATIVA RIO e AGREGADOS ATIVA) recebem a foto da
 * nota logo depois do carregamento. Essa nota NÃO é do pátio: ela é a carga que
 * o caminhão está levando, e serve para montar a SM (Solicitação de
 * Monitoramento) no rotograma.
 *
 * Por isso este caminho é separado do robô do pátio (lib/garagem-nf.ts): a mesma
 * foto, no grupo errado, viraria agendamento de pátio — que é outro processo.
 *
 * Config (env WHITE CHAT):
 *   SM_GROUP_JIDS               — JIDs dos grupos da operação (…@g.us), separados por vírgula
 *   ROTOGRAMA_BASE_URL          — https://ativa-rio-rotograma.vercel.app
 *   GARAGEM_INTEGRATION_API_KEY — a mesma chave que o pátio já usa
 */

/** Grupo da operação (nota → SM)? Sem a env configurada, ninguém entra: este
 *  fluxo lança nota em viagem de verdade e não pode valer para grupo qualquer. */
export function grupoSmNoEscopo(groupJid: string | undefined): boolean {
  const jids = (process.env.SM_GROUP_JIDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return !!groupJid && jids.includes(groupJid)
}

/**
 * Manda a chave para o rotograma montar a SM. Devolve o texto que o robô publica
 * no grupo — quem decide o que dizer é o rotograma, que é quem sabe o estado da
 * viagem.
 */
export async function enviarNotaParaSm(args: {
  chave: string
  grupoJid?: string
  telefone?: string | null
  remetente?: string | null
}): Promise<{ reply: string | null; viagem?: string | null }> {
  const baseUrl = (process.env.ROTOGRAMA_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const apiKey = (process.env.GARAGEM_INTEGRATION_API_KEY ?? '').trim()
  if (!baseUrl || !apiKey) {
    console.warn('[sm-nota] ROTOGRAMA_BASE_URL ou GARAGEM_INTEGRATION_API_KEY ausente — pulando')
    return { reply: null }
  }
  try {
    const res = await fetch(`${baseUrl}/api/gr/sm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        acao: 'nota-grupo',
        chave: args.chave,
        grupoJid: args.grupoJid ?? null,
        telefone: args.telefone ?? null,
        remetente: args.remetente ?? null,
      }),
    })
    if (!res.ok) {
      console.error('[sm-nota] HTTP', res.status, (await res.text().catch(() => '')).slice(0, 200))
      return { reply: null }
    }
    const j = (await res.json()) as { reply?: string; viagem?: { numero?: string } }
    return { reply: j.reply ?? null, viagem: j.viagem?.numero ?? null }
  } catch (err) {
    console.error('[sm-nota] erro:', err instanceof Error ? err.message : err)
    return { reply: null }
  }
}

/** Chave de acesso digitada ou colada no grupo (44 dígitos, com ou sem espaços). */
export function chaveNoTexto(texto: string | null | undefined): string | null {
  const so = String(texto ?? '').replace(/\D/g, '')
  return so.length === 44 ? so : null
}

/**
 * Canhoto (comprovante de entrega) — leitura pela IA.
 *
 * Regra da operação (Ativa, 02/09/2026): o número da nota aparece no CENTRO do
 * canhoto e também à DIREITA, acima do código de barras, dentro de uma numeração
 * longa cujos **9 últimos dígitos** são a nota. O da direita vale mais: é
 * impressão de código de barras, não escrita à mão.
 */
export async function lerCanhoto(
  openaiKey: string,
  base64: string,
  mime: string | null,
): Promise<{ ehCanhoto: boolean; nfNumero: string | null; codigoBarras: string | null } | null> {
  const prompt = `Você recebe a foto de um documento enviado num grupo de transportadora.
Responda APENAS JSON:
{
  "ehCanhoto": boolean,      // true se for CANHOTO/comprovante de entrega (recibo destacável da nota, geralmente assinado/carimbado pelo cliente)
  "nfNumero": string|null,   // número da NOTA FISCAL impresso no CENTRO do canhoto (só dígitos)
  "codigoBarras": string|null // a numeração longa impressa à DIREITA, ACIMA do código de barras (transcreva TODOS os dígitos, sem espaços)
}
Não invente: campo ilegível vai como null.`
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mime ?? 'image/jpeg'};base64,${base64}` } },
          ],
        }],
      }),
    })
    if (!r.ok) return null
    const j = await r.json()
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? '{}')
    const so = (v: unknown) => (typeof v === 'string' ? v.replace(/\D/g, '') : '') || null
    return {
      ehCanhoto: !!parsed.ehCanhoto,
      nfNumero: so(parsed.nfNumero),
      codigoBarras: so(parsed.codigoBarras),
    }
  } catch { return null }
}

/** Manda o canhoto para o rotograma arquivar na viagem da nota. */
export async function enviarCanhotoParaViagem(args: {
  nfNumero: string | null
  codigoBarras: string | null
  fotoBase64: string | null
  mime: string | null
  grupoJid?: string
  telefone?: string | null
  remetente?: string | null
  legenda?: string | null
}): Promise<{ reply: string | null; viagem?: string | null }> {
  const baseUrl = (process.env.ROTOGRAMA_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const apiKey = (process.env.GARAGEM_INTEGRATION_API_KEY ?? '').trim()
  if (!baseUrl || !apiKey) return { reply: null }
  try {
    const res = await fetch(`${baseUrl}/api/gr/sm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ acao: 'canhoto-grupo', ...args }),
    })
    if (!res.ok) {
      console.error('[canhoto] HTTP', res.status, (await res.text().catch(() => '')).slice(0, 160))
      return { reply: null }
    }
    const j = (await res.json()) as { reply?: string; viagem?: string | null }
    return { reply: j.reply ?? null, viagem: j.viagem ?? null }
  } catch (err) {
    console.error('[canhoto] erro:', err instanceof Error ? err.message : err)
    return { reply: null }
  }
}
