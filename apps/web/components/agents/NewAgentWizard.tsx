'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Bot, Brain, Zap, ChevronRight, ChevronLeft, Loader2, Sparkles, X, CheckCircle2 } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

const MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', desc: 'Rápido e econômico', badge: 'Recomendado' },
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai', desc: 'Máxima inteligência OpenAI' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku', provider: 'anthropic', desc: 'Rápido e eficiente' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet', provider: 'anthropic', desc: 'Equilíbrio perfeito' },
  { value: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B', provider: 'groq', desc: 'Open source, ultra-rápido' },
]

const TONES = [
  { value: 'friendly', label: 'Amigável', desc: 'Próximo e acolhedor' },
  { value: 'professional', label: 'Profissional', desc: 'Formal e objetivo' },
  { value: 'casual', label: 'Casual', desc: 'Descontraído e informal' },
  { value: 'formal', label: 'Formal', desc: 'Sério e corporativo' },
]

const BUSINESS_TYPES = [
  'Clínica / Consultório', 'Restaurante / Lanchonete', 'Loja / E-commerce', 'Salão de beleza / Estética',
  'Academia / Personal', 'Advocacia / Contabilidade', 'Imobiliária', 'Escola / Cursos', 'Outro',
]

const schema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres').max(100),
  description: z.string().optional(),
  tone: z.enum(['friendly', 'professional', 'casual', 'formal']).default('friendly'),
  instructions: z.string().optional(),
  model: z.string().default('gpt-4o-mini'),
  provider: z.enum(['openai', 'anthropic', 'groq']).default('openai'),
})

type FormData = z.infer<typeof schema>

const STEPS = [
  { id: 1, title: 'Identidade', icon: Bot },
  { id: 2, title: 'Personalidade', icon: Brain },
  { id: 3, title: 'Modelo de IA', icon: Zap },
]

// ─── Skill Builder Modal ────────────────────────────────────────────────────

interface SkillBuilderProps {
  onGenerated: (prompt: string) => void
  onClose: () => void
  defaultTone: string
}

