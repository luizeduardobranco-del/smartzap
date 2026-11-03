// Lê conversas do WhatsApp em texto: o arquivo de "Exportar conversa" (Android e iPhone) e
// o texto copiado do WhatsApp Web. Roda no navegador e no servidor (sem dependências).
//
// Formatos aceitos (uma mensagem por linha; linhas seguintes sem cabeçalho continuam a anterior):
//   Android:       02/11/2026 15:33 - André Lima: texto
//   iPhone:        [02/11/2026, 15:33:12] André Lima: texto
//   WhatsApp Web:  [15:33, 02/11/2026] André Lima: texto

export type MensagemExportada = { autor: string; texto: string }

const CABECALHOS: RegExp[] = [
  /^‎?\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),? (\d{1,2}:\d{2}(?::\d{2})?)\]? ?(?:-|–)? ?([^:]{1,60}): (.*)$/,
  /^‎?\[(\d{1,2}:\d{2}(?::\d{2})?), (\d{1,2}\/\d{1,2}\/\d{2,4})\] ([^:]{1,60}): (.*)$/,
]

// Avisos do próprio WhatsApp e mídias omitidas: não ensinam nada.
const IGNORAR = /^(<?(m[íi]dia oculta|arquivo de m[íi]dia oculto|imagem ocultada|v[íi]deo omitido|[áa]udio ocultado|figurinha omitida|media omitted)>?|essa mensagem foi apagada|mensagem apagada|null)$/i
const AVISO_SISTEMA = /(mensagens e as liga[çc][õo]es s[ãa]o protegidas|criptografia de ponta a ponta|end-to-end encrypted)/i

export function lerConversaWhatsApp(texto: string): { mensagens: MensagemExportada[]; autores: { nome: string; qtd: number }[] } {
  const mensagens: MensagemExportada[] = []
  const linhas = texto.replace(/\r\n?/g, '\n').split('\n')

  for (const linhaBruta of linhas) {
    const linha = linhaBruta.replace(/[‎‏‪-‮]/g, '').trimEnd()
    if (!linha.trim()) continue
    let casou: RegExpMatchArray | null = null
    for (const re of CABECALHOS) {
      casou = linha.match(re)
      if (casou) break
    }
    if (casou) {
      const autor = casou[3].trim()
      const corpo = casou[4].trim()
      if (AVISO_SISTEMA.test(corpo)) continue
      mensagens.push({ autor, texto: corpo })
    } else if (mensagens.length && !AVISO_SISTEMA.test(linha)) {
      mensagens[mensagens.length - 1].texto += '\n' + linha.trim()
    }
  }

  const limpas = mensagens.filter((m) => m.texto.trim() && !IGNORAR.test(m.texto.trim()))
  const contagem = new Map<string, number>()
  for (const m of limpas) contagem.set(m.autor, (contagem.get(m.autor) ?? 0) + 1)
  const autores = [...contagem.entries()].map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd)
  return { mensagens: limpas, autores }
}
