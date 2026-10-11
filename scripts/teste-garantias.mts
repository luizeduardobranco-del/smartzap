// Testa as garantias por código (mídia por texto e extração do resumo) com a conversa real de 04/10.
// Uso: npx tsx scripts/teste-garantias.mts
import * as g from '../apps/web/lib/agente-garantias'
const { midiasPorTexto, precisaResumo, extrairResumo } = ((g as any).midiasPorTexto ? g : (g as any).default) as typeof g

const regras = [
  { contem: 'instagram.com/transschoolrj', tipo: 'video', chave: 'garagem' },
  { contem: 'instagram.com/transschoolrj', tipo: 'video', chave: 'seguranca' },
]
const resposta = 'A Trans School atua há 11 anos...\nNosso dia a dia está no Instagram: instagram.com/transschoolrj 😊\n\n📋 Proposta para vocês\n\nColégio: Alfa Cem Tijuca\nBairro: Grajaú\nTrajeto: somente volta\nValor normal: R$ 455 por mês, por aluno\n🎉 Promoção até 10/11: R$ 418 por mês'

let ok = true
const m1 = midiasPorTexto(resposta, regras, [])
console.log('mídias sem marcador:', JSON.stringify(m1))
ok &&= m1.length === 2
const m2 = midiasPorTexto(resposta, regras, [{ tipo: 'video', chave: 'garagem' }])
console.log('com garagem já pedida:', JSON.stringify(m2))
ok &&= m2.length === 1 && m2[0].chave === 'seguranca'
ok &&= precisaResumo(resposta, ['Proposta para vocês', 'Anotei tudo']) && !precisaResumo('Oi! Tudo bem?', ['Proposta para vocês'])

const historico = [
  { role: 'user' as const, content: 'Orçamento' },
  { role: 'assistant' as const, content: 'Me diz rapidinho: qual escola e qual bairro?' },
  { role: 'user' as const, content: 'Alfa cem' },
  { role: 'user' as const, content: 'Grajau, rua Uruguai 300' },
  { role: 'assistant' as const, content: 'Como posso te chamar?' },
  { role: 'user' as const, content: 'André' },
  { role: 'assistant' as const, content: 'O aluno estuda de manhã, à tarde ou integral?' },
  { role: 'user' as const, content: 'Manha' },
  { role: 'assistant' as const, content: 'E você precisa de ida e volta, ou só um dos trajetos?' },
  { role: 'user' as const, content: 'Volta' },
]
const resumo = await extrairResumo({ openaiKey: process.env.OPENAI_API_KEY!, historico, ultimaResposta: resposta })
console.log('\nresumo extraído:\n' + resumo)
ok &&= !!resumo && /André/.test(resumo) && /Grajaú|Grajau/.test(resumo) && /Uruguai/.test(resumo) && /volta/i.test(resumo) && /418|455/.test(resumo)
console.log(ok ? '\nOK' : '\nFALHOU')
process.exit(ok ? 0 : 1)
