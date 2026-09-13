import * as tempoMod from './apps/web/lib/agenda/tempo'
import * as slotsMod from './apps/web/lib/agenda/slots'
import * as lembMod from './apps/web/lib/agenda/lembretes'

const interop = (m: any) => m?.default ?? m
const { localParaUtc, partesLocais, somarDias } = interop(tempoMod)
const { slotsDoDia, fimDoCompromisso } = interop(slotsMod)
const { calcularEnvioConfirmacao, montarTextoConfirmacao, interpretarResposta, empurrarParaJanela } = interop(lembMod)

const TZ = 'America/Sao_Paulo'
let falhas = 0
function ok(nome: string, cond: boolean, extra: unknown = '') {
  if (!cond) { falhas++; console.log('FALHOU:', nome, extra) } else console.log('ok   ', nome)
}

// tempo
const d = localParaUtc(TZ, '2026-09-02', '14:30')
ok('local→utc soma 3h', d.toISOString() === '2026-09-02T17:30:00.000Z', d.toISOString())
const p = partesLocais(TZ, d)
ok('utc→local volta', p.ymd === '2026-09-02' && p.hm === '14:30', p)
ok('quarta-feira = 3', p.weekday === 3, p.weekday)
ok('somarDias vira o mês', somarDias('2026-09-30', 1) === '2026-10-01')
ok('somarDias volta o mês', somarDias('2026-03-01', -1) === '2026-02-28')

// slots
const livres = slotsDoDia({
  tz: TZ, ymd: '2026-09-02',
  expediente: [{ start_time: '08:00', end_time: '12:00' }, { start_time: '13:00', end_time: '18:00' }],
  ocupados: [{ inicio: localParaUtc(TZ, '2026-09-02', '09:00'), fim: localParaUtc(TZ, '2026-09-02', '10:00') }],
  duracaoMin: 50, bufferMin: 10,
  agora: new Date('2026-09-01T00:00:00Z'),
})
const horas = livres.map((x) => partesLocais(TZ, x).hm)
ok('manhã sem o ocupado', JSON.stringify(horas.slice(0, 3)) === JSON.stringify(['08:00', '10:00', '11:00']), horas)
ok('tarde a partir das 13', horas.includes('13:00') && horas.includes('17:00'), horas)
ok('não passa do fechamento', !horas.includes('18:00'), horas)

const semPassado = slotsDoDia({
  tz: TZ, ymd: '2026-09-02',
  expediente: [{ start_time: '08:00', end_time: '18:00' }],
  ocupados: [], duracaoMin: 60, bufferMin: 0,
  agora: localParaUtc(TZ, '2026-09-02', '14:20'),
})
ok('descarta horário passado', partesLocais(TZ, semPassado[0]).hm === '15:00', partesLocais(TZ, semPassado[0]).hm)

ok('fim = duração + buffer',
  fimDoCompromisso(new Date('2026-09-02T17:00:00Z'), 50, 10).toISOString() === '2026-09-02T18:00:00.000Z')

// lembretes
const inicio = localParaUtc(TZ, '2026-09-10', '09:00')
const envio = calcularEnvioConfirmacao({
  tz: TZ, inicioCompromisso: inicio, horasAntes: 24,
  janela: { inicio: '08:00', fim: '20:00' }, agora: new Date('2026-09-01T12:00:00Z'),
})
ok('confirmação 24h antes', envio !== null && partesLocais(TZ, envio!).ymd === '2026-09-09' && partesLocais(TZ, envio!).hm === '09:00',
  envio && partesLocais(TZ, envio))

const madrugada = calcularEnvioConfirmacao({
  tz: TZ, inicioCompromisso: localParaUtc(TZ, '2026-09-10', '05:00'), horasAntes: 24,
  janela: { inicio: '08:00', fim: '20:00' }, agora: new Date('2026-09-01T12:00:00Z'),
})
ok('empurra para dentro da janela', madrugada !== null && partesLocais(TZ, madrugada!).hm === '08:00',
  madrugada && partesLocais(TZ, madrugada))

ok('depois das 20h vai para o dia seguinte',
  partesLocais(TZ, empurrarParaJanela(TZ, localParaUtc(TZ, '2026-09-09', '22:00'), { inicio: '08:00', fim: '20:00' })).ymd === '2026-09-10')

const emCima = calcularEnvioConfirmacao({
  tz: TZ, inicioCompromisso: new Date(Date.parse('2026-09-01T12:10:00Z')), horasAntes: 24,
  janela: { inicio: '08:00', fim: '20:00' }, agora: new Date('2026-09-01T12:00:00Z'),
})
ok('não pede confirmação em cima da hora', emCima === null, emCima)

const texto = montarTextoConfirmacao({ tz: TZ, contato: 'Ana', servico: 'Consulta', recurso: 'Dra. Paula', inicio })
ok('template preenchido', texto.includes('Ana') && texto.includes('Consulta') && texto.includes('10/09') && texto.includes('09:00'), texto)

const casos: [string, string | null][] = [
  ['sim', 'confirmada'], ['Sim!', 'confirmada'], ['confirmo', 'confirmada'], ['Ok 👍', 'confirmada'],
  ['não', 'cancelar'], ['nao vou poder', 'cancelar'], ['cancelar', 'cancelar'],
  ['pode remarcar?', 'remarcar'],
  ['sim, mas não sei se dá', null],
  ['quanto custa a consulta?', null],
  ['', null],
]
for (const [entrada, esperado] of casos) {
  ok(`resposta "${entrada}" → ${esperado}`, interpretarResposta(entrada) === esperado, interpretarResposta(entrada))
}

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`)
process.exit(falhas ? 1 : 0)
