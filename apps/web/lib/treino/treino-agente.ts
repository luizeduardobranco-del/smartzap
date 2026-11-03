// "Melhorar meu agente" — treino com conversas reais.
//
// Fluxo: o cliente cola/envia conversas → anonimizamos (nomes, telefones, CPF, e-mail, CEP,
// endereço) → a IA extrai o que a empresa sabe e faz (perguntas frequentes, fatos, estilo,
// quando transferir, exemplos) e compara com o que o agente já sabe → o cliente aprova item
// a item → fatos e perguntas vão para a base de conhecimento; estilo, transferência e
// exemplos vão para uma seção própria no fim do prompt.
//
// As conversas NÃO são guardadas: só o que o cliente aprovar.

export type LadoMensagem = 'empresa' | 'cliente' | 'agente'
export type ConversaTreino = { titulo?: string; mensagens?: { lado: LadoMensagem; autor?: string; texto: string }[]; textoLivre?: string }

export type TipoItem = 'faq' | 'objecao' | 'fato' | 'estilo' | 'transferencia' | 'exemplo' | 'lacuna'
export type SituacaoItem = 'novo' | 'confirma' | 'contradiz'

export type ItemAprendido = {
  id: string
  tipo: TipoItem
  situacao: SituacaoItem
  pergunta?: string
  resposta?: string
  texto?: string
  conflito?: string
  evidencia?: string
}

// Regras guardadas em behavior_config.treino.regras e desenhadas no prompt.
export type RegraAprendida = { id: string; tipo: 'estilo' | 'transferencia' | 'exemplo' | 'atualizacao'; texto: string; criadoEm: string }

export const LIMITE_CARACTERES_TREINO = 120_000
export const MAX_ITENS = 40

// ─── Anonimização ──────────────────────────────────────────────────────────

function escaparRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Troca nomes conhecidos (e o primeiro nome, se tiver 3+ letras) por um marcador.
function trocarNomes(texto: string, nomes: string[], marcador: string): string {
  let t = texto
  const variantes = new Set<string>()
  for (const n of nomes) {
    const limpo = n.replace(/[~+]/g, '').trim()
    if (!limpo || /^\+?\d[\d\s-]+$/.test(limpo)) continue
    variantes.add(limpo)
    const primeiro = limpo.split(/\s+/)[0]
    if (primeiro.length >= 3) variantes.add(primeiro)
  }
  for (const v of [...variantes].sort((a, b) => b.length - a.length)) {
    t = t.replace(new RegExp(`(?<![\\p{L}\\d])${escaparRegex(v)}(?![\\p{L}\\d])`, 'giu'), marcador)
  }
  return t
}

export function anonimizarTexto(texto: string): string {
  return texto
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[EMAIL]')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ]')
    .replace(/\b\d{5}-\d{3}\b/g, '[CEP]')
    .replace(/(\+?55[\s-]?)?\(?\b\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}\b/g, '[TELEFONE]')
    .replace(/\b\d{11}\b/g, '[CPF]')
    .replace(/https?:\/\/(wa\.me|api\.whatsapp\.com)\/\S+/gi, '[LINK WHATSAPP]')
    .replace(/\b(rua|r\.|avenida|av\.?|travessa|tv\.|estrada|rodovia|alameda|pra[çc]a|largo)\s+[^,\n]{2,60},?\s*(n[º°o.]?\s*)?\d{1,5}\b/gi, '[ENDEREÇO]')
    // Logradouro sem o tipo ("Mariz e Barros, 612"): nome com inicial maiúscula + vírgula + número.
    .replace(/(?<!\p{L})\p{Lu}\p{L}+(?:\s+(?:d[aeo]s?|e|\p{Lu}\p{L}+)){0,5},\s*(?:n[º°o.]?\s*)?\d{2,5}\b(?![\d/.,:])/gu, '[ENDEREÇO]')
}

