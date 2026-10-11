// Garantias por código para o que o modelo às vezes esquece no fim de uma resposta longa.
//
// behavior_config.midiaPorTexto: [{ contem: 'instagram.com/x', tipo: 'video', chave: 'garagem' }]
//   → se a resposta contém o trecho, a mídia vai junto, mesmo sem o marcador.
// behavior_config.resumoLead.gatilhos: ['Proposta para vocês', 'Anotei tudo']
//   → se a resposta contém um gatilho e veio sem [[LEAD]], extraímos o resumo da conversa.

type Midia = { tipo: 'imagem' | 'video'; chave: string }
type RegraMidia = { contem?: string; tipo?: string; chave?: string }

export function midiasPorTexto(texto: string, regras: unknown, jaPedidas: Midia[]): Midia[] {
  if (!Array.isArray(regras) || !texto) return []
  const extra: Midia[] = []
  const baixo = texto.toLowerCase()
  for (const r of regras as RegraMidia[]) {
    if (!r?.contem || !r.chave) continue
    if (!baixo.includes(r.contem.toLowerCase())) continue
    const item: Midia = { tipo: r.tipo === 'video' ? 'video' : 'imagem', chave: r.chave.toLowerCase() }
    const repetida = [...jaPedidas, ...extra].some((m) => m.tipo === item.tipo && m.chave === item.chave)
    if (!repetida) extra.push(item)
  }
  return extra
}

export function precisaResumo(texto: string, gatilhos: unknown): boolean {
  if (!Array.isArray(gatilhos) || !texto) return false
  const baixo = texto.toLowerCase()
  return gatilhos.some((g) => typeof g === 'string' && g && baixo.includes(g.toLowerCase()))
}

const CAMPOS = ['Responsável', 'Escola', 'Período', 'Endereço', 'Alunos', 'Trajeto', 'Valor informado']

export async function extrairResumo(opts: {
  openaiKey: string
  historico: { role: 'user' | 'assistant'; content: string }[]
  ultimaResposta: string
}): Promise<string | null> {
  const conversa = [...opts.historico, { role: 'assistant' as const, content: opts.ultimaResposta }]
    .map((m) => `${m.role === 'user' ? 'Cliente' : 'Atendente'}: ${m.content}`)
    .join('\n')
    .slice(-12000)

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content:
            `Extraia da conversa os dados do contato. Responda SOMENTE com estas linhas, nesta ordem, ` +
            `uma por campo, escrevendo "não informado" quando o dado não aparecer. Não invente.\n` +
            CAMPOS.map((c) => `${c}:`).join('\n') +
            `\n"Valor informado" é o valor que o atendente passou ao cliente (ou "nenhum").`,
        },
        { role: 'user', content: conversa },
      ],
    }),
  })
  if (!res.ok) {
    console.warn('[garantias] extração do resumo falhou: HTTP', res.status)
    return null
  }
  const data = await res.json()
  const texto: string = data.choices?.[0]?.message?.content?.trim() ?? ''
  return CAMPOS.every((c) => texto.includes(`${c}:`)) ? texto : null
}
