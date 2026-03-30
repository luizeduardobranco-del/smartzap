'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bot, Sparkles, ChevronRight, ChevronLeft, Loader2, CheckCircle2,
  Store, Stethoscope, Scissors, Dumbbell, BookOpen, Scale, Home,
  Utensils, ShoppingBag, Car, Wifi, Building2, Check, Eye, EyeOff,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

// ─── Business Types ─────────────────────────────────────────────────────────

const BUSINESS_TYPES = [
  { id: 'clinica', label: 'Clínica / Consultório', icon: Stethoscope, color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { id: 'salao', label: 'Salão / Estética', icon: Scissors, color: 'bg-pink-50 border-pink-200 text-pink-700' },
  { id: 'restaurante', label: 'Restaurante / Lanchonete', icon: Utensils, color: 'bg-orange-50 border-orange-200 text-orange-700' },
  { id: 'loja', label: 'Loja / E-commerce', icon: ShoppingBag, color: 'bg-purple-50 border-purple-200 text-purple-700' },
  { id: 'academia', label: 'Academia / Personal', icon: Dumbbell, color: 'bg-red-50 border-red-200 text-red-700' },
  { id: 'escola', label: 'Escola / Cursos', icon: BookOpen, color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
  { id: 'advocacia', label: 'Advocacia / Contabilidade', icon: Scale, color: 'bg-slate-50 border-slate-200 text-slate-700' },
  { id: 'imobiliaria', label: 'Imobiliária', icon: Home, color: 'bg-green-50 border-green-200 text-green-700' },
  { id: 'automovel', label: 'Automóveis / Oficina', icon: Car, color: 'bg-zinc-50 border-zinc-200 text-zinc-700' },
  { id: 'tecnologia', label: 'Tecnologia / Software', icon: Wifi, color: 'bg-cyan-50 border-cyan-200 text-cyan-700' },
  { id: 'servicos', label: 'Serviços em geral', icon: Building2, color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
  { id: 'outro', label: 'Outro', icon: Store, color: 'bg-gray-50 border-gray-200 text-gray-700' },
]

const TONES = [
  { value: 'friendly', label: 'Amigável', emoji: '😊', desc: 'Próximo, acolhedor e descontraído' },
  { value: 'professional', label: 'Profissional', emoji: '💼', desc: 'Formal, objetivo e confiável' },
  { value: 'casual', label: 'Casual', emoji: '✌️', desc: 'Informal, jovem e leve' },
  { value: 'formal', label: 'Formal', emoji: '🎩', desc: 'Sério, corporativo e técnico' },
]

const MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai', desc: 'Rápido e econômico', badge: 'Recomendado' },
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai', desc: 'Máxima inteligência' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet', provider: 'anthropic', desc: 'Excelente para conversas' },
]

// ─── Step definitions ────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Negócio', desc: 'Tipo de empresa' },
  { id: 2, label: 'Identidade', desc: 'Dados do negócio' },
  { id: 3, label: 'Público', desc: 'Seus clientes' },
  { id: 4, label: 'Comportamento', desc: 'Como agir' },
  { id: 5, label: 'Funcionalidades', desc: 'O que pode fazer' },
  { id: 6, label: 'Modelo', desc: 'IA e tom' },
  { id: 7, label: 'Preview', desc: 'Revisar e criar' },
]

interface FormData {
  // Step 1
  businessType: string
  businessTypeLabel: string
  // Step 2
  businessName: string
  agentName: string
  mainProduct: string
  businessHours: string
  address: string
  // Step 3
  targetAudience: string
  commonObjections: string
  // Step 4
  agentRole: string
  cannotDo: string
  humanHandoffKeyword: string
  // Step 5
  canSchedule: boolean
  canSendPrice: boolean
  canSendAddress: boolean
  hasFaq: boolean
  faqContent: string
  additionalInfo: string
  // Step 6
  tone: string
  model: string
  provider: string
}

