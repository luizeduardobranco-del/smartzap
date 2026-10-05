// Reproduz a conversa de 04/10 22:01 (André: Alfa Cem, Grajaú, 9º ano, manhã, "Volta")
// e confere o preço da proposta para cada tipo de trajeto.
// Uso: npx tsx scripts/teste-alana-preco.mts <json com personality> [rodadas]
import { readFileSync } from 'node:fs'
import * as engine from '../packages/ai-engine/src/agent-runner'
const runAgent: typeof engine.runAgent = (engine as any).runAgent ?? (engine as any).default.runAgent

const raw = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const personality = (Array.isArray(raw) ? raw[0] : raw).personality
const rodadas = Number(process.argv[3] ?? 3)

type Msg = { role: 'user' | 'assistant'; content: string }
const ate = (bairro: string, trajeto: string): Msg[] => [
  { role: 'user', content: 'Orçamento' },
  { role: 'assistant', content: 'Te falo agora 😊 O valor muda conforme a escola e o bairro. Me diz rapidinho: qual escola e qual bairro? Aí já te passo o valor certo, sem chute.' },
  { role: 'user', content: `Alfa cem\n${bairro}` },
  { role: 'assistant', content: 'Perfeito! A Trans School dedica veículos ao atendimento dos alunos do Alfa Cem e do pH Tijuca, por isso nosso atendimento é diferenciado 😊 É só um aluno?' },
  { role: 'user', content: 'Somente 1' },
  { role: 'assistant', content: 'Ótimo! E que série ou idade o aluno vai cursar em 2027?' },
  { role: 'user', content: '9 ano' },
  { role: 'assistant', content: 'Certo! O aluno estuda de manhã, à tarde ou integral?' },
  { role: 'user', content: 'Manha' },
  { role: 'assistant', content: 'E você precisa de ida e volta, ou só um dos trajetos?' },
  { role: 'user', content: trajeto },
  { role: 'assistant', content: 'E hoje, como vocês fazem? Você mesmo leva ou já usa algum transporte?' },
  { role: 'user', content: 'Transporte' },
  { role: 'assistant', content: 'Entendi! E o que você mudaria no transporte que vocês usam atualmente, se pudesse?' },
]

type Caso = { nome: string; hist: Msg[]; exige: RegExp[]; proibe: RegExp[] }
const casos: Caso[] = [
  { nome: 'Grajaú, só volta (caso real)', hist: ate('Grajau', 'Volta'),
    exige: [/418/, /somente volta|só volta|so volta/i], proibe: [/640/, /730/, /ida e volta/i] },
  { nome: 'Grajaú, só ida', hist: ate('Grajau', 'só na ida'),
    exige: [/418/, /somente ida|só ida|so ida/i], proibe: [/640/, /730/] },
  { nome: 'Grajaú, ida e volta', hist: ate('Grajau', 'ida e volta'),
    exige: [/640/], proibe: [/418/, /455/, /730/] },
  { nome: 'Méier, só volta', hist: ate('Meier', 'Volta'),
    exige: [], proibe: [/R\$\s*\d/] },
]
const sempreProibido = [/informad[oa]/i, /\(o (colégio|bairro)/i, /\(640|\(o /]

let falhas = 0, total = 0
for (const c of casos) {
  for (let i = 1; i <= rodadas; i++) {
    total++
    const r = await runAgent({
      personality,
      aiConfig: { provider: 'openai', model: process.env.MODELO ?? 'gpt-4o-mini', temperature: 0.7, maxTokens: 1000 } as any,
      behaviorConfig: {} as any,
      conversationHistory: c.hist,
      userMessage: 'Atrasos',
      env: { openaiApiKey: process.env.OPENAI_API_KEY },
    })
    const txt = r.content
    const erros = [
      ...c.exige.filter((re) => !re.test(txt)).map((re) => `faltou ${re}`),
      ...c.proibe.filter((re) => re.test(txt)).map((re) => `apareceu ${re}`),
      ...sempreProibido.filter((re) => re.test(txt)).map((re) => `vazou ${re}`),
    ]
    if (erros.length) falhas++
    console.log(`${erros.length ? 'ERRO' : 'OK  '} [${c.nome}] rodada ${i}${erros.length ? ' → ' + erros.join('; ') : ''}`)
    if (erros.length || i === 1) console.log('    ' + txt.split('\n').filter((l) => /Trajeto|Valor|R\$|Bairro|Colégio|consult|atendimento/i.test(l)).join('\n    '))
  }
}
console.log(`\n${total - falhas}/${total} ok`)
process.exit(falhas ? 1 : 0)
