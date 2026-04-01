'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, Loader2, Tag, ToggleLeft, ToggleRight, X } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

const schema = z.object({
  code: z.string().min(3).max(50),
  description: z.string().optional(),
  type: z.enum(['percentage', 'fixed']),
  value: z.number().positive(),
  applicableTo: z.enum(['all', 'plan', 'credits']),
  maxUses: z.number().int().positive().optional(),
  validUntil: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function CouponsManager() {
  const [showForm, setShowForm] = useState(false)
  const utils = trpc.useUtils()

  const { data: coupons = [], isLoading } = trpc.coupons.list.useQuery()
  const create = trpc.coupons.create.useMutation({ onSuccess: () => { utils.coupons.list.invalidate(); setShowForm(false) } })
  const toggle = trpc.coupons.toggle.useMutation({ onSuccess: () => utils.coupons.list.invalidate() })
  const del = trpc.coupons.delete.useMutation({ onSuccess: () => utils.coupons.list.invalidate() })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'percentage', applicableTo: 'all' },
  })

  function onSubmit(data: FormData) {
    create.mutate({
      ...data,
      code: data.code.toUpperCase(),
      maxUses: data.maxUses || undefined,
      validUntil: data.validUntil || undefined,
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Cupons de Desconto</h2>
          <p className="text-sm text-muted-foreground">Crie e gerencie cupons para planos e créditos</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Novo cupom
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (coupons as any[]).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center">
          <Tag className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">Nenhum cupom criado</p>
          <p className="text-sm text-muted-foreground">Crie cupons para oferecer descontos aos seus clientes</p>
        </div>
      ) : (
        <div className="space-y-2">
          {(coupons as any[]).map((c) => (
            <div key={c.id} className="flex items-center gap-4 rounded-xl border bg-white p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Tag className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm font-mono">{c.code}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.active ? 'Ativo' : 'Inativo'}
                  </span>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                    {c.type === 'percentage' ? `${c.value}% off` : `R$ ${c.value} off`}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {c.applicable_to === 'all' ? 'Tudo' : c.applicable_to === 'plan' ? 'Planos' : 'Créditos'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {c.description && `${c.description} · `}
                  Usos: {c.uses_count}{c.max_uses ? `/${c.max_uses}` : ''}
                  {c.valid_until && ` · Válido até ${new Date(c.valid_until).toLocaleDateString('pt-BR')}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggle.mutate({ id: c.id, active: !c.active })}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                  title={c.active ? 'Desativar' : 'Ativar'}
                >
                  {c.active ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5" />}
                </button>
                <button
                  onClick={() => del.mutate({ id: c.id })}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h3 className="font-semibold">Novo cupom</h3>
              <button onClick={() => { setShowForm(false); reset() }} className="rounded-lg p-1 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 p-6">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Código *</label>
                  <input {...register('code')} placeholder="PROMO10" className="w-full rounded-lg border px-3 py-2 text-sm uppercase outline-none focus:ring-2 focus:ring-primary/30" />
                  {errors.code && <p className="mt-1 text-xs text-red-500">{errors.code.message}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Aplicável a</label>
                  <select {...register('applicableTo')} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="all">Tudo</option>
                    <option value="plan">Planos</option>
                    <option value="credits">Créditos</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Descrição</label>
                <input {...register('description')} placeholder="Ex: Promoção de lançamento" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Tipo</label>
                  <select {...register('type')} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="percentage">Percentual (%)</option>
                    <option value="fixed">Valor fixo (R$)</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Valor *</label>
                  <input type="number" step="0.01" {...register('value', { valueAsNumber: true })} placeholder="10" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                  {errors.value && <p className="mt-1 text-xs text-red-500">{errors.value.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Máximo de usos</label>
                  <input type="number" {...register('maxUses', { valueAsNumber: true })} placeholder="Ilimitado" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Válido até</label>
                  <input type="date" {...register('validUntil')} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => { setShowForm(false); reset() }} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
                <button type="submit" disabled={create.isPending} className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60">
                  {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Criar cupom
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
