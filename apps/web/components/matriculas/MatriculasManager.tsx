'use client'

import { useMemo, useState } from 'react'
import {
  ClipboardList, Download, Loader2, Search, Link2, Check, Trash2, Phone, MapPin,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

/**
 * Lista das fichas de matrícula. O atendimento vive aqui: recebe a ficha do
 * formulário, liga, move o status e exporta quando precisa levar para fora.
 */

const STATUS = [
  { id: 'nova',       label: 'Nova',        cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'em_contato', label: 'Em contato',  cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  { id: 'fechada',    label: 'Fechada',     cls: 'bg-green-100 text-green-700 border-green-200' },
  { id: 'perdida',    label: 'Perdida',     cls: 'bg-slate-100 text-slate-600 border-slate-200' },
] as const

const PERIODO: Record<string, string> = { manha: 'Manhã', tarde: 'Tarde' }

function paraCSV(linhas: any[]) {
  const colunas = [
    ['created_at', 'Recebida em'],
    ['responsavel_nome', 'Responsável'],
    ['responsavel_telefone', 'WhatsApp'],
    ['aluno_nome', 'Aluno'],
    ['serie', 'Série'],
    ['colegio', 'Colégio'],
    ['periodo', 'Período'],
    ['endereco', 'Endereço'],
    ['bairro', 'Bairro'],
    ['status', 'Status'],
    ['origem', 'Origem'],
    ['observacao', 'Observação'],
  ] as const

  const escapar = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

  const corpo = linhas.map((l) =>
    colunas
      .map(([chave]) => {
        if (chave === 'created_at') return escapar(new Date(l.created_at).toLocaleString('pt-BR'))
        if (chave === 'periodo') return escapar(PERIODO[l.periodo] ?? l.periodo)
        return escapar(l[chave])
      })
      .join(';')
  )

  // Ponto e vírgula + BOM: é assim que o Excel em português abre sem embaralhar.
  return '﻿' + [colunas.map(([, r]) => escapar(r)).join(';'), ...corpo].join('\n')
}

export function MatriculasManager({ slug }: { slug: string | null }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<string>('todas')
  const [copiado, setCopiado] = useState(false)

  const utils = trpc.useUtils()
  const { data: fichas, isLoading } = trpc.matriculas.list.useQuery()

  const mudarStatus = trpc.matriculas.updateStatus.useMutation({
    onSuccess: () => utils.matriculas.list.invalidate(),
  })
  const remover = trpc.matriculas.remove.useMutation({
    onSuccess: () => utils.matriculas.list.invalidate(),
  })

  const linkFicha = slug ? `${typeof window !== 'undefined' ? window.location.origin : ''}/ficha/${slug}` : null

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (fichas ?? []).filter((f: any) => {
      if (filtro !== 'todas' && f.status !== filtro) return false
      if (!termo) return true
      return [f.responsavel_nome, f.aluno_nome, f.responsavel_telefone, f.colegio, f.bairro, f.endereco]
        .some((c) => String(c ?? '').toLowerCase().includes(termo))
    })
  }, [fichas, busca, filtro])

  function exportar() {
    const blob = new Blob([paraCSV(visiveis)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `matriculas-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copiarLink() {
    if (!linkFicha) return
    await navigator.clipboard.writeText(linkFicha)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const contagem = (id: string) => (fichas ?? []).filter((f: any) => f.status === id).length

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ClipboardList className="h-6 w-6 text-blue-600" />
            Matrículas
          </h1>
          <p className="text-sm text-muted-foreground">
            Fichas preenchidas pelos responsáveis no link que o agente envia
          </p>
        </div>

        <div className="flex items-center gap-2">
          {linkFicha && (
            <button
              onClick={copiarLink}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
              title={linkFicha}
            >
              {copiado ? <Check className="h-4 w-4 text-green-600" /> : <Link2 className="h-4 w-4" />}
              {copiado ? 'Link copiado' : 'Copiar link da ficha'}
            </button>
          )}
          <button
            onClick={exportar}
            disabled={visiveis.length === 0}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por responsável, aluno, telefone ou bairro"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <button
          onClick={() => setFiltro('todas')}
          className={`rounded-lg border px-3 py-2 text-sm ${filtro === 'todas' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300'}`}
        >
          Todas ({fichas?.length ?? 0})
        </button>
        {STATUS.map((s) => (
          <button
            key={s.id}
            onClick={() => setFiltro(s.id)}
            className={`rounded-lg border px-3 py-2 text-sm ${filtro === s.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-300'}`}
          >
            {s.label} ({contagem(s.id)})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-medium text-slate-700">Nenhuma ficha por aqui ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {linkFicha ? 'Mande o link da ficha no fechamento da conversa.' : 'Ative o módulo nas configurações da organização.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visiveis.map((f: any) => {
            const st = STATUS.find((s) => s.id === f.status) ?? STATUS[0]
            return (
              <div key={f.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{f.aluno_nome}</span>
                      {f.serie && <span className="text-sm text-muted-foreground">· {f.serie}</span>}
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
                      {f.origem === 'atendente' && (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
                          digitada
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-slate-700">
                      {f.colegio} · {PERIODO[f.periodo] ?? f.periodo}
                    </p>

                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        {f.responsavel_nome} — {f.responsavel_telefone}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {f.endereco}{f.bairro ? `, ${f.bairro}` : ''}
                      </span>
                    </p>

                    {f.observacao && (
                      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{f.observacao}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={f.status}
                      onChange={(e) => mudarStatus.mutate({ id: f.id, status: e.target.value as any })}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      {STATUS.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (confirm(`Excluir a ficha de ${f.aluno_nome}?`)) remover.mutate({ id: f.id })
                      }}
                      className="rounded-lg border border-slate-300 p-2 text-slate-400 hover:border-red-300 hover:text-red-600"
                      title="Excluir ficha"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <p className="mt-3 text-xs text-slate-400">
                  Recebida em {new Date(f.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
