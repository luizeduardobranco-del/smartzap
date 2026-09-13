import { interpretarResposta } from './lembretes'
import { rotuloLocal } from './tempo'
import { SETTINGS_PADRAO } from './presets'

/**
 * Lê a resposta do contato ao pedido de confirmação da Agenda.
 *
 * Devolve o texto de retorno quando a mensagem era mesmo sobre o compromisso, e
 * null quando não era — nesse caso o webhook segue para automações e agente,
 * sem que o cliente perceba que passou por aqui.
 *
 * Só olha para quem tem pedido em aberto (`agenda_reminders.status = 'enviado'`)
 * de um compromisso futuro. Sem esse recorte, um "sim" solto no meio de uma
 * conversa qualquer confirmaria consulta da semana que vem.
 */
export async function tratarRespostaAgenda(opts: {
  supabase: any
  organizationId: string
  contactId: string
  texto: string
}): Promise<{ reply: string } | null> {
  const { supabase, organizationId, contactId, texto } = opts
  if (!texto?.trim()) return null

  const agora = new Date().toISOString()

  const { data: pendentes } = await supabase
    .from('agenda_reminders')
    .select(`
      id, appointment_id,
      agenda_appointments!inner(
        id, status, starts_at, contact_id,
        agenda_services(name),
        agenda_resources(name)
      )
    `)
    .eq('organization_id', organizationId)
    .eq('kind', 'confirmacao')
    .eq('status', 'enviado')
    .eq('agenda_appointments.contact_id', contactId)
    .in('agenda_appointments.status', ['scheduled', 'confirmed'])
    .gt('agenda_appointments.starts_at', agora)
    .order('sent_at', { ascending: false })
    .limit(1)

  const lembrete = pendentes?.[0]
  if (!lembrete) return null

  const decisao = interpretarResposta(texto)
  if (!decisao) return null // ambíguo: deixa o agente conduzir

  const appt = lembrete.agenda_appointments
  const { data: cfg } = await supabase
    .from('agenda_settings')
    .select('timezone')
    .eq('organization_id', organizationId)
    .maybeSingle()
  const tz = cfg?.timezone ?? SETTINGS_PADRAO.timezone
  const { data, hora, diaSemana } = rotuloLocal(tz, new Date(appt.starts_at))
  const servico = appt.agenda_services?.name ?? 'seu horário'

  const patchLembrete = {
    status: 'respondido',
    response_text: texto.slice(0, 500),
    responded_at: agora,
  }

  if (decisao === 'confirmada') {
    await supabase
      .from('agenda_appointments')
      .update({ status: 'confirmed', confirmation: 'confirmada', confirmed_at: agora, updated_at: agora })
      .eq('id', appt.id)
    await supabase.from('agenda_reminders').update(patchLembrete).eq('id', lembrete.id)
    return { reply: `Perfeito! Confirmado: ${servico} na ${diaSemana}, dia ${data}, às ${hora}. Até lá! 👍` }
  }

  if (decisao === 'cancelar') {
    // Cancelar de verdade é o ponto do pedido de confirmação: sem isso a cadeira
    // fica reservada para quem já avisou que não vem.
    await supabase
      .from('agenda_appointments')
      .update({ status: 'cancelled', confirmation: 'recusada', updated_at: agora })
      .eq('id', appt.id)
    await supabase.from('agenda_reminders').update(patchLembrete).eq('id', lembrete.id)
    return { reply: `Tudo bem, cancelei ${servico} de ${data} às ${hora}. Se quiser remarcar, é só me falar.` }
  }

  // remarcar: o horário fica de pé até alguém tratar, mas sai da fila de
  // confirmados para a recepção enxergar na tela.
  await supabase
    .from('agenda_appointments')
    .update({ confirmation: 'recusada', updated_at: agora })
    .eq('id', appt.id)
  await supabase.from('agenda_reminders').update(patchLembrete).eq('id', lembrete.id)
  return { reply: `Combinado, vou pedir para a nossa equipe falar com você para remarcar ${servico}.` }
}