// Transcrição anônima de todas as conversas, numerada, pronta para a IA.
export function montarTranscricao(conversas: ConversaTreino[]): string {
  const partes: string[] = []
  conversas.forEach((c, i) => {
    let corpo: string
    if (c.mensagens?.length) {
      const nomesEmpresa = c.mensagens.filter((m) => m.lado !== 'cliente' && m.autor).map((m) => m.autor!)
      const nomesCliente = c.mensagens.filter((m) => m.lado === 'cliente' && m.autor).map((m) => m.autor!)
      corpo = c.mensagens
        .map((m) => {
          let t = anonimizarTexto(m.texto)
          t = trocarNomes(t, [...new Set(nomesCliente)], '[CLIENTE]')
          t = trocarNomes(t, [...new Set(nomesEmpresa)], '[ATENDENTE]')
          return `${m.lado === 'empresa' ? 'EMPRESA' : m.lado === 'agente' ? 'AGENTE (robô)' : 'CLIENTE'}: ${t}`
        })
        .join('\n')
    } else {
      corpo = anonimizarTexto(c.textoLivre ?? '')
    }
    if (corpo.trim()) partes.push(`=== CONVERSA ${i + 1} ===\n${corpo.trim()}`)
  })
  return partes.join('\n\n').slice(0, LIMITE_CARACTERES_TREINO)
}

// ─── Extração com IA ───────────────────────────────────────────────────────

const INSTRUCOES_EXTRACAO = `Você analisa conversas reais de WhatsApp entre uma EMPRESA e seus CLIENTES para ensinar o agente de IA que atende essa empresa.

Extraia SOMENTE o que a EMPRESA disse ou fez (o que o cliente afirma não é fato da empresa). Falas "AGENTE (robô)" são do próprio agente de IA: nunca são fonte de fatos; use-as só para achar lacunas ou respostas que a EMPRESA corrigiu depois. Generalize: nada específico de um cliente (nome, data da visita dele, pedido dele). Nunca inclua dados pessoais; os marcadores [CLIENTE], [TELEFONE] etc. já substituem esses dados — não os copie para os itens, exceto em "exemplo".

Tipos de item:
- "faq": pergunta que clientes fazem + a resposta que a empresa deu (reescrita de forma clara e geral).
- "objecao": objeção ou hesitação do cliente (preço, prazo, confiança) + como a empresa contornou.
- "fato": informação objetiva da empresa (preço, faixa de preço por bairro/serviço, prazo, horário, área atendida, forma de pagamento, regra de contrato, documento exigido). Inclua números e condições exatamente como aparecem.
- "estilo": jeito de falar da empresa, como instrução curta para o agente (ex.: "Cumprimenta com 'Bom dia! Tudo bem?'", "Mensagens curtas, sem emoji", "Pede o bairro antes de falar valor").
- "transferencia": situação em que uma pessoa da equipe precisou assumir ou que o agente não deve resolver sozinho (ex.: "Cliente reclamando de atraso", "Pedido de desconto acima da tabela").
- "exemplo": até 3 trechos curtos (4 a 8 falas, formato "Cliente: ..." / "Você: ...") de atendimentos bem conduzidos, que mostram o jeito da empresa vender. Use os marcadores no lugar de dados pessoais.
- "lacuna": pergunta de cliente que ficou SEM resposta clara da empresa nas conversas (o agente vai precisar saber).

Compare cada item com O QUE O AGENTE JÁ SABE (abaixo) e marque "situacao":
- "novo": o agente não tem essa informação.
- "confirma": o agente já sabe exatamente isso.
- "contradiz": o agente sabe algo diferente — preencha "conflito" com o que ele diz hoje, em uma frase.

Para cada item, "fonte" = quem disse o trecho que sustenta o item: "empresa", "cliente" ou "agente" (fala do AGENTE (robô)). Itens que só se apoiam em falas do robô devem ter fonte "agente". Para cada item, "evidencia" = trecho curto (até 160 caracteres) da conversa que sustenta o item. Não invente nada que não esteja nas conversas. No máximo ${MAX_ITENS} itens; priorize o que mais ajuda a vender e a evitar respostas erradas. Escreva em português do Brasil.

Responda APENAS em JSON:
{"itens":[{"tipo":"faq|objecao|fato|estilo|transferencia|exemplo|lacuna","situacao":"novo|confirma|contradiz","pergunta":"(faq/objecao/lacuna)","resposta":"(faq/objecao)","texto":"(fato/estilo/transferencia/exemplo)","conflito":"(só se contradiz)","fonte":"empresa|cliente|agente","evidencia":"..."}]}`

const TIPOS: TipoItem[] = ['faq', 'objecao', 'fato', 'estilo', 'transferencia', 'exemplo', 'lacuna']
const SITUACOES: SituacaoItem[] = ['novo', 'confirma', 'contradiz']

function str(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined
}

