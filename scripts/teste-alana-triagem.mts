// Simula a triagem da Alana (novo cliente × cliente atual) contra o modelo real.
// Uso: npx tsx scripts/teste-alana-triagem.mts <patch.json>
import { readFileSync } from 'node:fs'
import * as engine from '../packages/ai-engine/src/agent-runner'
const runAgent: typeof engine.runAgent = (engine as any).runAgent ?? (engine as any).default.runAgent

const patch = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const personality = patch.personality

type Caso = { nome: string; historico?: { role: 'user' | 'assistant'; content: string }[]; msg: string; esperaAtendente: boolean }

const casos: Caso[] = [
  { nome: 'oi genérico', msg: 'oi, bom dia', esperaAtendente: false },
  { nome: 'novo: preço', msg: 'quanto custa a van pro alfa cem?', esperaAtendente: false },
  { nome: 'financeiro', msg: 'boa tarde, preciso da segunda via do boleto de outubro', esperaAtendente: true },
  { nome: 'ocorrência', msg: 'a van não passou aqui hoje de manhã, minha filha ficou esperando', esperaAtendente: true },
  { nome: 'reclamação', msg: 'quero reclamar, o motorista foi grosso com meu filho ontem', esperaAtendente: true },
  { nome: 'cancelamento', msg: 'quero cancelar o transporte do Pedro a partir de novembro', esperaAtendente: true },
  { nome: 'renovação', msg: 'oi, quero renovar o transporte pra 2027', esperaAtendente: false },
  {
    nome: 'triagem → cliente atual',
    historico: [
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'Oi! Aqui é a Alana, da Trans School 🚐 Você está procurando transporte escolar ou já é nosso cliente e precisa de algum suporte?' },
    ],
    msg: 'já sou cliente, é sobre o pagamento',
    esperaAtendente: true,
  },
  {
    nome: 'triagem → novo',
    historico: [
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'Oi! Aqui é a Alana, da Trans School 🚐 Você está procurando transporte escolar ou já é nosso cliente e precisa de algum suporte?' },
    ],
    msg: 'to procurando transporte',
    esperaAtendente: false,
  },
  {
    nome: 'renovação aceita ficha',
    historico: [
      { role: 'user', content: 'quero renovar pra 2027' },
      { role: 'assistant', content: 'Que bom que vocês vão continuar com a Trans School 🙌 Pra eu te ajudar certinho: a renovação é para quantos alunos e em qual escola?' },
      { role: 'user', content: '1 aluno, pH Tijuca. Moro na Tijuca, ela vai pro 3º ano, manhã, ida e volta. Sou a Carla' },
    ],
    msg: 'pode ser',
    esperaAtendente: false,
  },
]

let falhas = 0
for (const c of casos) {
  const r = await runAgent({
    personality,
    aiConfig: { provider: 'openai', model: 'gpt-4o-mini', temperature: 0.7, maxTokens: 1000 } as any,
    behaviorConfig: {} as any,
    conversationHistory: c.historico ?? [],
    userMessage: c.msg,
    env: { openaiApiKey: process.env.OPENAI_API_KEY },
  })
  const vazou = /\[\[|\]\]/.test(r.content)
  const ok = r.shouldHandoffToHuman === c.esperaAtendente && !vazou
  if (!ok) falhas++
  console.log(`\n${ok ? 'OK ' : 'ERRO'} [${c.nome}] atendente=${r.shouldHandoffToHuman} (esperado ${c.esperaAtendente})${vazou ? ' MARCADOR VAZOU' : ''}`)
  console.log('  > ' + c.msg)
  console.log('  < ' + r.content.replace(/\n/g, '\n    '))
}
console.log(`\n${casos.length - falhas}/${casos.length} casos ok`)
process.exit(falhas ? 1 : 0)
