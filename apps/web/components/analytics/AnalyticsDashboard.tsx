'use client'

import { useState } from 'react'
import {
  MessageSquare, Users, Bot, Zap, TrendingUp, CheckCircle2,
  BarChart3, Loader2,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = 7 | 30 | 90

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string, days: number) {
  const d = new Date(iso)
  if (days <= 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' })
  if (days <= 30) return `${d.getDate()}/${d.getMonth() + 1}`
  return d.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({
  label, value, sub, icon: Icon, color,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="mt-1.5 text-3xl font-bold">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function BarChart({ data, days }: { data: { date: string; count: number }[]; days: number }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  // Show every Nth label to avoid crowding
  const step = days <= 7 ? 1 : days <= 30 ? 5 : 10

  return (
    <div className="flex h-40 items-end gap-0.5">
      {data.map((d, i) => (
        <div key={d.date} className="group relative flex flex-1 flex-col items-center">
          <div
            className="w-full rounded-t bg-primary/80 transition-all group-hover:bg-primary"
            style={{ height: `${Math.max((d.count / max) * 100, d.count > 0 ? 4 : 0)}%` }}
          />
          {i % step === 0 && (
            <span className="mt-1 text-[10px] text-muted-foreground rotate-0 truncate max-w-full">
              {fmtDate(d.date, days)}
            </span>
          )}
          {/* Tooltip */}
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
            <div className="rounded bg-foreground px-2 py-1 text-xs text-background whitespace-nowrap">
              {d.count} — {fmtDate(d.date, days)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function DonutChart({ ai, human }: { ai: number; human: number }) {
  const total = ai + human
  if (total === 0) return (
    <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">Sem dados</div>
  )
  const aiPct = Math.round((ai / total) * 100)
  const humanPct = 100 - aiPct

  // SVG donut
  const r = 50
  const circ = 2 * Math.PI * r
  const aiDash = (aiPct / 100) * circ

  return (
    <div className="flex items-center gap-6">
      <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="16" />
        <circle
          cx="60" cy="60" r={r} fill="none"
          stroke="hsl(var(--primary))" strokeWidth="16"
          strokeDasharray={`${aiDash} ${circ - aiDash}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
        />
        <text x="60" y="56" textAnchor="middle" className="text-lg font-bold" fontSize="18" fontWeight="700" fill="currentColor">
          {aiPct}%
        </text>
        <text x="60" y="72" textAnchor="middle" fontSize="10" fill="#6b7280">IA</text>
      </svg>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-primary" />
          <span className="text-sm">IA — {ai} conversas ({aiPct}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-gray-200" />
          <span className="text-sm">Humano — {human} conversas ({humanPct}%)</span>
        </div>
      </div>
    </div>
  )
}

function FunnelChart({ stages }: { stages: { stage: string; label: string; count: number }[] }) {
  const max = Math.max(...stages.map((s) => s.count), 1)
  const stageColors: Record<string, string> = {
    new: 'bg-gray-400',
    contacted: 'bg-blue-400',
    qualified: 'bg-yellow-400',
    proposal: 'bg-orange-400',
    won: 'bg-green-500',
    lost: 'bg-red-400',
  }

  return (
    <div className="space-y-2.5">
      {stages.map((s) => (
        <div key={s.stage} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-xs text-muted-foreground text-right">{s.label}</span>
          <div className="flex-1 rounded-full bg-muted h-5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${stageColors[s.stage] ?? 'bg-primary'}`}
              style={{ width: `${Math.max((s.count / max) * 100, s.count > 0 ? 4 : 0)}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-sm font-medium">{s.count}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AnalyticsDashboard() {
  const [days, setDays] = useState<Period>(30)

  const { data, isLoading } = trpc.analytics.getOverview.useQuery({ days })

  const PERIODS: { label: string; value: Period }[] = [
    { label: '7 dias', value: 7 },
    { label: '30 dias', value: 30 },
    { label: '90 dias', value: 90 },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">Visão geral do desempenho dos seus agentes</p>
        </div>
        <div className="flex gap-1 rounded-lg border bg-white p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                days === p.value ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? null : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            <KPICard
              label="Conversas"
              value={data.kpis.totalConvs}
              sub={`${data.kpis.resolvedConvs} resolvidas`}
              icon={MessageSquare}
              color="text-blue-500 bg-blue-50"
            />
            <KPICard
              label="Mensagens"
              value={data.kpis.totalMsgs}
              icon={BarChart3}
              color="text-indigo-500 bg-indigo-50"
            />
            <KPICard
              label="Novos contatos"
              value={data.kpis.newContacts}
              icon={Users}
              color="text-green-500 bg-green-50"
            />
            <KPICard
              label="Taxa IA"
              value={`${data.kpis.aiRate}%`}
              sub={`${data.kpis.aiConvs} conv. por IA`}
              icon={Bot}
              color="text-purple-500 bg-purple-50"
            />
            <KPICard
              label="Automações"
              value={data.kpis.totalAutomationFires}
              sub="execuções totais"
              icon={Zap}
              color="text-yellow-500 bg-yellow-50"
            />
            <KPICard
              label="Resolvidas"
              value={data.kpis.resolvedConvs}
              sub={data.kpis.totalConvs > 0 ? `${Math.round((data.kpis.resolvedConvs / data.kpis.totalConvs) * 100)}% do total` : '—'}
              icon={CheckCircle2}
              color="text-emerald-500 bg-emerald-50"
            />
          </div>

          {/* Charts row 1 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Conversations per day */}
            <div className="col-span-2 rounded-xl border bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Conversas por dia</h3>
                  <p className="text-xs text-muted-foreground">Últimos {days} dias</p>
                </div>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </div>
              <BarChart data={data.convsByDay} days={days} />
            </div>

            {/* AI vs Human */}
            <div className="rounded-xl border bg-white p-5">
              <h3 className="mb-4 font-semibold">IA vs Humano</h3>
              <DonutChart ai={data.kpis.aiConvs} human={data.kpis.humanConvs} />
            </div>
          </div>

          {/* Charts row 2 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* CRM Funnel */}
            <div className="rounded-xl border bg-white p-5">
              <h3 className="mb-4 font-semibold">Funil CRM</h3>
              <FunnelChart stages={data.crmFunnel} />
            </div>

            {/* Agent breakdown */}
            <div className="rounded-xl border bg-white p-5">
              <h3 className="mb-4 font-semibold">Conversas por agente</h3>
              {data.agentBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum dado no período</p>
              ) : (
                <div className="space-y-3">
                  {data.agentBreakdown.map((a) => {
                    const max = Math.max(...data.agentBreakdown.map((x) => x.convs), 1)
                    return (
                      <div key={a.name} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{a.name}</span>
                        <div className="flex-1 rounded-full bg-muted h-4 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${Math.max((a.convs / max) * 100, a.convs > 0 ? 4 : 0)}%` }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-sm font-medium">{a.convs}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Top automations */}
          {data.topAutomations.length > 0 && (
            <div className="rounded-xl border bg-white p-5">
              <h3 className="mb-4 font-semibold">Top automações</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Nome</th>
                      <th className="pb-2 text-left font-medium">Gatilho</th>
                      <th className="pb-2 text-left font-medium">Ação</th>
                      <th className="pb-2 text-right font-medium">Execuções</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.topAutomations.map((a: any) => (
                      <tr key={a.id}>
                        <td className="py-2.5 font-medium">{a.name}</td>
                        <td className="py-2.5 text-muted-foreground capitalize">{a.trigger_type.replace('_', ' ')}</td>
                        <td className="py-2.5 text-muted-foreground capitalize">{a.action_type.replace('_', ' ')}</td>
                        <td className="py-2.5 text-right font-semibold">{a.executions_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