export async function extrairAprendizado(opts: {
  transcricao: string
  conhecimentoAtual: string
  nomeAgente: string
  openaiKey: string
}): Promise<ItemAprendido[]> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      temperature: 0.2,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: INSTRUCOES_EXTRACAO },
        {
          role: 'user',
          content: `AGENTE: ${opts.nomeAgente}\n\n### O QUE O AGENTE JÁ SABE\n${opts.conhecimentoAtual || '(nada além do nome)'}\n\n### CONVERSAS REAIS\n${opts.transcricao}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(170_000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `Erro da IA (${res.status})`)
  }
  const data = await res.json()
  let bruto: { itens?: unknown[] }
  try {
    bruto = JSON.parse(data.choices?.[0]?.message?.content ?? '{}')
  } catch {
    throw new Error('A IA devolveu uma resposta inválida. Tente de novo.')
  }

  const itens: ItemAprendido[] = []
  for (const x of (bruto.itens ?? []).slice(0, MAX_ITENS) as Record<string, unknown>[]) {
    const tipo = TIPOS.includes(x.tipo as TipoItem) ? (x.tipo as TipoItem) : null
    if (!tipo) continue
    // O robô não é fonte de verdade: só lacunas (perguntas de clientes) podem vir dessas conversas.
    if (tipo !== 'lacuna' && x.fonte !== 'empresa') continue
    const item: ItemAprendido = {
      id: crypto.randomUUID(),
      tipo,
      situacao: SITUACOES.includes(x.situacao as SituacaoItem) ? (x.situacao as SituacaoItem) : 'novo',
      pergunta: str(x.pergunta, 500),
      resposta: str(x.resposta, 2000),
      texto: str(x.texto, tipo === 'exemplo' ? 2500 : 1000),
      conflito: str(x.conflito, 500),
      evidencia: str(x.evidencia, 200),
    }
    const valido =
      tipo === 'faq' || tipo === 'objecao' ? !!(item.pergunta && item.resposta)
      : tipo === 'lacuna' ? !!item.pergunta
      : !!item.texto
    if (valido) itens.push(item)
  }
  return itens
}

// ─── Seção aprendida no prompt ─────────────────────────────────────────────

const INICIO_SECAO = '<!-- WHITEZAP:APRENDIDO -->'
const FIM_SECAO = '<!-- /WHITEZAP:APRENDIDO -->'
const SECAO_RE = /\n*<!-- WHITEZAP:APRENDIDO -->[\s\S]*?<!-- \/WHITEZAP:APRENDIDO -->\n*/

export function montarSecaoAprendida(regras: RegraAprendida[]): string {
  if (!regras.length) return ''
  const de = (t: RegraAprendida['tipo']) => regras.filter((r) => r.tipo === t)
  const partes: string[] = [
    INICIO_SECAO,
    '## O que aprendi com as conversas reais da empresa',
    '(Seção mantida pela aba "Melhorar" do agente. Para mudar, use aquela aba.)',
  ]
  const atual = de('atualizacao')
  if (atual.length) {
    partes.push('### Informações atualizadas (valem mais que qualquer outra parte destas instruções)')
    partes.push(...atual.map((r) => `- ${r.texto}`))
  }
  const estilo = de('estilo')
  if (estilo.length) {
    partes.push('### Como a empresa costuma falar')
    partes.push(...estilo.map((r) => `- ${r.texto}`))
  }
  const transf = de('transferencia')
  if (transf.length) {
    partes.push('### Quando passar para uma pessoa da equipe')
    partes.push(...transf.map((r) => `- ${r.texto}`))
    partes.push('Nesses casos, avise com educação que vai chamar alguém da equipe e escreva [[ATENDENTE]] no fim da resposta.')
  }
  const ex = de('exemplo')
  if (ex.length) {
    partes.push('### Exemplos de bons atendimentos da empresa (siga o jeito; não copie dados de outros clientes)')
    ex.forEach((r, i) => partes.push(`Exemplo ${i + 1}:\n${r.texto}`))
  }
  partes.push(FIM_SECAO)
  return partes.join('\n')
}

// Troca (ou acrescenta no fim) a seção aprendida dentro do prompt.
export function aplicarSecaoNoPrompt(prompt: string, secao: string): string {
  const semSecao = prompt.replace(SECAO_RE, '\n\n').trim()
  return secao ? `${semSecao}\n\n${secao}` : semSecao
}

// Texto do agente sem a seção aprendida (para comparar com o que já sabe).
export function promptSemSecao(prompt: string): string {
  return prompt.replace(SECAO_RE, '\n\n').trim()
}
