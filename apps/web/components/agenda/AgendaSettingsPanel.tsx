'use client'

import { useEffect, useState } from 'react'
import {
  Loader2, Plus, Trash2, Save, Users, ListChecks, CalendarOff, MessageSquare,
  Sparkles, Pencil, X, Check,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { TEMPLATE_CONFIRMACAO_PADRAO } from '@/lib/agenda/lembretes'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

type LinhaDia = { ativo: boolean; inicio: string; fim: string; tardeAtiva: boolean; tardeInicio: string; tardeFim: string }

const DIA_VAZIO: LinhaDia = {
  ativo: false, inicio: '08:00', fim: '12:00',
  tardeAtiva: false, tardeInicio: '13:00', tardeFim: '18:00',
}

export function AgendaSettingsPanel() {
  const utils = trpc.useUtils()
  const settings = trpc.agenda.getSettings.useQuery()
  const presets = trpc.agenda.presets.useQuery()
  const recursos = trpc.agenda.listResources.useQuery({ incluirInativos: true })
  const servicos = trpc.agenda.listServices.useQuery({ incluirInativos: true })

  const L = settings.data

  const recarregar = () => {
    utils.agenda.getSettings.invalidate()
    utils.agenda.listResources.invalidate()
    utils.agenda.listServices.invalidate()
    utils.agenda.listAvailability.invalidate()
    utils.agenda.availableSlots.invalidate()
  }

  if (settings.isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {!L?.preset && <BlocoPresets presets={presets.data ?? []} onAplicado={recarregar} />}

      <BlocoServicos servicos={servicos.data ?? []} rotulo={L?.label_service_plural ?? 'Serviços'} onMudou={recarregar} />
      <BlocoRecursos
        recursos={recursos.data ?? []}
        servicos={servicos.data ?? []}
        rotulo={L?.label_resource_plural ?? 'Recursos'}
        onMudou={recarregar}
      />
      <BlocoBloqueios recursos={recursos.data ?? []} />
      <BlocoConfirmacao settings={L} onMudou={recarregar} />
      <BlocoVocabulario settings={L} presets={presets.data ?? []} onMudou={recarregar} />
    </div>
  )
}

// ─── Presets ──────────────────────────────────────────────────────────────────

function BlocoPresets({ presets, onAplicado }: { presets: any[]; onAplicado: () => void }) {
  const aplicar = trpc.agenda.aplicarPreset.useMutation({ onSuccess: onAplicado })

  return (
    <Secao icone={Sparkles} titulo="Qual é o seu segmento?" descricao="Define o vocabulário da tela, os campos extras e alguns serviços para começar. Dá para mudar tudo depois.">
      <div className="grid gap-2 sm:grid-cols-2">
        {presets.map((p) => (
          <button
            key={p.id}
            disabled={aplicar.isPending}
            onClick={() => aplicar.mutate({ presetId: p.id, criarServicos: true })}
            className="rounded-lg border p-3 text-left hover:border-primary hover:bg-primary/5 disabled:opacity-50"
          >
            <p className="text-sm font-medium">{p.nome}</p>
            <p className="text-xs text-muted-foreground">{p.descricao}</p>
          </button>
        ))}
      </div>
    </Secao>
  )
}

// ─── Serviços ─────────────────────────────────────────────────────────────────

function BlocoServicos({ servicos, rotulo, onMudou }: { servicos: any[]; rotulo: string; onMudou: () => void }) {
  const [novo, setNovo] = useState({ name: '', duration_minutes: 30, buffer_minutes: 0 })
  const salvar = trpc.agenda.saveService.useMutation({ onSuccess: () => { setNovo({ name: '', duration_minutes: 30, buffer_minutes: 0 }); onMudou() } })
  const excluir = trpc.agenda.deleteService.useMutation({ onSuccess: onMudou })

  return (
    <Secao icone={ListChecks} titulo={rotulo} descricao="O que pode ser marcado e quanto tempo ocupa. O intervalo entra no cálculo do fim.">
      <div className="divide-y rounded-lg border">
        {servicos.map((s) => (
          <LinhaServico key={s.id} s={s} onMudou={onMudou} onExcluir={() => excluir.mutate({ id: s.id })} />
        ))}
        {servicos.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum cadastrado.</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">Nome</label>
          <input value={novo.name} onChange={(e) => setNovo({ ...novo, name: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div className="w-28">
          <label className="mb-1 block text-xs text-muted-foreground">Duração (min)</label>
          <input type="number" min={5} value={novo.duration_minutes} onChange={(e) => setNovo({ ...novo, duration_minutes: Number(e.target.value) })} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div className="w-28">
          <label className="mb-1 block text-xs text-muted-foreground">Intervalo</label>
          <input type="number" min={0} value={novo.buffer_minutes} onChange={(e) => setNovo({ ...novo, buffer_minutes: Number(e.target.value) })} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button
          disabled={!novo.name || salvar.isPending}
          onClick={() => salvar.mutate(novo)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </div>
    </Secao>
  )
}

function LinhaServico({ s, onMudou, onExcluir }: { s: any; onMudou: () => void; onExcluir: () => void }) {
  const [editando, setEditando] = useState(false)
  const [campos, setCampos] = useState({ name: s.name, duration_minutes: s.duration_minutes, buffer_minutes: s.buffer_minutes })
  const salvar = trpc.agenda.saveService.useMutation({ onSuccess: () => { setEditando(false); onMudou() } })

  if (editando) {
    return (
      <div className="flex flex-wrap items-center gap-2 p-3">
        <input value={campos.name} onChange={(e) => setCampos({ ...campos, name: e.target.value })} className="min-w-32 flex-1 rounded-lg border px-2 py-1.5 text-sm" />
        <input type="number" value={campos.duration_minutes} onChange={(e) => setCampos({ ...campos, duration_minutes: Number(e.target.value) })} className="w-20 rounded-lg border px-2 py-1.5 text-sm" />
        <input type="number" value={campos.buffer_minutes} onChange={(e) => setCampos({ ...campos, buffer_minutes: Number(e.target.value) })} className="w-20 rounded-lg border px-2 py-1.5 text-sm" />
        <button onClick={() => salvar.mutate({ id: s.id, ...campos })} className="rounded-lg border p-1.5 text-green-600"><Check className="h-4 w-4" /></button>
        <button onClick={() => setEditando(false)} className="rounded-lg border p-1.5 text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between p-3">
      <div className={s.is_active ? '' : 'opacity-50'}>
        <p className="text-sm font-medium">{s.name} {!s.is_active && <span className="text-xs">(inativo)</span>}</p>
        <p className="text-xs text-muted-foreground">
          {s.duration_minutes} min{s.buffer_minutes ? ` + ${s.buffer_minutes} de intervalo` : ''}
        </p>
      </div>
      <div className="flex gap-1">
        <button onClick={() => setEditando(true)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><Pencil className="h-4 w-4" /></button>
        <button onClick={onExcluir} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  )
}

// ─── Recursos + expediente ────────────────────────────────────────────────────

function BlocoRecursos({
  recursos, servicos, rotulo, onMudou,
}: { recursos: any[]; servicos: any[]; rotulo: string; onMudou: () => void }) {
  const [nome, setNome] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const salvar = trpc.agenda.saveResource.useMutation({ onSuccess: () => { setNome(''); onMudou() } })
  const excluir = trpc.agenda.deleteResource.useMutation({ onSuccess: onMudou })

  return (
    <Secao icone={Users} titulo={rotulo} descricao="Quem (ou o quê) fica ocupado quando alguém marca. Sem expediente cadastrado, o recurso não oferece horário nenhum.">
      <div className="space-y-2">
        {recursos.map((r) => (
          <div key={r.id} className="rounded-lg border">
            <div className="flex items-center justify-between p-3">
              <div className={r.is_active ? '' : 'opacity-50'}>
                <p className="text-sm font-medium">{r.name} {!r.is_active && <span className="text-xs">(inativo)</span>}</p>
                <p className="text-xs text-muted-foreground">{r.kind}</p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setAberto(aberto === r.id ? null : r.id)}
                  className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
                >
                  {aberto === r.id ? 'Fechar' : 'Expediente e serviços'}
                </button>
                <button onClick={() => excluir.mutate({ id: r.id })} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {aberto === r.id && <EditorRecurso recurso={r} servicos={servicos} onMudou={onMudou} />}
          </div>
        ))}
        {recursos.length === 0 && <p className="rounded-lg border p-4 text-sm text-muted-foreground">Nenhum cadastrado.</p>}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          placeholder={`Nome do novo item de ${rotulo.toLowerCase()}`}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <button
          disabled={!nome || salvar.isPending}
          onClick={() => salvar.mutate({ name: nome, kind: 'pessoa', is_active: true })}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </div>
    </Secao>
  )
}

function EditorRecurso({ recurso, servicos, onMudou }: { recurso: any; servicos: any[]; onMudou: () => void }) {
  const expediente = trpc.agenda.listAvailability.useQuery({ resourceId: recurso.id })
  const salvarExpediente = trpc.agenda.saveAvailability.useMutation({ onSuccess: onMudou })
  const salvarRecurso = trpc.agenda.saveResource.useMutation({ onSuccess: onMudou })

  const [dias, setDias] = useState<LinhaDia[]>(() => DIAS.map(() => ({ ...DIA_VAZIO })))
  const [vinculos, setVinculos] = useState<string[]>(
    (recurso.agenda_resource_services ?? []).map((v: any) => v.service_id)
  )

  useEffect(() => {
    if (!expediente.data) return
    const base = DIAS.map(() => ({ ...DIA_VAZIO }))
    for (const f of expediente.data as any[]) {
      const d = base[f.weekday]
      if (!d.ativo) {
        d.ativo = true
        d.inicio = f.start_time.slice(0, 5)
        d.fim = f.end_time.slice(0, 5)
      } else if (!d.tardeAtiva) {
        d.tardeAtiva = true
        d.tardeInicio = f.start_time.slice(0, 5)
        d.tardeFim = f.end_time.slice(0, 5)
      }
    }
    setDias(base)
  }, [expediente.data])

  function gravar() {
    const faixas: { weekday: number; start_time: string; end_time: string }[] = []
    dias.forEach((d, weekday) => {
      if (d.ativo) faixas.push({ weekday, start_time: d.inicio, end_time: d.fim })
      if (d.ativo && d.tardeAtiva) faixas.push({ weekday, start_time: d.tardeInicio, end_time: d.tardeFim })
    })
    salvarExpediente.mutate({ resourceId: recurso.id, faixas })
  }

  function mudar(i: number, patch: Partial<LinhaDia>) {
    setDias((atual) => atual.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))
  }

  return (
    <div className="space-y-4 border-t bg-muted/20 p-4">
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Expediente da semana</p>
        <div className="space-y-1.5">
          {dias.map((d, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex w-28 items-center gap-2">
                <input type="checkbox" checked={d.ativo} onChange={(e) => mudar(i, { ativo: e.target.checked })} />
                {DIAS[i]}
              </label>
              {d.ativo && (
                <>
                  <input type="time" value={d.inicio} onChange={(e) => mudar(i, { inicio: e.target.value })} className="rounded border px-2 py-1" />
                  <span className="text-muted-foreground">às</span>
                  <input type="time" value={d.fim} onChange={(e) => mudar(i, { fim: e.target.value })} className="rounded border px-2 py-1" />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <input type="checkbox" checked={d.tardeAtiva} onChange={(e) => mudar(i, { tardeAtiva: e.target.checked })} />
                    2º turno
                  </label>
                  {d.tardeAtiva && (
                    <>
                      <input type="time" value={d.tardeInicio} onChange={(e) => mudar(i, { tardeInicio: e.target.value })} className="rounded border px-2 py-1" />
                      <span className="text-muted-foreground">às</span>
                      <input type="time" value={d.tardeFim} onChange={(e) => mudar(i, { tardeFim: e.target.value })} className="rounded border px-2 py-1" />
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={gravar}
          disabled={salvarExpediente.isPending}
          className="mt-3 flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {salvarExpediente.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar expediente
        </button>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Serviços que atende <span className="font-normal">(nenhum marcado = atende todos)</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {servicos.map((s) => {
            const marcado = vinculos.includes(s.id)
            return (
              <button
                key={s.id}
                onClick={() => setVinculos(marcado ? vinculos.filter((v) => v !== s.id) : [...vinculos, s.id])}
                className={`rounded-full border px-3 py-1 text-xs ${marcado ? 'border-primary bg-primary text-white' : 'bg-white'}`}
              >
                {s.name}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => salvarRecurso.mutate({ id: recurso.id, name: recurso.name, kind: recurso.kind, is_active: recurso.is_active, serviceIds: vinculos })}
          disabled={salvarRecurso.isPending}
          className="mt-3 flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {salvarRecurso.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar serviços
        </button>
      </div>
    </div>
  )
}

// ─── Bloqueios ────────────────────────────────────────────────────────────────

function BlocoBloqueios({ recursos }: { recursos: any[] }) {
  const hoje = new Date()
  const from = new Date(hoje.getTime() - 24 * 3_600_000).toISOString()
  const to = new Date(hoje.getTime() + 90 * 24 * 3_600_000).toISOString()

  const utils = trpc.useUtils()
  const lista = trpc.agenda.listBlocks.useQuery({ from, to })
  const criar = trpc.agenda.createBlock.useMutation({ onSuccess: () => { utils.agenda.listBlocks.invalidate(); utils.agenda.availableSlots.invalidate() } })
  const excluir = trpc.agenda.deleteBlock.useMutation({ onSuccess: () => { utils.agenda.listBlocks.invalidate(); utils.agenda.availableSlots.invalidate() } })

  const [form, setForm] = useState({ resourceId: '', startsAt: '', endsAt: '', reason: '' })

  return (
    <Secao icone={CalendarOff} titulo="Bloqueios" descricao="Férias, feriado, manutenção. Sem recurso escolhido, bloqueia a organização inteira.">
      <div className="divide-y rounded-lg border">
        {(lista.data ?? []).map((b: any) => (
          <div key={b.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <p className="font-medium">{b.reason || 'Bloqueio'}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(b.starts_at).toLocaleString('pt-BR')} → {new Date(b.ends_at).toLocaleString('pt-BR')}
                {b.agenda_resources?.name ? ` · ${b.agenda_resources.name}` : ' · toda a organização'}
              </p>
            </div>
            <button onClick={() => excluir.mutate({ id: b.id })} className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {(lista.data?.length ?? 0) === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum bloqueio nos próximos 90 dias.</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Recurso</label>
          <select value={form.resourceId} onChange={(e) => setForm({ ...form, resourceId: e.target.value })} className="rounded-lg border px-3 py-2 text-sm">
            <option value="">Toda a organização</option>
            {recursos.filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">De</label>
          <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Até</label>
          <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div className="min-w-32 flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">Motivo</label>
          <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <button
          disabled={!form.startsAt || !form.endsAt || criar.isPending}
          onClick={() => criar.mutate({
            resourceId: form.resourceId || null,
            startsAt: new Date(form.startsAt).toISOString(),
            endsAt: new Date(form.endsAt).toISOString(),
            reason: form.reason || undefined,
          })}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Bloquear
        </button>
      </div>
    </Secao>
  )
}

// ─── Confirmação por WhatsApp ─────────────────────────────────────────────────

function BlocoConfirmacao({ settings, onMudou }: { settings: any; onMudou: () => void }) {
  const [form, setForm] = useState({
    confirmation_hours_before: settings?.confirmation_hours_before ?? 24,
    auto_confirm_on_no_reply: settings?.auto_confirm_on_no_reply ?? false,
    send_window_start: (settings?.send_window_start ?? '08:00').slice(0, 5),
    send_window_end: (settings?.send_window_end ?? '20:00').slice(0, 5),
    confirmation_template: settings?.confirmation_template ?? '',
  })
  const salvar = trpc.agenda.updateSettings.useMutation({ onSuccess: onMudou })

  return (
    <Secao icone={MessageSquare} titulo="Confirmação por WhatsApp" descricao="O pedido sai sozinho e a resposta do contato atualiza a agenda. 'Não' cancela e libera o horário.">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Horas antes</label>
          <input
            type="number" min={0} max={168}
            value={form.confirmation_hours_before}
            onChange={(e) => setForm({ ...form, confirmation_hours_before: Number(e.target.value) })}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Só enviar a partir de</label>
          <input type="time" value={form.send_window_start} onChange={(e) => setForm({ ...form, send_window_start: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Até</label>
          <input type="time" value={form.send_window_end} onChange={(e) => setForm({ ...form, send_window_end: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" />
        </div>
      </div>

      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.auto_confirm_on_no_reply}
          onChange={(e) => setForm({ ...form, auto_confirm_on_no_reply: e.target.checked })}
          className="mt-1"
        />
        <span>
          Considerar confirmado quem não responde
          <span className="block text-xs text-muted-foreground">
            Desligado é o padrão: confirmar no silêncio é o que gera cadeira vazia.
          </span>
        </span>
      </label>

      <div className="mt-3">
        <label className="mb-1 block text-xs text-muted-foreground">
          Texto do pedido — variáveis: {'{{contato}} {{servico}} {{recurso}} {{data}} {{hora}} {{diaSemana}}'}
        </label>
        <textarea
          rows={4}
          placeholder={TEMPLATE_CONFIRMACAO_PADRAO}
          value={form.confirmation_template}
          onChange={(e) => setForm({ ...form, confirmation_template: e.target.value })}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <button
        onClick={() => salvar.mutate({ ...form, confirmation_template: form.confirmation_template || null })}
        disabled={salvar.isPending}
        className="mt-3 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
      </button>
    </Secao>
  )
}

// ─── Vocabulário ──────────────────────────────────────────────────────────────

function BlocoVocabulario({ settings, presets, onMudou }: { settings: any; presets: any[]; onMudou: () => void }) {
  const [form, setForm] = useState({
    label_resource_singular: settings?.label_resource_singular ?? 'Profissional',
    label_resource_plural: settings?.label_resource_plural ?? 'Profissionais',
    label_service_singular: settings?.label_service_singular ?? 'Serviço',
    label_service_plural: settings?.label_service_plural ?? 'Serviços',
    label_appointment_singular: settings?.label_appointment_singular ?? 'Agendamento',
    label_appointment_plural: settings?.label_appointment_plural ?? 'Agendamentos',
  })
  const salvar = trpc.agenda.updateSettings.useMutation({ onSuccess: onMudou })
  const aplicar = trpc.agenda.aplicarPreset.useMutation({ onSuccess: onMudou })

  return (
    <Secao icone={Pencil} titulo="Vocabulário da tela" descricao="A mesma agenda serve clínica e oficina; o que muda é como as coisas se chamam.">
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ['label_resource_singular', 'Recurso (singular)'],
          ['label_resource_plural', 'Recurso (plural)'],
          ['label_service_singular', 'Serviço (singular)'],
          ['label_service_plural', 'Serviço (plural)'],
          ['label_appointment_singular', 'Compromisso (singular)'],
          ['label_appointment_plural', 'Compromisso (plural)'],
        ] as const).map(([campo, rotulo]) => (
          <div key={campo}>
            <label className="mb-1 block text-xs text-muted-foreground">{rotulo}</label>
            <input
              value={(form as any)[campo]}
              onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => salvar.mutate(form)}
          disabled={salvar.isPending}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
        </button>

        <select
          value={settings?.preset ?? ''}
          onChange={(e) => e.target.value && aplicar.mutate({ presetId: e.target.value, criarServicos: false })}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          <option value="">Reaplicar preset…</option>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>
    </Secao>
  )
}

// ─── Casca ────────────────────────────────────────────────────────────────────

function Secao({
  icone: Icone, titulo, descricao, children,
}: { icone: any; titulo: string; descricao: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-5">
      <div className="mb-4 flex items-start gap-3">
        <Icone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="font-semibold">{titulo}</h2>
          <p className="text-sm text-muted-foreground">{descricao}</p>
        </div>
      </div>
      {children}
    </section>
  )
}
