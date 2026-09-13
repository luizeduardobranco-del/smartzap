// Presets de nicho da Agenda.
//
// O schema é agnóstico de propósito (ver 20260828_agenda.sql): o que muda entre
// uma clínica e uma oficina é vocabulário e campos extras, não estrutura. Por
// isso os presets vivem aqui, no código — é onde dá para iterar sem migration.
// O banco guarda só qual preset foi escolhido, em agenda_settings.preset.

export type CampoExtra = {
  key: string
  label: string
  type: 'text' | 'select' | 'number' | 'date'
  options?: string[]
  required?: boolean
}

export type PresetAgenda = {
  id: string
  nome: string
  descricao: string
  labels: {
    label_resource_singular: string
    label_resource_plural: string
    label_service_singular: string
    label_service_plural: string
    label_appointment_singular: string
    label_appointment_plural: string
  }
  custom_fields: CampoExtra[]
  /** Serviços sugeridos na configuração inicial. O cliente edita depois. */
  servicos_sugeridos: { name: string; duration_minutes: number; buffer_minutes: number }[]
}

export const PRESETS: PresetAgenda[] = [
  {
    id: 'clinica',
    nome: 'Clínica / Consultório',
    descricao: 'Profissionais atendendo pacientes por consulta.',
    labels: {
      label_resource_singular: 'Profissional',
      label_resource_plural: 'Profissionais',
      label_service_singular: 'Consulta',
      label_service_plural: 'Consultas',
      label_appointment_singular: 'Agendamento',
      label_appointment_plural: 'Agendamentos',
    },
    custom_fields: [
      { key: 'convenio', label: 'Convênio', type: 'select', options: ['Particular', 'Unimed', 'Bradesco Saúde', 'SulAmérica', 'Amil'] },
      { key: 'primeira_vez', label: 'Primeira consulta', type: 'select', options: ['Sim', 'Não'] },
    ],
    servicos_sugeridos: [
      { name: 'Consulta',  duration_minutes: 40, buffer_minutes: 5 },
      { name: 'Retorno',   duration_minutes: 20, buffer_minutes: 5 },
    ],
  },
  {
    id: 'salao',
    nome: 'Salão / Barbearia / Estética',
    descricao: 'Cadeiras e profissionais com serviços de duração fixa.',
    labels: {
      label_resource_singular: 'Profissional',
      label_resource_plural: 'Profissionais',
      label_service_singular: 'Serviço',
      label_service_plural: 'Serviços',
      label_appointment_singular: 'Horário',
      label_appointment_plural: 'Horários',
    },
    custom_fields: [
      { key: 'indicacao', label: 'Como conheceu', type: 'text' },
    ],
    servicos_sugeridos: [
      { name: 'Corte',            duration_minutes: 30, buffer_minutes: 5 },
      { name: 'Corte + barba',    duration_minutes: 60, buffer_minutes: 5 },
      { name: 'Coloração',        duration_minutes: 90, buffer_minutes: 10 },
    ],
  },
  {
    id: 'oficina',
    nome: 'Oficina / Serviço automotivo',
    descricao: 'Boxes e mecânicos com ordens de serviço marcadas.',
    labels: {
      label_resource_singular: 'Box',
      label_resource_plural: 'Boxes',
      label_service_singular: 'Serviço',
      label_service_plural: 'Serviços',
      label_appointment_singular: 'Ordem',
      label_appointment_plural: 'Ordens',
    },
    custom_fields: [
      { key: 'placa',   label: 'Placa',   type: 'text', required: true },
      { key: 'veiculo', label: 'Veículo', type: 'text' },
      { key: 'km',      label: 'KM',      type: 'number' },
    ],
    servicos_sugeridos: [
      { name: 'Revisão',        duration_minutes: 120, buffer_minutes: 15 },
      { name: 'Troca de óleo',  duration_minutes: 45,  buffer_minutes: 10 },
      { name: 'Diagnóstico',    duration_minutes: 60,  buffer_minutes: 10 },
    ],
  },
  {
    id: 'consultoria',
    nome: 'Consultoria / Escritório',
    descricao: 'Reuniões com consultores, advogados ou contadores.',
    labels: {
      label_resource_singular: 'Consultor',
      label_resource_plural: 'Consultores',
      label_service_singular: 'Reunião',
      label_service_plural: 'Reuniões',
      label_appointment_singular: 'Compromisso',
      label_appointment_plural: 'Compromissos',
    },
    custom_fields: [
      { key: 'assunto',  label: 'Assunto',  type: 'text' },
      { key: 'processo', label: 'Processo', type: 'text' },
    ],
    servicos_sugeridos: [
      { name: 'Reunião inicial',  duration_minutes: 60, buffer_minutes: 0 },
      { name: 'Acompanhamento',   duration_minutes: 30, buffer_minutes: 0 },
    ],
  },
  {
    id: 'generico',
    nome: 'Outro segmento',
    descricao: 'Vocabulário neutro; dá para renomear tudo depois.',
    labels: {
      label_resource_singular: 'Recurso',
      label_resource_plural: 'Recursos',
      label_service_singular: 'Serviço',
      label_service_plural: 'Serviços',
      label_appointment_singular: 'Agendamento',
      label_appointment_plural: 'Agendamentos',
    },
    custom_fields: [],
    servicos_sugeridos: [
      { name: 'Atendimento', duration_minutes: 60, buffer_minutes: 0 },
    ],
  },
]

export function acharPreset(id: string | null | undefined): PresetAgenda | null {
  if (!id) return null
  return PRESETS.find((p) => p.id === id) ?? null
}

/** Usado quando a organização ainda não tem linha em agenda_settings. */
export const SETTINGS_PADRAO = {
  preset: null as string | null,
  ...PRESETS[PRESETS.length - 1].labels,
  custom_fields: [] as CampoExtra[],
  timezone: 'America/Sao_Paulo',
  confirmation_hours_before: 24,
  auto_confirm_on_no_reply: false,
  send_window_start: '08:00',
  send_window_end: '20:00',
  confirmation_template: null as string | null,
}
