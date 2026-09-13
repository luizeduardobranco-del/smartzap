import { localParaUtc, minutosDoDia, hmDeMinutos } from './tempo'

export type Intervalo = { inicio: Date; fim: Date }

export type Expediente = { start_time: string; end_time: string }

/**
 * Horários livres de UM recurso em UM dia.
 *
 * O passo da grade é duração + buffer: os horários saem encostados um no outro,
 * que é como uma recepção de fato preenche o dia. O bloco reservado inclui o
 * buffer (mesma conta de ends_at no banco), mas o encaixe só exige que o
 * ATENDIMENTO caiba no expediente — buffer de limpeza depois do fechamento não
 * derruba o último horário do dia.
 */
export function slotsDoDia(opts: {
  tz: string
  ymd: string
  expediente: Expediente[]
  ocupados: Intervalo[]
  duracaoMin: number
  bufferMin: number
  agora?: Date
}): Date[] {
  const { tz, ymd, expediente, ocupados, duracaoMin, bufferMin } = opts
  if (duracaoMin <= 0 || expediente.length === 0) return []

  const passo = duracaoMin + bufferMin
  const agora = opts.agora ?? new Date()
  const livres: Date[] = []

  for (const janela of expediente) {
    const abre = minutosDoDia(janela.start_time)
    const fecha = minutosDoDia(janela.end_time)

    for (let t = abre; t + duracaoMin <= fecha; t += passo) {
      const inicio = localParaUtc(tz, ymd, hmDeMinutos(t))
      const fim = new Date(inicio.getTime() + passo * 60_000)

      if (inicio.getTime() <= agora.getTime()) continue // não oferece passado
      if (ocupados.some((o) => inicio < o.fim && fim > o.inicio)) continue

      livres.push(inicio)
    }
  }

  return livres.sort((a, b) => a.getTime() - b.getTime())
}

/** Fim de um compromisso: atendimento + buffer, igual ao que vai em ends_at. */
export function fimDoCompromisso(inicio: Date, duracaoMin: number, bufferMin: number): Date {
  return new Date(inicio.getTime() + (duracaoMin + bufferMin) * 60_000)
}
