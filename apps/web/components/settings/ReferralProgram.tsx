'use client'

import { useState } from 'react'
import { Copy, Check, Users, DollarSign, Gift, ExternalLink, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

export function ReferralProgram() {
  const [copied, setCopied] = useState(false)

  const { data, isLoading } = trpc.referrals.getStats.useQuery()
  const getCode = trpc.referrals.getMyCode.useQuery()

  const referralLink = getCode.data
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://atendente.whiteerp.com'}/signup?ref=${getCode.data.code}`
    : ''

  function copyLink() {
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }

  const stats = [
    { label: 'Indicações', value: data?.totalReferrals ?? 0, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'Comissão acumulada', value: `R$ ${Number(data?.totalEarned ?? 0).toFixed(2)}`, icon: DollarSign, color: 'text-green-600 bg-green-50' },
  ]

  const statusLabel: Record<string, string> = {
    pending: 'Cadastrado',
    converted: 'Convertido',
    paid: 'Comissão paga',
  }
  const statusColor: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    converted: 'bg-blue-100 text-blue-700',
    paid: 'bg-green-100 text-green-700',
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Programa de Afiliados</h2>
        <p className="text-sm text-muted-foreground">Indique a White Zap e ganhe 20% de comissão em cada assinatura confirmada</p>
      </div>

      {/* How it works */}
      <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-primary/10 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Gift className="h-5 w-5 text-primary" />
          <p className="font-semibold text-primary">Como funciona</p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { step: '1', text: 'Compartilhe seu link de indicação' },
            { step: '2', text: 'Seu indicado assina um plano' },
            { step: '3', text: 'Você recebe 20% de comissão' },
          ].map((s) => (
            <div key={s.step} className="space-y-1">
              <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white text-sm font-bold">{s.step}</div>
              <p className="text-xs text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="rounded-xl border bg-white p-4 flex items-center gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Referral link */}
      <div className="rounded-xl border bg-white p-5 space-y-3">
        <p className="text-sm font-semibold">Seu link de indicação</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700 truncate font-mono">
            {referralLink || 'Carregando...'}
          </div>
          <button
            onClick={copyLink}
            disabled={!referralLink}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 shrink-0"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
        {getCode.data && (
          <p className="text-xs text-muted-foreground">
            Código: <span className="font-bold font-mono text-primary">{getCode.data.code}</span>
          </p>
        )}
      </div>

      {/* Referrals list */}
      {(data?.referrals ?? []).length > 0 && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="border-b px-5 py-3">
            <p className="text-sm font-semibold">Histórico de indicações</p>
          </div>
          <div className="divide-y">
            {(data!.referrals as any[]).map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium">Indicação #{r.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="flex items-center gap-3">
                  {r.commission_amount > 0 && (
                    <span className="text-sm font-semibold text-green-600">+R$ {Number(r.commission_amount).toFixed(2)}</span>
                  )}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {statusLabel[r.status] ?? r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
