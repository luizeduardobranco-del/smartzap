'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Bot, Brain, Zap, Radio, BookOpen, ArrowLeft, Loader2, Save, Play, Pause, MessageSquare } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { KnowledgeBase } from './KnowledgeBase'
import { WhatsAppConnect } from './WhatsAppConnect'
import { InstagramConnect } from './InstagramConnect'
import { TestAgentChat } from './TestAgentChat'

const MODELS = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku', provider: 'anthropic' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet', provider: 'anthropic' },
  { value: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B', provider: 'groq' },
]

const TONES = [
  { value: 'friendly', label: 'Amigável' },
  { value: 'professional', label: 'Profissional' },
  { value: 'casual', label: 'Casual' },
  { value: 'formal', label: 'Formal' },
]

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  // personality
  tone: z.enum(['friendly', 'professional', 'casual', 'formal']).default('friendly'),
  systemPrompt: z.string().optional(),
  instructions: z.string().optional(),
  greeting: z.string().optional(),
  farewell: z.string().optional(),
  // ai config
  model: z.string().default('gpt-4o-mini'),
  provider: z.enum(['openai', 'anthropic', 'groq']).default('openai'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(100).max(4000).default(1000),
  // behavior
  humanHandoff: z.boolean().default(false),
  humanHandoffTrigger: z.string().optional(),
  offHoursMessage: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const TABS = [
  { id: 'identity', label: 'Identidade', icon: Bot },
  { id: 'personality', label: 'Personalidade', icon: Brain },
  { id: 'ai', label: 'Modelo de IA', icon: Zap },
  { id: 'knowledge', label: 'Conhecimento', icon: BookOpen },
  { id: 'channels', label: 'Canais', icon: Radio },
]

const statusConfig = {
  active: { label: 'Ativo', class: 'bg-green-100 text-green-700' },
  paused: { label: 'Pausado', class: 'bg-yellow-100 text-yellow-700' },
  draft: { label: 'Rascunho', class: 'bg-gray-100 text-gray-600' },
  archived: { label: 'Arquivado', class: 'bg-red-100 text-red-700' },
}

export function AgentEditor({ agentId }: { agentId: string }) {
  const [activeTab, setActiveTab] = useState('identity')
  const [saved, setSaved] = useState(false)
  const [showTest, setShowTest] = useState(false)
  const searchParams = useSearchParams()
  const utils = trpc.useUtils()

  useEffect(() => {
    if (searchParams.get('test') === '1') setShowTest(true)
  }, [searchParams])

  const { data: agent, isLoading } = trpc.agents.get.useQuery({ id: agentId })

  const { register, handleSubmit, watch, setValue, reset, formState: { isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema),
    values: agent ? {
      name: agent.name,
      description: agent.description ?? '',
      tone: (agent.personality as any)?.tone ?? 'friendly',
      systemPrompt: (agent.personality as any)?.systemPrompt ?? '',
      instructions: (agent.personality as any)?.instructions ?? '',
      greeting: (agent.personality as any)?.greeting ?? '',
      farewell: (agent.personality as any)?.farewell ?? '',
      model: (agent.ai_config as any)?.model ?? 'gpt-4o-mini',
      provider: (agent.ai_config as any)?.provider ?? 'openai',
      temperature: (agent.ai_config as any)?.temperature ?? 0.7,
      maxTokens: (agent.ai_config as any)?.maxTokens ?? 1000,
      humanHandoff: (agent.behavior_config as any)?.humanHandoff ?? false,
      humanHandoffTrigger: (agent.personality as any)?.humanHandoffTrigger ?? '',
      offHoursMessage: (agent.behavior_config as any)?.offHoursMessage ?? '',
    } : undefined,
  })

  const updateAgent = trpc.agents.update.useMutation({
    onSuccess: () => {
      utils.agents.get.invalidate({ id: agentId })
      utils.agents.list.invalidate()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const toggleStatus = trpc.agents.toggleStatus.useMutation({
    onSuccess: () => utils.agents.get.invalidate({ id: agentId }),
  })

  const onSubmit = (data: FormData) => {
    updateAgent.mutate({
      id: agentId,
      name: data.name,
      description: data.description,
      personality: {
        tone: data.tone,
        language: 'pt-BR',
        systemPrompt: data.systemPrompt ?? '',
        instructions: data.instructions ?? '',
        greeting: data.greeting ?? '',
        farewell: data.farewell ?? '',
        humanHandoffTrigger: data.humanHandoffTrigger ?? '',
      },
      aiConfig: {
        provider: data.provider,
        model: data.model,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
      },
      behaviorConfig: {
        humanHandoff: data.humanHandoff,
        handoffKeywords: [],
        businessHours: false,
        offHoursMessage: data.offHoursMessage ?? '',
        maxResponseTime: 30,
      },
    })
  }

  const tone = watch('tone')
  const model = watch('model')
  const humanHandoff = watch('humanHandoff')

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Agente não encontrado.</p>
        <Link href="/agents" className="mt-4 inline-block text-sm text-primary">← Voltar para agentes</Link>
      </div>
    )
  }

  const status = statusConfig[agent.status as keyof typeof statusConfig] ?? statusConfig.draft
  const isActive = agent.status === 'active'

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/agents" className="rounded-lg p-1.5 hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{agent.name}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.class}`}>
                {status.label}
              </span>
            </div>
            {agent.description && (
              <p className="text-sm text-muted-foreground">{agent.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTest(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[#075E54] px-3 py-1.5 text-sm font-medium text-[#075E54] hover:bg-[#075E54]/5"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Testar
          </button>
          <button
            type="button"
            onClick={() => toggleStatus.mutate({
              id: agentId,
              status: isActive ? 'paused' : 'active',
            })}
            disabled={toggleStatus.isPending}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {toggleStatus.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isActive ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {isActive ? 'Pausar' : 'Ativar'}
          </button>
          <button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={!isDirty || updateAgent.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {updateAgent.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar tabs */}
        <div className="w-48 shrink-0">
          <nav className="space-y-1">
            {TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 rounded-xl border bg-white p-6 shadow-sm">
          {/* Identidade */}
          {activeTab === 'identity' && (
            <div className="space-y-5">
              <h2 className="font-semibold">Identidade do agente</h2>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Nome *</label>
                <input
                  {...register('name')}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Descrição</label>
                <textarea
                  {...register('description')}
                  rows={3}
                  className="w-full resize-none rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          )}

          {/* Personalidade */}
          {activeTab === 'personality' && (
            <div className="space-y-5">
              <h2 className="font-semibold">Personalidade e comportamento</h2>
              <div>
                <label className="mb-2 block text-sm font-medium">Tom de comunicação</label>
                <div className="grid grid-cols-2 gap-2">
                  {TONES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setValue('tone', t.value as FormData['tone'], { shouldDirty: true })}
                      className={`rounded-lg border py-2 text-sm font-medium transition-colors ${
                        tone === t.value ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-muted/50'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-1.5">
                <label className="block text-sm font-semibold text-primary">Prompt completo (modo avançado)</label>
                <p className="text-xs text-muted-foreground">
                  Quando preenchido, substitui todas as outras instruções. Use para controle total do comportamento do agente.
                </p>
                <textarea
                  {...register('systemPrompt')}
                  rows={8}
                  placeholder="Você é um assistente especializado em vendas da empresa XYZ. Seu objetivo é..."
                  className="w-full resize-y rounded-lg border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Instruções complementares</label>
                <p className="text-xs text-muted-foreground mb-1.5">Regras adicionais, informações do negócio (usadas junto com o tom e idioma configurados).</p>
                <textarea
                  {...register('instructions')}
                  rows={5}
                  placeholder="Como o agente deve se comportar, regras, informações do negócio..."
                  className="w-full resize-none rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Mensagem de boas-vindas</label>
                  <textarea
                    {...register('greeting')}
                    rows={3}
                    placeholder="Olá! Como posso ajudar?"
                    className="w-full resize-none rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Mensagem de despedida</label>
                  <textarea
                    {...register('farewell')}
                    rows={3}
                    placeholder="Até logo! Qualquer dúvida, estou aqui."
                    className="w-full resize-none rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    {...register('humanHandoff')}
                    className="h-4 w-4 rounded border"
                  />
                  <div>
                    <p className="text-sm font-medium">Transferência para humano</p>
                    <p className="text-xs text-muted-foreground">Permite que o agente transfira para um atendente humano</p>
                  </div>
                </label>
                {humanHandoff && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">Palavra-chave de transferência</label>
                      <input
                        {...register('humanHandoffTrigger')}
                        placeholder="Ex: falar com atendente, quero falar com humano"
                        className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Quando o cliente digitar esta frase, a conversa é transferida automaticamente para um atendente humano.
                      </p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">Mensagem ao transferir</label>
                      <input
                        {...register('offHoursMessage')}
                        placeholder="Ok! Vou te conectar com um atendente. Por favor, aguarde um momento."
                        className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Mensagem enviada automaticamente ao cliente no momento da transferência.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* IA */}
          {activeTab === 'ai' && (
            <div className="space-y-5">
              <h2 className="font-semibold">Configurações de IA</h2>
              <div className="space-y-2">
                <label className="mb-1 block text-sm font-medium">Modelo de linguagem</label>
                {MODELS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => {
                      setValue('model', m.value, { shouldDirty: true })
                      setValue('provider', m.provider as FormData['provider'], { shouldDirty: true })
                    }}
                    className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                      model === m.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                  >
                    <span className="text-sm font-medium">{m.label}</span>
                    <div className={`h-4 w-4 rounded-full border-2 ${model === m.value ? 'border-primary bg-primary' : 'border-muted-foreground'}`} />
                  </button>
                ))}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Temperatura <span className="text-muted-foreground">(criatividade: {watch('temperature')})</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  {...register('temperature', { valueAsNumber: true })}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Preciso</span>
                  <span>Criativo</span>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Máximo de tokens por resposta
                </label>
                <input
                  type="number"
                  min={100}
                  max={4000}
                  step={100}
                  {...register('maxTokens', { valueAsNumber: true })}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          )}

          {/* Conhecimento */}
          {activeTab === 'knowledge' && (
            <KnowledgeBase agentId={agentId} />
          )}

          {/* Canais */}
          {activeTab === 'channels' && (
            <div className="space-y-5">
              <div>
                <h2 className="font-semibold">Canais de atendimento</h2>
                <p className="text-sm text-muted-foreground">Conecte o agente aos canais onde ele vai atender.</p>
              </div>

              {/* WhatsApp — funcional */}
              <div className="rounded-xl border p-5">
                <div className="mb-4 flex items-center gap-2">
                  <span className="text-xl">📱</span>
                  <p className="font-medium">WhatsApp</p>
                </div>
                <WhatsAppConnect agentId={agentId} />
              </div>

              {/* Instagram */}
              <div className="rounded-xl border p-5">
                <div className="mb-4 flex items-center gap-2">
                  <span className="text-xl">📸</span>
                  <p className="font-medium">Instagram</p>
                </div>
                <InstagramConnect agentId={agentId} />
              </div>

              {/* Chat no site — em breve */}
              <div className="flex items-center justify-between rounded-xl border p-4">
                <div className="flex items-center gap-3">
                  <span className="text-xl">💬</span>
                  <div>
                    <p className="font-medium">Chat no site</p>
                    <p className="text-xs text-muted-foreground">Widget embarcado</p>
                  </div>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  Em breve
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {showTest && (
        <TestAgentChat
          agentId={agentId}
          agentName={agent.name}
          onClose={() => setShowTest(false)}
        />
      )}
    </div>
  )
}
