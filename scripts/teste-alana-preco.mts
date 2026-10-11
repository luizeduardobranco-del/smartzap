// Confere a proposta da Alana (Trans School) por bairro, trajeto, irmãos e prazo da promoção.
// Uso: MODELO=gpt-4o npx tsx scripts/teste-alana-preco.mts <json com personality> [rodadas]
import { readFileSync } from 'node:fs'
import * as engine from '../packages/ai-engine/src/agent-runner'
const runAgent: typeof engine.runAgent = (engine as any).runAgent ?? (engine as any).default.runAgent

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const personality = (Array.isArray(raw) ? raw[0] : raw).personality
const rodadas = Number(process.argv[3] ?? 2)

type Msg = { role: 'user' | 'assistant'; content: string }
const ate = (bairro: string, alunos: string, trajeto: string): Msg[] => [
  { role: 'user', content: 'Orçamento' },
  { role: 'assistant', content: 'Te falo agora 😊 O valor muda conforme a escola e o bairro. Me diz rapidinho: qual escola e qual bairro? Aí já te passo o valor certo, sem chute.' },
  { role: 'user', content: `Alfa cem\n${bairro}, rua Barão de Mesquita 500` },
  { role: 'assistant', content: 'Perfeito! A Trans School dedica veículos ao atendimento dos alunos do Alfa Cem e do pH Tijuca, por isso nosso atendimento é diferenciado 😊 É só um aluno?' },
  { role: 'user', content: alunos },
  { role: 'assistant', content: 'Certo! O aluno estuda de manhã, à tarde ou integral?' },
  { role: 'user', content: 'Manha' },
  { role: 'assistant', content: 'E você precisa de ida e volta, ou só um dos trajetos?' },
  { role: 'user', content: trajeto },
  { role: 'assistant', content: 'E hoje, como vocês fazem? Você mesmo leva ou já usa algum transporte?' },
  { role: 'user', content: 'Transporte' },
  { role: 'assistant', content: 'Entendi! E o que você mudaria no transporte que vocês usam atualmente, se pudesse?' },
]

const ANTES = new Date('2026-10-11T15:00:00Z')
const DEPOIS = new Date('2026-11-12T15:00:00Z')

type Caso = {
  nome: string; hist: Msg[]; hoje: Date
  exige: RegExp[]; proibe: RegExp[]; imagem: string | null; lead: boolean
  videos?: string[]; msg?: string
}
const casos: Caso[] = [
  { nome: 'Grajaú ida e volta, promo', hist: ate('Grajau', 'Somente 1', 'ida e volta'), hoje: ANTES,
    exige: [/650/, /595/, /10\/11/], proibe: [/640/, /418/, /790/, /699/], imagem: 'tijuca', lead: true },
  { nome: 'Grajaú só volta, promo', hist: ate('Grajau', 'Somente 1', 'Volta'), hoje: ANTES,
    exige: [/455/, /418/, /somente volta|só volta/i], proibe: [/650/, /595/], imagem: 'tijuca', lead: true },
  { nome: 'Méier ida e volta, promo', hist: ate('Meier', 'Somente 1', 'ida e volta'), hoje: ANTES,
    exige: [/790/, /699/], proibe: [/650/, /595/], imagem: 'meier', lead: true },
  { nome: 'Méier só volta (sem valor)', hist: ate('Meier', 'Somente 1', 'Volta'), hoje: ANTES,
    exige: [], proibe: [/R\$\s*\d/], imagem: null, lead: false },
  { nome: 'Irmãos (sem valor)', hist: ate('Grajau', 'São 2, irmãos', 'ida e volta'), hoje: ANTES,
    exige: [/irm/i], proibe: [/R\$\s*\d/, /20\s*%/], imagem: null, lead: false },
  { nome: 'Grajaú ida e volta, promo vencida', hist: ate('Grajau', 'Somente 1', 'ida e volta'), hoje: DEPOIS,
    // Depois de 10/11 o folder (que anuncia a promoção) não vai mais; os vídeos continuam.
    exige: [/650/], proibe: [/595/, /promo/i], imagem: null, lead: true, videos: ['garagem', 'seguranca'] },
  { nome: 'Pergunta sobre monitoras', hoje: ANTES, msg: 'e como são as monitoras? meu filho é pequeno',
    hist: ate('Grajau', 'Somente 1', 'ida e volta').slice(0, 6),
    exige: [/monitora/i], proibe: [], imagem: null, lead: false, videos: ['monitoras'] },
]
// "idade" como palavra inteira: a apresentação tem "unidade" e "disponibilidade".
const sempreProibido = [/informad[oa]/i, /\[\[/, /\]\]/, /(^|[^a-zà-ú])idade/i]

let falhas = 0, total = 0
for (const c of casos) {
  for (let i = 1; i <= rodadas; i++) {
    total++
    const r = await runAgent({
      personality,
      aiConfig: { provider: 'openai', model: process.env.MODELO ?? 'gpt-4o', temperature: 0.7, maxTokens: 1000 } as any,
      behaviorConfig: {} as any,
      conversationHistory: c.hist,
      userMessage: c.msg ?? 'Atrasos',
      today: c.hoje,
      env: { openaiApiKey: process.env.OPENAI_API_KEY },
    })
    const txt = r.content
    const erros = [
      ...c.exige.filter((re) => !re.test(txt)).map((re) => `faltou ${re}`),
      ...c.proibe.filter((re) => re.test(txt)).map((re) => `apareceu ${re}`),
      ...sempreProibido.filter((re) => re.test(txt)).map((re) => `vazou ${re}`),
    ]
    const imgs = r.images.join(',') || null
    if (imgs !== c.imagem) erros.push(`imagem=${imgs} (esperado ${c.imagem})`)
    const vids = r.media.filter((m) => m.tipo === 'video').map((m) => m.chave)
    // A proposta vem junto com a apresentação: os dois vídeos de apresentação precisam ir.
    const esperados = c.videos ?? (c.imagem ? ['garagem', 'seguranca'] : [])
    for (const v of esperados) if (!vids.includes(v)) erros.push(`faltou vídeo ${v} (veio: ${vids.join(',') || 'nenhum'})`)
    if (!c.imagem && !c.videos && vids.length) erros.push(`vídeo indevido: ${vids.join(',')}`)
    if (c.lead && !r.leadSummary) erros.push('sem resumo [[LEAD]]')
    if (erros.length) falhas++
    console.log(`${erros.length ? 'ERRO' : 'OK  '} [${c.nome}] rodada ${i}${erros.length ? ' → ' + erros.join('; ') : ''}`)
    if (erros.length || i === 1) {
      console.log('    ' + txt.split('\n').filter((l) => /Trajeto|Valor|Promo|R\$|irm|consult/i.test(l)).join('\n    '))
      if (r.leadSummary && i === 1) console.log('    LEAD: ' + r.leadSummary.replace(/\n/g, ' | '))
    }
  }
}
console.log(`\n${total - falhas}/${total} ok`)
process.exit(falhas ? 1 : 0)
