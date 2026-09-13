// Conversão entre o horário local da organização e UTC.
//
// A agenda inteira é gravada em timestamptz (UTC) e exibida no fuso da
// organização (agenda_settings.timezone). Todo o resto do produto assume
// America/Sao_Paulo, mas o campo existe porque cliente de outro fuso aparece.
//
// Não uso aritmética de offset fixo: o Intl já sabe o offset de qualquer fuso em
// qualquer instante, inclusive onde ainda existe horário de verão.

function offsetMinutos(tz: string, instante: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
  const parte = fmt.formatToParts(instante).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = parte.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!m) return 0 // "GMT" puro = UTC
  const sinal = m[1] === '-' ? -1 : 1
  return sinal * (Number(m[2]) * 60 + Number(m[3]))
}

/** Instante UTC correspondente a uma data+hora local ("2026-09-02", "14:30"). */
export function localParaUtc(tz: string, ymd: string, hm: string): Date {
  const hhmm = hm.slice(0, 5)
  const base = Date.parse(`${ymd}T${hhmm}:00Z`)
  // Primeira aproximação usa o offset do próprio instante-base; a segunda
  // corrige o caso de a data cair perto de uma virada de offset.
  let utc = base - offsetMinutos(tz, new Date(base)) * 60_000
  utc = base - offsetMinutos(tz, new Date(utc)) * 60_000
  return new Date(utc)
}

export type PartesLocais = {
  ymd: string        // 2026-09-02
  hm: string         // 14:30
  weekday: number    // 0 = domingo, igual a agenda_availability.weekday
}

export function partesLocais(tz: string, d: Date): PartesLocais {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]))
  const ymd = `${p.year}-${p.month}-${p.day}`
  const hora = p.hour === '24' ? '00' : p.hour
  const [y, mo, dia] = ymd.split('-').map(Number)
  return { ymd, hm: `${hora}:${p.minute}`, weekday: new Date(Date.UTC(y, mo - 1, dia)).getUTCDay() }
}

/** "02/09" + "14:30", para o texto de confirmação e para a interface. */
export function rotuloLocal(tz: string, d: Date): { data: string; hora: string; diaSemana: string } {
  const { ymd, hm, weekday } = partesLocais(tz, d)
  const [, mo, dia] = ymd.split('-')
  const nomes = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
  return { data: `${dia}/${mo}`, hora: hm, diaSemana: nomes[weekday] }
}

/** Soma dias em cima da data local, não do instante (evita erro de virada). */
export function somarDias(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() + dias)
  return base.toISOString().slice(0, 10)
}

export function minutosDoDia(hm: string): number {
  const [h, m] = hm.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

export function hmDeMinutos(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
