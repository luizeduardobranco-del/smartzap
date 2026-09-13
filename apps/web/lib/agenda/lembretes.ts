import { localParaUtc, partesLocais, rotuloLocal, minutosDoDia, somarDias } from './tempo'

export const TEMPLATE_CONFIRMACAO_PADRAO =
  'Olá {{contato}}! Confirmando seu agendamento de {{servico}} com {{recurso}} ' +
  '{{diaSemana}}, dia {{data}}, às {{hora}}.\n\n' +
  'Responda *SIM* para confirmar ou *NÃO* para cancelar.'

export type JanelaEnvio = { inicio: string; fim: string } // '08:00' / '20:00'

/**
 * Quando o pedido de confirmação deve sair.
 *
 * Regra: `confirmation_hours_before` antes do compromisso, empurrado para dentro
 * da janela de envio — ninguém recebe cobrança de confirmação às 3h da manhã.
 * Se o horário calculado já passou (compromisso marcado em cima da hora), sai
 * agora, desde que ainda dê tempo. Devolve null quando não vale mais mandar.
 */
export function calcularEnvioConfirmacao(opts: {
  tz: string
  inicioCompromisso: Date
  horasAntes: number
  janela: JanelaEnvio
  agora?: Date
  /** Abaixo disto o pedido não sai mais — o cliente já está a caminho. */
  margemMinimaMin?: number
}): Date | null {
  const agora = opts.agora ?? new Date()
  const margem = opts.margemMinimaMin ?? 30

  if (opts.inicioCompromisso.getTime() - agora.getTime() < margem * 60_000) return null

  const alvo = new Date(opts.inicioCompromisso.getTime() - opts.horasAntes * 3_600_000)
  const dentro = empurrarParaJanela(opts.tz, alvo, opts.janela)

  // Empurrar para a janela não pode atrasar o pedido para depois do próprio
  // compromisso: nesse caso o pedido perde a função.
  if (dentro.getTime() > opts.inicioCompromisso.getTime() - margem * 60_000) {
    const agoraNaJanela = dentroDaJanela(opts.tz, agora, opts.janela)
    return agoraNaJanela ? agora : null
  }

  return dentro.getTime() < agora.getTime() ? agora : dentro
}

export function dentroDaJanela(tz: string, instante: Date, janela: JanelaEnvio): boolean {
  const { hm } = partesLocais(tz, instante)
  const min = minutosDoDia(hm)
  return min >= minutosDoDia(janela.inicio) && min <= minutosDoDia(janela.fim)
}

/** Antes da abertura → abre no mesmo dia. Depois do fechamento → abre no dia seguinte. */
export function empurrarParaJanela(tz: string, instante: Date, janela: JanelaEnvio): Date {
  const { ymd, hm } = partesLocais(tz, instante)
  const min = minutosDoDia(hm)
  if (min < minutosDoDia(janela.inicio)) return localParaUtc(tz, ymd, janela.inicio)
  if (min > minutosDoDia(janela.fim)) return localParaUtc(tz, somarDias(ymd, 1), janela.inicio)
  return instante
}

export function montarTextoConfirmacao(opts: {
  template?: string | null
  tz: string
  contato: string
  servico: string
  recurso: string
  inicio: Date
}): string {
  const { data, hora, diaSemana } = rotuloLocal(opts.tz, opts.inicio)
  const base = opts.template?.trim() || TEMPLATE_CONFIRMACAO_PADRAO
  return base
    .replace(/\{\{\s*contato\s*\}\}/gi, opts.contato)
    .replace(/\{\{\s*servico\s*\}\}/gi, opts.servico)
    .replace(/\{\{\s*serviço\s*\}\}/gi, opts.servico)
    .replace(/\{\{\s*recurso\s*\}\}/gi, opts.recurso)
    .replace(/\{\{\s*data\s*\}\}/gi, data)
    .replace(/\{\{\s*hora\s*\}\}/gi, hora)
    .replace(/\{\{\s*diaSemana\s*\}\}/gi, diaSemana)
}

export type RespostaConfirmacao = 'confirmada' | 'cancelar' | 'remarcar'

// 'vou' e 'estarei' ficaram de fora: casam com "não vou poder", e aí o sinal
// contraditório derrubava a leitura de uma resposta que era claramente um não.
const SIM = /\b(sim|confirmo|confirmado|confirmada|confirmar|ok|okay|okey|blz|beleza|isso|positivo|pode ser|s)\b/
const NAO = /\b(nao|n|cancela|cancelar|cancelado|desmarcar|desmarca|negativo)\b/
const REMARCAR = /\b(remarcar|remarca|adiar|outro dia|outro horario|mudar|trocar|transferir)\b/

/**
 * Lê a resposta do contato ao pedido de confirmação.
 *
 * Deliberadamente conservador: só decide em mensagem curta e quando não há
 * sinal contraditório. Na dúvida devolve null e a conversa segue para o agente
 * — errar aqui cancela consulta de gente que ia comparecer.
 */
export function interpretarResposta(texto: string): RespostaConfirmacao | null {
  const t = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!t || t.length > 80) return null

  if (REMARCAR.test(t)) return 'remarcar'

  const sim = SIM.test(t)
  const nao = NAO.test(t)
  if (sim && nao) return null
  if (sim) return 'confirmada'
  if (nao) return 'cancelar'
  return null
}
