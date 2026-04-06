'use client'

import { useState } from 'react'
import { Loader2, AlertTriangle, ExternalLink, X, RefreshCw } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pendente', className: 'bg-amber-100 text-amber-700' },
  OVERDUE: { label: 'Vencida', className: 'bg-red-100 text-red-700' },
}

const BILLING_LABELS: Record<string, string> = {
  CREDIT_CARD: 'Cartão',
  PIX: 'PIX',
  BOLETO: 'Boleto',
  UNDEFINED: 'A definir',
}

export function PendingPayments() {
  const [canceling, setCanceling] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const { data: payments = [], isLoading, refetch } = trpc.billing.getAsaasPendingPayments.useQuery()
  const cancelPayment = trpc.billing.cancelAsaasPayment.useMutation({
    onSuccess: () => { setCanceling(null); setConfirmId(null); refetch() },
    onError: (err) => { setCanceling(null); alert(err.message) },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (payments.length === 0) return null

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/50">
      <div className="flex items-center justify-between border-b border-amber-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-900">
              {payments.length} cobrança{payments.length > 1 ? 's' : ''} pendente{payments.length > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-amber-700">Pague ou cancele cobranças antigas para manter sua conta organizada</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-100"
          title="Atualizar"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="divide-y divide-amber-100">
        {payments.map((p) => {
          const { label: statusLabel, className: statusClass } = STATUS_LABELS[p.status] ?? { label: p.status, className: 'bg-zinc-100 text-zinc-600' }
          const dueDateFmt = new Date(p.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')
          const valueFmt = p.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

          return (
            <div key={p.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
                    {statusLabel}
                  </span>
                  <span className="text-xs text-zinc-500">{BILLING_LABELS[p.billingType] ?? p.billingType}</span>
                  <span className="text-xs text-zinc-500">Vence: {dueDateFmt}</span>
                </div>
                <p className="mt-0.5 text-sm font-medium text-zinc-800 truncate">{p.description || 'Cobrança'}</p>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-bold text-zinc-900">{valueFmt}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={p.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Pagar
                </a>

                {confirmId === p.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setCanceling(p.id); cancelPayment.mutate({ paymentId: p.id }) }}
                      disabled={canceling === p.id}
                      className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {canceling === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirmar'}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="rounded-lg border px-2 py-1.5 text-xs hover:bg-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmId(p.id)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