function SkillBuilderModal({ onGenerated, onClose, defaultTone }: SkillBuilderProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    businessName: '',
    businessType: '',
    mainProduct: '',
    targetAudience: '',
    agentRole: '',
    tone: defaultTone,
    canSchedule: false,
    canSendPrice: true,
    humanHandoffKeyword: 'atendente',
    additionalInfo: '',
  })

  async function generate() {
    if (!form.businessName || !form.businessType || !form.mainProduct || !form.agentRole) {
      setError('Preencha os campos obrigatórios.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai/generate-agent-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao gerar')
      onGenerated(data.prompt)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const field = (label: string, key: keyof typeof form, placeholder?: string, required?: boolean) => (
    <div>
      <label className="mb-1 block text-sm font-medium">{label} {required && <span className="text-red-500">*</span>}</label>
      <input
        value={form[key] as string}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-xl border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Gerador de Prompt com IA</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5" style={{ maxHeight: '65vh' }}>
          <p className="text-sm text-muted-foreground">
            Preencha as informações do seu negócio e a IA vai criar um prompt profissional para o seu agente.
          </p>

          {field('Nome do negócio', 'businessName', 'Ex: Clínica Sorridentes', true)}

          <div>
            <label className="mb-1 block text-sm font-medium">Tipo de negócio <span className="text-red-500">*</span></label>
            <select
              value={form.businessType}
              onChange={(e) => setForm((f) => ({ ...f, businessType: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Selecione...</option>
              {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {field('Produto/Serviço principal', 'mainProduct', 'Ex: Consultas odontológicas, clareamento, implantes', true)}
          {field('Público-alvo', 'targetAudience', 'Ex: Adultos de 25-55 anos, famílias de classe média')}
          {field('Função do agente', 'agentRole', 'Ex: Recepcionista virtual, tirar dúvidas e agendar consultas', true)}

          <div>
            <label className="mb-1 block text-sm font-medium">Tom de comunicação</label>
            <select
              value={form.tone}
              onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            >
              {TONES.map((t) => <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>)}
            </select>
          </div>

          <div className="flex gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.canSchedule}
                onChange={(e) => setForm((f) => ({ ...f, canSchedule: e.target.checked }))}
                className="rounded"
              />
              Pode agendar horários
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.canSendPrice}
                onChange={(e) => setForm((f) => ({ ...f, canSendPrice: e.target.checked }))}
                className="rounded"
              />
              Pode informar preços
            </label>
          </div>

          {field('Palavra-chave para humano', 'humanHandoffKeyword', 'Ex: atendente, humano, falar com pessoa')}

          <div>
            <label className="mb-1 block text-sm font-medium">Informações adicionais</label>
            <textarea
              value={form.additionalInfo}
              onChange={(e) => setForm((f) => ({ ...f, additionalInfo: e.target.value }))}
              rows={3}
              placeholder="Horários de funcionamento, endereço, promoções especiais, regras específicas..."
              className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t px-5 py-4">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">
            Cancelar
          </button>
          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Gerando...' : 'Gerar Prompt'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Wizard ────────────────────────────────────────────────────────────

export function NewAgentWizard() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [showSkillBuilder, setShowSkillBuilder] = useState(false)
  const [promptGenerated, setPromptGenerated] = useState(false)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tone: 'friendly', model: 'gpt-4o-mini', provider: 'openai' },
  })

  const createAgent = trpc.agents.create.useMutation({
    onSuccess: (agent) => router.push(`/agents/${agent.id}`),
  })

  const onSubmit = (data: FormData) => {
    createAgent.mutate({
      name: data.name,
      description: data.description,
      personality: {
        tone: data.tone,
        language: 'pt-BR',
        systemPrompt: data.instructions ?? '',
        instructions: data.instructions ?? '',
        greeting: '',
        farewell: '',
      },
      aiConfig: {
        provider: data.provider,
        model: data.model,
        temperature: 0.7,
        maxTokens: 1000,
      },
    })
  }

  const tone = watch('tone')
  const model = watch('model')
  const instructions = watch('instructions')

  function handleGenerated(prompt: string) {
    setValue('instructions', prompt)
    setPromptGenerated(true)
    setShowSkillBuilder(false)
  }

  return (
    <>
      {showSkillBuilder && (
        <SkillBuilderModal
          onGenerated={handleGenerated}
          onClose={() => setShowSkillBuilder(false)}
          defaultTone={tone}
        />
      )}

      <div className="rounded-xl border bg-white shadow-sm">
        {/* Steps indicator */}
        <div className="border-b px-6 py-4">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              const isActive = step === s.id
              const isDone = step > s.id
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                    isDone ? 'bg-primary text-white' : isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}>
                    {isDone ? '✓' : <Icon className="h-4 w-4" />}
                  </div>
                  <span className={`text-sm font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {s.title}
                  </span>
                  {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />}
                </div>
              )
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="p-6">
            {/* Step 1 — Identidade */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Nome do agente *</label>
                  <input
                    {...register('name')}
                    placeholder="Ex: Atendente SAC, Vendedor Virtual..."
                    className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Descrição <span className="text-muted-foreground">(opcional)</span></label>
                  <textarea
                    {...register('description')}
                    rows={3}
                    placeholder="Para que serve este agente? Ex: Atende clientes do setor de vendas..."
                    className="w-full resize-none rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            )}

            {/* Step 2 — Personalidade */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <label className="mb-3 block text-sm font-medium">Tom de comunicação</label>
                  <div className="grid grid-cols-2 gap-3">
                    {TONES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setValue('tone', t.value as FormData['tone'])}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          tone === t.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                        }`}
                      >
                        <p className="text-sm font-medium">{t.label}</p>
                        <p className="text-xs text-muted-foreground">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="block text-sm font-medium">
                      Instruções do agente <span className="text-muted-foreground">(opcional)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowSkillBuilder(true)}
                      className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Gerar com IA
                    </button>
                  </div>
                  {promptGenerated && (
                    <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Prompt gerado pela IA! Você pode editar abaixo.
                    </div>
                  )}
                  <textarea
                    {...register('instructions')}
                    rows={6}
                    placeholder="Descreva como o agente deve se comportar, o que pode ou não pode fazer, informações importantes sobre o negócio..."
                    className="w-full resize-none rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use o botão &quot;Gerar com IA&quot; para criar um prompt profissional automaticamente.
                  </p>
                </div>
              </div>
            )}

            {/* Step 3 — Modelo de IA */}
            {step === 3 && (
              <div className="space-y-3">
                <p className="mb-3 text-sm text-muted-foreground">Escolha o modelo de linguagem que o agente vai usar.</p>
                {MODELS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      setValue('model', m.value)
                      setValue('provider', m.provider as FormData['provider'])
                    }}
                    className={`flex w-full items-center justify-between rounded-lg border p-3.5 text-left transition-colors ${
                      model === m.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{m.label}</span>
                        {m.badge && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {m.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{m.desc}</p>
                    </div>
                    <div className={`h-4 w-4 rounded-full border-2 ${model === m.value ? 'border-primary bg-primary' : 'border-muted-foreground'}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t px-6 py-4">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" />
                Voltar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancelar
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
              >
                Próximo
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={createAgent.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {createAgent.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar agente
              </button>
            )}
          </div>
        </form>

        {createAgent.error && (
          <p className="px-6 pb-4 text-sm text-red-500">{createAgent.error.message}</p>
        )}
      </div>
    </>
  )
}
