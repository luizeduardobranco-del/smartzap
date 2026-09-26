'use client'

import { useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

/**
 * Formulário que o responsável preenche. Cinco campos obrigatórios — nome e
 * telefone de quem contrata, nome do aluno, período, endereço e colégio — mais
 * os opcionais que a organização quiser ligar.
 *
 * Nada de CPF, documento ou pagamento aqui: isso é conversa do atendente, e
 * pedir no primeiro contato derruba a taxa de preenchimento.
 */

const campo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20'

const rotulo = 'mb-1.5 block text-sm font-medium text-slate-700'

export function FichaForm({
  slug,
  colegios,
  pedeBairro,
  pedeSerie,
}: {
  slug: string
  colegios: string[]
  pedeBairro: boolean
  pedeSerie: boolean
}) {
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)

    const dados = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>

    try {
      const res = await fetch(`/api/ficha/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? 'Não conseguimos enviar agora.')
      setPronto(true)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não conseguimos enviar agora.')
    } finally {
      setEnviando(false)
    }
  }

  if (pronto) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
        <h2 className="mt-3 text-lg font-semibold text-green-900">Ficha enviada!</h2>
        <p className="mt-1 text-sm text-green-800">
          Nosso atendimento vai confirmar a vaga e a rota com você pelo WhatsApp.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <label className={rotulo} htmlFor="responsavel_nome">Seu nome completo</label>
        <input id="responsavel_nome" name="responsavel_nome" required minLength={3} className={campo} placeholder="Nome do responsável" />
      </div>

      <div>
        <label className={rotulo} htmlFor="responsavel_telefone">Seu WhatsApp</label>
        <input id="responsavel_telefone" name="responsavel_telefone" required type="tel" inputMode="tel" className={campo} placeholder="(21) 90000-0000" />
      </div>

      <div>
        <label className={rotulo} htmlFor="aluno_nome">Nome do aluno</label>
        <input id="aluno_nome" name="aluno_nome" required minLength={3} className={campo} placeholder="Nome completo do aluno" />
      </div>

      <div>
        <label className={rotulo} htmlFor="colegio">Colégio</label>
        {colegios.length > 0 ? (
          <select id="colegio" name="colegio" required defaultValue="" className={campo}>
            <option value="" disabled>Selecione</option>
            {colegios.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : (
          <input id="colegio" name="colegio" required className={campo} placeholder="Nome do colégio" />
        )}
      </div>

      <div>
        <span className={rotulo}>Período</span>
        <div className="grid grid-cols-2 gap-3">
          {[
            { valor: 'manha', texto: 'Manhã' },
            { valor: 'tarde', texto: 'Tarde' },
          ].map((op) => (
            <label
              key={op.valor}
              className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-slate-700 hover:border-blue-400 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 has-[:checked]:text-blue-700"
            >
              <input type="radio" name="periodo" value={op.valor} required className="accent-blue-600" />
              {op.texto}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className={rotulo} htmlFor="endereco">Endereço de embarque</label>
        <input id="endereco" name="endereco" required minLength={5} className={campo} placeholder="Rua, número e complemento" />
      </div>

      {pedeBairro && (
        <div>
          <label className={rotulo} htmlFor="bairro">Bairro</label>
          <input id="bairro" name="bairro" className={campo} placeholder="Tijuca, Grajaú, Méier..." />
        </div>
      )}

      {pedeSerie && (
        <div>
          <label className={rotulo} htmlFor="serie">Série em 2026</label>
          <input id="serie" name="serie" className={campo} placeholder="2º ano, 5º ano..." />
        </div>
      )}

      <div>
        <label className={rotulo} htmlFor="observacao">Alguma observação? (opcional)</label>
        <textarea id="observacao" name="observacao" rows={3} className={campo} placeholder="Irmão que também vai usar, horário diferente, etc." />
      </div>

      {/* Isca de spam: escondida de gente, visível para robô. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />

      {erro && (
        <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
      >
        {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
        {enviando ? 'Enviando...' : 'Enviar ficha'}
      </button>
    </form>
  )
}
