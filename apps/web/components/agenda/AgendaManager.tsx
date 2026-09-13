'use client'

import { useMemo, useState } from 'react'
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Loader2, X, Check, Clock,
  UserX, Ban, CalendarClock, Settings2, Search, MessageSquareWarning, CircleCheck,
  CircleDashed, Send, AlertTriangle,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { localParaUtc, partesLocais, somarDias } from '@/lib/agenda/tempo'
import { AgendaSettingsPanel } from './AgendaSettingsPanel'

// ─── Rótulos de estado ────────────────────────────────────────────────────────

const STATUS = {
  scheduled: { label: 'Marcado',   cor: 'bg-blue-100 text-blue-700',     icon: CalendarClock },
  confirmed: { label: 'Confirmado', cor: 'bg-green-100 text-green-700',  icon: CircleCheck },
  completed: { label: 'Atendido',  cor: 'bg-slate-200 text-slate-700',   icon: Check },
  no_show:   { label: 'Faltou',    cor: 'bg-amber-100 text-amber-700',   icon: UserX },
  cancelled: { label: 'Cancelado', cor: 'bg-red-100 text-red-700',       icon: Ban },
} as const

const CONFIRMACAO = {
  pendente:     { label: 'Confirmação não enviada', cor: 'text-slate-400',  icon: CircleDashed },
  enviada:      { label: 'Confirmação enviada',     cor: 'text-blue-500',   icon: Send },
  confirmada:   { label: 'Confirmou',               cor: 'text-green-600',  icon: CircleCheck },
  recusada:     { label: 'Recusou / quer remarcar', cor: 'text-red-500',    icon: MessageSquareWarning },
  sem_resposta: { label: 'Não respondeu',           cor: 'text-amber-500',  icon: AlertTriangle },
} as const

type StatusKey = keyof typeof STATUS
type ConfirmKey = keyof typeof CONFIRMACAO

function hora(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
}