const initial: FormData = {
  businessType: '', businessTypeLabel: '',
  businessName: '', agentName: '', mainProduct: '', businessHours: '', address: '',
  targetAudience: '', commonObjections: '',
  agentRole: '', cannotDo: '', humanHandoffKeyword: 'atendente',
  canSchedule: false, canSendPrice: true, canSendAddress: true, hasFaq: false, faqContent: '',
  additionalInfo: '',
  tone: 'friendly', model: 'gpt-4o-mini', provider: 'openai',
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AgentSkillWizard() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(initial)
  const [generating, setGenerating] = useState(false)
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [showPrompt, setShowPrompt] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const createAgent = trpc.agents.create.useMutation({
    onSuccess: (agent) => router.push(`/agents/${agent.id}`),
    onError: (e) => setError(e.message),
  })

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function canAdvance() {
    if (step === 1) return !!form.businessType
    if (step === 2) return !!form.businessName && !!form.mainProduct && !!form.agentName
    if (step === 3) return !!form.targetAudience
    if (step === 4) return !!form.agentRole
    if (step === 5) return true
    if (step === 6) return true
    return true
  }

  async function goToPreview() {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/ai/generate-agent-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: form.businessName,
          businessType: form.businessTypeLabel,
          mainProduct: form.mainProduct,
          targetAudience: form.targetAudience,
          agentRole: form.agentRole,
          tone: form.tone,
          canSchedule: form.canSchedule,
          canSendPrice: form.canSendPrice,
          humanHandoffKeyword: form.humanHandoffKeyword,
          additionalInfo: [
            form.businessHours && `Horário de funcionamento: ${form.businessHours}`,
            form.address && `Endereço: ${form.address}`,
            form.commonObjections && `Objeções comuns: ${form.commonObjections}`,
            form.cannotDo && `Não pode fazer: ${form.cannotDo}`,
            form.canSendAddress && `Pode informar endereço.`,
            form.hasFaq && form.faqContent && `FAQ:\n${form.faqContent}`,
            form.additionalInfo,
          ].filter(Boolean).join('\n'),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao gerar')
      setGeneratedPrompt(data.prompt)
      setStep(7)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleCreate() {
    setCreating(true)
    createAgent.mutate({
      name: form.agentName,
      description: `Agente de ${form.businessTypeLabel} para ${form.businessName}`,
      personality: {
        tone: form.tone as any,
        language: 'pt-BR',
        systemPrompt: generatedPrompt,
        instructions: generatedPrompt,
        greeting: '',
        farewell: '',
      },
      aiConfig: {
        provider: form.provider as any,
        model: form.model,
        temperature: 0.7,
        maxTokens: 1000,
      },
    })
  }

  function next() {
    if (step === 6) { goToPreview(); return }
    setStep((s) => s + 1)
  }

  function prev() {
    if (step === 7) { setStep(6); return }
    setStep((s) => s - 1)
  }

  const input = (label: string, key: keyof FormData, placeholder?: string, required?: boolean) => (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as any)}
        placeholder={placeholder}
        className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition"
      />
    </div>
  )

  const textarea = (label: string, key: keyof FormData, placeholder?: string, rows = 3) => (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <textarea
        value={form[key] as string}
        onChange={(e) => set(key, e.target.value as any)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-none rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  )

  const toggle = (label: string, desc: string, key: keyof FormData) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 hover:bg-muted/30 transition-colors">
      <div className="mt-0.5">
        <input
          type="checkbox"
          checked={form[key] as boolean}
          onChange={(e) => set(key, e.target.checked as any)}
          className="h-4 w-4 rounded border-gray-300 accent-primary"
        />
      </div>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </label>
  )

  return (
    <div className="mx-auto max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Criar Agente com IA</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Responda as perguntas abaixo e a IA vai configurar seu agente automaticamente.
        </p>
      </div>

      {/* Steps progress */}
      <div className="mb-6 flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1">
            <div className={`flex flex-col items-center ${step === s.id ? 'opacity-100' : step > s.id ? 'opacity-100' : 'opacity-40'}`}>
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                step > s.id ? 'bg-primary text-white' : step === s.id ? 'bg-primary/15 text-primary border-2 border-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {step > s.id ? <Check className="h-3.5 w-3.5" /> : s.id}
              </div>
              <span className="mt-0.5 whitespace-nowrap text-xs font-medium">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-6 flex-shrink-0 ${step > s.id ? 'bg-primary' : 'bg-border'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">{STEPS[step - 1]?.label}</h2>
          <p className="text-sm text-muted-foreground">{STEPS[step - 1]?.desc}</p>
        </div>

        <div className="p-6">

          {/* Step 1 — Tipo de negócio */}
          {step === 1 && (
            <div>
              <p className="mb-4 text-sm text-muted-foreground">Selecione o tipo de negócio que melhor representa sua empresa:</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {BUSINESS_TYPES.map((bt) => {
                  const Icon = bt.icon
                  const selected = form.businessType === bt.id
                  return (
                    <button
                      key={bt.id}
                      type="button"
                      onClick={() => { set('businessType', bt.id); set('businessTypeLabel', bt.label) }}
                      className={`flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all ${
                        selected ? `${bt.color} ring-2 ring-offset-1 ring-primary` : 'hover:bg-muted/50'
                      }`}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span className="text-sm font-medium leading-tight">{bt.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 2 — Identidade do negócio */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Agora me conte sobre o seu negócio:</p>
              {input('Nome do negócio', 'businessName', 'Ex: Clínica Sorridentes, Salão da Carla...', true)}
              {input('Nome do agente (como ele se chamará)', 'agentName', 'Ex: Sofia, Max, Atendente Virtual...', true)}
              {input('Produto ou serviço principal', 'mainProduct', 'Ex: Consultas odontológicas, corte de cabelo, hambúrgueres artesanais...', true)}
              {input('Horário de funcionamento', 'businessHours', 'Ex: Seg-Sex das 8h às 18h, Sáb das 8h às 13h')}
              {input('Endereço (opcional)', 'address', 'Ex: Rua das Flores, 123 — Centro, São Paulo')}
            </div>
          )}

          {/* Step 3 — Público-alvo */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Me fale sobre seus clientes:</p>
              {textarea('Quem são seus clientes?', 'targetAudience', 'Ex: Adultos de 25 a 50 anos, famílias de classe média que buscam saúde e bem-estar...', 3)}
              {textarea('Principais dúvidas e objeções comuns', 'commonObjections', 'Ex: "Quanto custa?", "Vocês atendem plano de saúde?", "Como funciona o agendamento?"...', 4)}
            </div>
          )}

          {/* Step 4 — Comportamento */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Como o agente deve agir?</p>
              {textarea('Qual é o papel principal do agente?', 'agentRole', 'Ex: Recepcionar clientes, tirar dúvidas sobre os serviços, agendar consultas e encaminhar casos urgentes para a equipe...', 3)}
              {textarea('O que o agente NÃO pode fazer ou falar?', 'cannotDo', 'Ex: Não pode dar diagnósticos médicos, não pode prometer prazos sem confirmação, não pode dar descontos...', 3)}
              {input('Palavra-chave para transferir para humano', 'humanHandoffKeyword', 'Ex: atendente, humano, falar com pessoa')}
            </div>
          )}

          {/* Step 5 — Funcionalidades */}
          {step === 5 && (
            <div className="space-y-3">
              <p className="mb-2 text-sm text-muted-foreground">O que o agente pode fazer?</p>
              {toggle('Pode agendar horários', 'O agente pode marcar, remarcar e cancelar agendamentos', 'canSchedule')}
              {toggle('Pode informar preços', 'O agente pode falar valores de produtos e serviços', 'canSendPrice')}
              {toggle('Pode informar o endereço', 'O agente pode passar o endereço e localização', 'canSendAddress')}
              {toggle('Tem FAQ / perguntas frequentes', 'Há respostas prontas para as dúvidas mais comuns', 'hasFaq')}
              {form.hasFaq && (
                <div className="ml-7">
                  {textarea('Digite as perguntas e respostas mais comuns', 'faqContent',
                    'Pergunta: Vocês aceitam plano?\nResposta: Sim, aceitamos Unimed e Bradesco.\n\nPergunta: Como faço para agendar?\nResposta: Pode agendar aqui mesmo pelo WhatsApp.', 5)}
                </div>
              )}
              {textarea('Informações adicionais importantes', 'additionalInfo',
                'Promoções especiais, avisos importantes, links úteis, regras específicas do negócio...', 3)}
            </div>
          )}

          {/* Step 6 — Tom e Modelo */}
          {step === 6 && (
            <div className="space-y-5">
              <div>
                <p className="mb-3 text-sm font-medium">Tom de comunicação do agente</p>
                <div className="grid grid-cols-2 gap-3">
                  {TONES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => set('tone', t.value)}
                      className={`rounded-lg border p-3.5 text-left transition-colors ${
                        form.tone === t.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-lg">{t.emoji}</span>
                        <span className="text-sm font-medium">{t.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-3 text-sm font-medium">Modelo de IA</p>
                <div className="space-y-2">
                  {MODELS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => { set('model', m.value); set('provider', m.provider as any) }}
                      className={`flex w-full items-center justify-between rounded-lg border p-3.5 text-left transition-colors ${
                        form.model === m.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-3 w-3 rounded-full border-2 flex-shrink-0 ${form.model === m.value ? 'border-primary bg-primary' : 'border-muted-foreground'}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{m.label}</span>
                            {m.badge && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{m.badge}</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">{m.desc}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 7 — Preview */}
          {step === 7 && (
            <div className="space-y-5">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <p className="text-sm font-semibold text-green-800">Prompt gerado com sucesso!</p>
                </div>
                <p className="text-xs text-green-700">
                  A IA criou um prompt profissional para <strong>{form.agentName}</strong> baseado nas suas respostas.
                  Você pode editar antes de criar.
                </p>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: 'Negócio', value: form.businessName },
                  { label: 'Agente', value: form.agentName },
                  { label: 'Tipo', value: form.businessTypeLabel },
                  { label: 'Tom', value: TONES.find(t => t.value === form.tone)?.label ?? form.tone },
                  { label: 'Modelo', value: MODELS.find(m => m.value === form.model)?.label ?? form.model },
                  { label: 'Agendamento', value: form.canSchedule ? 'Sim' : 'Não' },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-muted/40 px-3 py-2">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="font-medium truncate">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Prompt preview */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium">Prompt do sistema</label>
                  <button
                    type="button"
                    onClick={() => setShowPrompt((s) => !s)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showPrompt ? <><EyeOff className="h-3.5 w-3.5" /> Ocultar</> : <><Eye className="h-3.5 w-3.5" /> Mostrar</>}
                  </button>
                </div>
                {showPrompt && (
                  <textarea
                    value={generatedPrompt}
                    onChange={(e) => setGeneratedPrompt(e.target.value)}
                    rows={10}
                    className="w-full resize-none rounded-lg border bg-muted/20 px-3 py-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-primary/30"
                  />
                )}
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
              )}
            </div>
          )}

          {/* Generating overlay */}
          {generating && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-6 w-6 animate-pulse text-primary" />
              </div>
              <p className="text-sm font-medium">Gerando o prompt com IA...</p>
              <p className="text-xs text-muted-foreground">Isso pode levar alguns segundos</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {!generating && (
          <div className="flex items-center justify-between border-t px-6 py-4">
            <button
              type="button"
              onClick={step === 1 ? () => router.back() : prev}
              className="flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
              {step === 1 ? 'Cancelar' : 'Voltar'}
            </button>

            {step < 7 ? (
              <button
                type="button"
                onClick={next}
                disabled={!canAdvance() || generating}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {step === 6 ? (
                  <><Sparkles className="h-4 w-4" /> Gerar com IA</>
                ) : (
                  <>Próximo <ChevronRight className="h-4 w-4" /></>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || createAgent.isPending}
                className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {(creating || createAgent.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                <Bot className="h-4 w-4" />
                Criar agente
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