function dataLonga(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', {
    timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'long',
  })
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function AgendaManager() {
  const [aba, setAba] = useState<'agenda' | 'config'>('agenda')
  const [criando, setCriando] = useState(false)
  const [selecionado, setSelecionado] = useState<any | null>(null)

  const settings = trpc.agenda.getSettings.useQuery()
  const tz = settings.data?.timezone ?? 'America/Sao_Paulo'

  const [ymd, setYmd] = useState(() => partesLocais('America/Sao_Paulo', new Date()).ymd)

  const janela = useMemo(() => ({
    from: localParaUtc(tz, ymd, '00:00').toISOString(),
    to: localParaUtc(tz, somarDias(ymd, 1), '00:00').toISOString(),
  }), [tz, ymd])

  const recursos = trpc.agenda.listResources.useQuery()
  const servicos = trpc.agenda.listServices.useQuery()
  const compromissos = trpc.agenda.listAppointments.useQuery(janela)
  const resumo = trpc.agenda.resumo.useQuery(janela)

  const utils = trpc.useUtils()
  const recarregar = () => {
    utils.agenda.listAppointments.invalidate()
    utils.agenda.resumo.invalidate()
    utils.agenda.availableSlots.invalidate()
  }

  const semEstrutura = !recursos.isLoading && !servicos.isLoading &&
    ((recursos.data?.length ?? 0) === 0 || (servicos.data?.length ?? 0) === 0)

  const L = settings.data ?? {
    label_resource_plural: 'Recursos',
    label_appointment_plural: 'Agendamentos',
    label_appointment_singular: 'Agendamento',
    label_service_singular: 'Serviço',
  } as any

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Agenda</h1>
            <p className="text-sm text-muted-foreground">
              {L.label_appointment_plural} com confirmação automática por WhatsApp
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5">
            <button
              onClick={() => setAba('agenda')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${aba === 'agenda' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
            >
              Agenda
            </button>
            <button
              onClick={() => setAba('config')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${aba === 'config' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
            >
              <Settings2 className="h-3.5 w-3.5" /> Configuração
            </button>
          </div>

          {aba === 'agenda' && (
            <button
              onClick={() => setCriando(true)}
              disabled={semEstrutura}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Novo
            </button>
          )}
        </div>
      </div>

      {aba === 'config' ? (
        <div className="flex-1 overflow-y-auto p-6">
          <AgendaSettingsPanel />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          {semEstrutura ? (
            <VazioSemEstrutura
              temRecurso={(recursos.data?.length ?? 0) > 0}
              temServico={(servicos.data?.length ?? 0) > 0}
              irParaConfig={() => setAba('config')}
            />
          ) : (
            <>
              {/* Navegação de dia */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => setYmd(somarDias(ymd, -1))} className="rounded-lg border p-2 hover:bg-muted">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setYmd(partesLocais(tz, new Date()).ymd)}
                    className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
                  >
                    Hoje
                  </button>
                  <button onClick={() => setYmd(somarDias(ymd, 1))} className="rounded-lg border p-2 hover:bg-muted">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <input
                    type="date"
                    value={ymd}
                    onChange={(e) => e.target.value && setYmd(e.target.value)}
                    className="rounded-lg border px-3 py-2 text-sm"
                  />
                  <span className="ml-1 text-sm font-medium capitalize text-muted-foreground">{dataLonga(ymd)}</span>
                </div>

                {resumo.data && resumo.data.total > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Pilula texto={`${resumo.data.total} no dia`} cor="bg-slate-100 text-slate-700" />
                    {Object.entries(resumo.data.porConfirmacao).map(([k, v]) => {
                      const c = CONFIRMACAO[k as ConfirmKey]
                      if (!c) return null
                      return <Pilula key={k} texto={`${v} · ${c.label}`} cor="bg-white border" />
                    })}
                  </div>
                )}
              </div>

              {/* Quadro por recurso */}
              {compromissos.isLoading ? (
                <div className="flex items-center gap-2 p-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {(recursos.data ?? []).map((r: any) => {
                    const doRecurso = (compromissos.data ?? []).filter((a: any) => a.resource_id === r.id)
                    return (
                      <div key={r.id} className="rounded-xl border bg-white">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: r.color ?? '#2563eb' }}
                            />
                            <span className="font-medium">{r.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{doRecurso.length}</span>
                        </div>

                        <div className="divide-y">
                          {doRecurso.length === 0 && (
                            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Dia livre</p>
                          )}
                          {doRecurso.map((a: any) => (
                            <CartaoCompromisso key={a.id} a={a} tz={tz} onClick={() => setSelecionado(a)} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {criando && (
        <ModalNovoCompromisso
          tz={tz}
          ymdInicial={ymd}
          settings={settings.data}
          servicos={servicos.data ?? []}
          onClose={() => setCriando(false)}
          onSalvo={() => { setCriando(false); recarregar() }}
        />
      )}

      {selecionado && (
        <PainelCompromisso
          a={selecionado}
          tz={tz}
          settings={settings.data}
          onClose={() => setSelecionado(null)}
          onMudou={() => { setSelecionado(null); recarregar() }}
        />
      )}
    </div>
  )
}

// ─── Peças ────────────────────────────────────────────────────────────────────

function Pilula({ texto, cor }: { texto: string; cor: string }) {
  return <span className={`rounded-full px-2.5 py-1 ${cor}`}>{texto}</span>
}

function CartaoCompromisso({ a, tz, onClick }: { a: any; tz: string; onClick: () => void }) {
  const st = STATUS[a.status as StatusKey] ?? STATUS.scheduled
  const cf = CONFIRMACAO[a.confirmation as ConfirmKey] ?? CONFIRMACAO.pendente
  const IconeCf = cf.icon
  const riscado = a.status === 'cancelled'

  return (
    <button onClick={onClick} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50">
      <div className="w-14 shrink-0 text-sm font-semibold tabular-nums">{hora(a.starts_at, tz)}</div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${riscado ? 'text-muted-foreground line-through' : ''}`}>
          {a.contacts?.name ?? 'Sem nome'}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {a.agenda_services?.name ?? '—'} · até {hora(a.ends_at, tz)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cor}`}>{st.label}</span>
        <span title={cf.label} className={cf.cor}><IconeCf className="h-3.5 w-3.5" /></span>
      </div>
    </button>
  )
}

function VazioSemEstrutura({
  temRecurso, temServico, irParaConfig,
}: { temRecurso: boolean; temServico: boolean; irParaConfig: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border bg-white p-8 text-center">
      <CalendarDays className="mx-auto mb-3 h-10 w-10 text-primary" />
      <h2 className="text-lg font-semibold">Configure a agenda antes de marcar</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Falta cadastrar {!temRecurso && 'quem (ou o quê) fica ocupado'}
        {!temRecurso && !temServico && ' e '}
        {!temServico && 'o que pode ser marcado, com duração'}.
        Escolher um preset de segmento já deixa quase tudo pronto.
      </p>
      <button onClick={irParaConfig} className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white">
        Abrir configuração
      </button>
    </div>
  )
}

// ─── Modal: novo compromisso ──────────────────────────────────────────────────

function ModalNovoCompromisso({
  tz, ymdInicial, settings, servicos, onClose, onSalvo,
}: {
  tz: string
  ymdInicial: string
  settings: any
  servicos: any[]
  onClose: () => void
  onSalvo: () => void
}) {
  const [serviceId, setServiceId] = useState(servicos[0]?.id ?? '')
  const [ymd, setYmd] = useState(ymdInicial)
  const [slot, setSlot] = useState<{ iso: string; resourceId: string } | null>(null)
  const [busca, setBusca] = useState('')
  const [contato, setContato] = useState<any | null>(null)
  const [novo, setNovo] = useState({ name: '', phone: '' })
  const [modoNovo, setModoNovo] = useState(false)
  const [notes, setNotes] = useState('')
  const [customData, setCustomData] = useState<Record<string, any>>({})
  const [erro, setErro] = useState<string | null>(null)

  const slots = trpc.agenda.availableSlots.useQuery(
    { ymd, serviceId },
    { enabled: Boolean(serviceId && ymd) }
  )
  const contatos = trpc.contacts.list.useQuery(
    { search: busca, limit: 8, offset: 0 },
    { enabled: busca.length >= 2 }
  )
  const criar = trpc.agenda.createAppointment.useMutation({
    onSuccess: onSalvo,
    onError: (e) => setErro(e.message),
  })

  const campos = (settings?.custom_fields ?? []) as any[]

  function salvar() {
    setErro(null)
    if (!slot) return setErro('Escolha um horário.')
    if (!contato && !(modoNovo && novo.name && novo.phone)) return setErro('Escolha ou cadastre um contato.')
    const faltando = campos.filter((c) => c.required && !customData[c.key])
    if (faltando.length) return setErro(`Preencha: ${faltando.map((c) => c.label).join(', ')}`)

    criar.mutate({
      resourceId: slot.resourceId,
      serviceId,
      startsAt: slot.iso,
      contactId: contato?.id,
      novoContato: contato ? undefined : { name: novo.name, phone: novo.phone },
      notes: notes || undefined,
      customData,
    })
  }

  return (
    <Modal titulo={`Novo ${settings?.label_appointment_singular ?? 'agendamento'}`} onClose={onClose}>
      <div className="space-y-4">
        {/* Serviço + data */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label={settings?.label_service_singular ?? 'Serviço'}>
            <select
              value={serviceId}
              onChange={(e) => { setServiceId(e.target.value); setSlot(null) }}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.duration_minutes}min
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Data">
            <input
              type="date"
              value={ymd}
              onChange={(e) => { setYmd(e.target.value); setSlot(null) }}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </Campo>
        </div>

        {/* Horários livres */}
        <Campo label="Horários livres">
          {slots.isLoading ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> calculando…
            </div>
          ) : (slots.data ?? []).every((r: any) => r.slots.length === 0) ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Nenhum horário livre nesse dia. Confira o expediente do recurso na aba Configuração.
            </p>
          ) : (
            <div className="space-y-3">
              {(slots.data ?? []).filter((r: any) => r.slots.length).map((r: any) => (
                <div key={r.resource.id}>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">{r.resource.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {r.slots.map((iso: string) => {
                      const ativo = slot?.iso === iso && slot?.resourceId === r.resource.id
                      return (
                        <button
                          key={iso}
                          onClick={() => setSlot({ iso, resourceId: r.resource.id })}
                          className={`rounded-lg border px-3 py-1.5 text-sm tabular-nums ${
                            ativo ? 'border-primary bg-primary text-white' : 'hover:bg-muted'
                          }`}
                        >
                          {hora(iso, tz)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Campo>

        {/* Contato */}
        <Campo label="Contato">
          {contato ? (
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
              <span className="text-sm">
                {contato.name} <span className="text-muted-foreground">· {contato.phone}</span>
              </span>
              <button onClick={() => setContato(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : modoNovo ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                placeholder="Nome"
                value={novo.name}
                onChange={(e) => setNovo({ ...novo, name: e.target.value })}
                className="rounded-lg border px-3 py-2 text-sm"
              />
              <input
                placeholder="WhatsApp (só números)"
                value={novo.phone}
                onChange={(e) => setNovo({ ...novo, phone: e.target.value })}
                className="rounded-lg border px-3 py-2 text-sm"
              />
              <button onClick={() => setModoNovo(false)} className="text-left text-xs text-primary sm:col-span-2">
                buscar um contato existente
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  placeholder="Buscar por nome ou telefone"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full text-sm outline-none"
                />
              </div>
              {busca.length >= 2 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border">
                  {(contatos.data?.contacts ?? []).map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => { setContato(c); setBusca('') }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      {c.name} <span className="text-muted-foreground">· {c.phone}</span>
                    </button>
                  ))}
                  {!contatos.isLoading && (contatos.data?.contacts.length ?? 0) === 0 && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum contato encontrado.</p>
                  )}
                </div>
              )}
              <button onClick={() => setModoNovo(true)} className="mt-1.5 text-xs text-primary">
                cadastrar contato novo
              </button>
            </div>
          )}
        </Campo>

        {/* Campos extras do segmento */}
        {campos.map((c) => (
          <Campo key={c.key} label={`${c.label}${c.required ? ' *' : ''}`}>
            {c.type === 'select' ? (
              <select
                value={customData[c.key] ?? ''}
                onChange={(e) => setCustomData({ ...customData, [c.key]: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {(c.options ?? []).map((o: string) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                value={customData[c.key] ?? ''}
                onChange={(e) => setCustomData({ ...customData, [c.key]: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            )}
          </Campo>
        ))}

        <Campo label="Observações">
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </Campo>

        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

        <div className="flex justify-end gap-2 border-t pt-4">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
          <button
            onClick={salvar}
            disabled={criar.isPending}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {criar.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Agendar
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Painel: compromisso existente ────────────────────────────────────────────

function PainelCompromisso({
  a, tz, settings, onClose, onMudou,
}: { a: any; tz: string; settings: any; onClose: () => void; onMudou: () => void }) {
  const [erro, setErro] = useState<string | null>(null)
  const [remarcando, setRemarcando] = useState(false)
  const [ymd, setYmd] = useState(() => partesLocais(tz, new Date(a.starts_at)).ymd)

  const atualizar = trpc.agenda.updateAppointment.useMutation({ onSuccess: onMudou, onError: (e) => setErro(e.message) })
  const remarcar = trpc.agenda.rescheduleAppointment.useMutation({ onSuccess: onMudou, onError: (e) => setErro(e.message) })

  const slots = trpc.agenda.availableSlots.useQuery(
    { ymd, serviceId: a.service_id, ignorarAppointmentId: a.id },
    { enabled: remarcando && Boolean(a.service_id) }
  )

  const cf = CONFIRMACAO[a.confirmation as ConfirmKey] ?? CONFIRMACAO.pendente
  const st = STATUS[a.status as StatusKey] ?? STATUS.scheduled

  const acoes: { label: string; status: 'confirmed' | 'completed' | 'no_show' | 'cancelled'; icon: any; cor: string }[] = [
    { label: 'Confirmar',  status: 'confirmed', icon: Check,  cor: 'text-green-700 border-green-200 hover:bg-green-50' },
    { label: 'Atendido',   status: 'completed', icon: CircleCheck, cor: 'text-slate-700 hover:bg-muted' },
    { label: 'Faltou',     status: 'no_show',   icon: UserX,  cor: 'text-amber-700 border-amber-200 hover:bg-amber-50' },
    { label: 'Cancelar',   status: 'cancelled', icon: Ban,    cor: 'text-red-700 border-red-200 hover:bg-red-50' },
  ]

  return (
    <Modal titulo={a.contacts?.name ?? 'Compromisso'} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {new Date(a.starts_at).toLocaleDateString('pt-BR', { timeZone: tz, weekday: 'long', day: '2-digit', month: 'long' })}
            {' · '}{hora(a.starts_at, tz)} às {hora(a.ends_at, tz)}
          </div>
          <p className="mt-2 text-muted-foreground">
            {a.agenda_services?.name ?? '—'} com {a.agenda_resources?.name ?? '—'}
          </p>
          <p className="mt-1 text-muted-foreground">{a.contacts?.phone ?? a.contacts?.external_id ?? ''}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cor}`}>{st.label}</span>
            <span className={`text-xs ${cf.cor}`}>{cf.label}</span>
          </div>
        </div>

        {Object.keys(a.custom_data ?? {}).length > 0 && (
          <div className="rounded-lg border p-3 text-sm">
            {(settings?.custom_fields ?? []).map((c: any) =>
              a.custom_data?.[c.key] ? (
                <p key={c.key}><span className="text-muted-foreground">{c.label}:</span> {a.custom_data[c.key]}</p>
              ) : null
            )}
          </div>
        )}

        {a.notes && <p className="rounded-lg border p-3 text-sm">{a.notes}</p>}

        {/* Ações de estado */}
        <div className="flex flex-wrap gap-2">
          {acoes.map((ac) => (
            <button
              key={ac.status}
              disabled={atualizar.isPending || a.status === ac.status}
              onClick={() => atualizar.mutate({ id: a.id, status: ac.status })}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm disabled:opacity-40 ${ac.cor}`}
            >
              <ac.icon className="h-4 w-4" /> {ac.label}
            </button>
          ))}
          <button
            onClick={() => setRemarcando((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
          >
            <CalendarClock className="h-4 w-4" /> Remarcar
          </button>
        </div>

        {/* Remarcação */}
        {remarcando && (
          <div className="space-y-3 rounded-lg border p-3">
            <input
              type="date"
              value={ymd}
              onChange={(e) => setYmd(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm"
            />
            {slots.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> calculando…
              </div>
            ) : (
              (slots.data ?? []).filter((r: any) => r.slots.length).map((r: any) => (
                <div key={r.resource.id}>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">{r.resource.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {r.slots.map((iso: string) => (
                      <button
                        key={iso}
                        disabled={remarcar.isPending}
                        onClick={() => remarcar.mutate({ id: a.id, startsAt: iso, resourceId: r.resource.id })}
                        className="rounded-lg border px-3 py-1.5 text-sm tabular-nums hover:bg-primary hover:text-white"
                      >
                        {hora(iso, tz)}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
            <p className="text-xs text-muted-foreground">
              Remarcar zera a confirmação: um novo pedido sai para o contato.
            </p>
          </div>
        )}

        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}
      </div>
    </Modal>
  )
}

// ─── Blocos reutilizados ──────────────────────────────────────────────────────

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="mt-8 w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}
