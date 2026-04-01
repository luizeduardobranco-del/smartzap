'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Bot, Wifi, BookOpen, Users, GitBranch, Zap, Send, MessageSquare,
  ChevronUp, ChevronDown, X, CheckCircle2, Circle, Rocket,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

const DISMISS_KEY = 'zapagent_onboarding_dismissed'
const MINIMIZED_KEY = 'zapagent_onboarding_minimized'

type Step = {
  key: string
  label: string
  description: string
  icon: React.ElementType
  href: string
  done: boolean
}

type Group = {
  label: string
  steps: Step[]
}

export function GettingStarted() {
  const [dismissed, setDismissed] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [mounted, setMounted] = useState(false)

  const { data: status, isLoading } = trpc.onboarding.getStatus.useQuery(undefined, {
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  })

  useEffect(() => {
    setMounted(true)
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
    setMinimized(localStorage.getItem(MINIMIZED_KEY) === '1')
  }, [])

  if (!mounted || isLoading || !status) return null
  if (dismissed) return null

  const agentHref = status.firstAgentId ? `/agents/${status.firstAgentId}` : '/agents/new'

  const groups: Group[] = [
    {
      label: 'Configuração básica',
      steps: [
        {
          key: 'agent',
          label: 'Criar seu agente virtual',
          description: 'Defina o nome, personalidade e modelo de IA',
          icon: Bot,
          href: '/agents/new',
          done: status.agentCreated,
        },
        {
          key: 'whatsapp',
          label: 'Conectar o WhatsApp',
          description: 'Escaneie o QR Code para vincular o número',
          icon: Wifi,
          href: agentHref + '#channels',
          done: status.whatsappConnected,
        },
        {
          key: 'knowledge',
          label: 'Configurar base de conhecimento',
          description: 'Adicione textos, FAQs ou URLs que o agente vai usar',
          icon: BookOpen,
          href: agentHref + '#knowledge',
          done: status.knowledgeAdded,
        },
      ],
    },
    {
      label: 'Relacionamento',
      steps: [
        {
          key: 'contact',
          label: 'Adicionar contatos',
          description: 'Importe ou cadastre seus primeiros contatos',
          icon: Users,
          href: '/contacts',
          done: status.contactAdded,
        },
      ],
    },
    {
      label: 'Funis & Automação',
      steps: [
        {
          key: 'funnel',
          label: 'Criar um funil de vendas',
          description: 'Organize leads em etapas automáticas',
          icon: GitBranch,
          href: '/funnels',
          done: status.funnelCreated,
        },
        {
          key: 'automation',
          label: 'Criar uma automação',
          description: 'Configure respostas e ações automáticas',
          icon: Zap,
          href: '/automations',
          done: status.automationCreated,
        },
      ],
    },
    {
      label: 'Disparos',
      steps: [
        {
          key: 'campaign',
          label: 'Criar campanha de disparos',
          description: 'Envie mensagens em massa com proteção anti-bloqueio',
          icon: Send,
          href: '/campaigns',
          done: status.campaignCreated,
        },
      ],
    },
    {
      label: 'Testar',
      steps: [
        {
          key: 'test',
          label: 'Testar seu atendente',
          description: 'Envie uma mensagem e veja o agente respondendo ao vivo',
          icon: MessageSquare,
          href: status.firstAgentId ? `/agents/${status.firstAgentId}?test=1` : '/agents',
          done: false, // always shown as action
        },
      ],
    },
  ]

  const allSteps = groups.flatMap((g) => g.steps)
  const trackableSteps = allSteps.filter((s) => s.key !== 'test')
  const doneCount = trackableSteps.filter((s) => s.done).length
  const totalCount = trackableSteps.length
  const progress = Math.round((doneCount / totalCount) * 100)
  const allDone = doneCount === totalCount

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  function toggleMinimize() {
    const next = !minimized
    setMinimized(next)
    localStorage.setItem(MINIMIZED_KEY, next ? '1' : '0')
  }

  return (
    <div className="fixed bottom-[84px] right-5 z-50 w-80 rounded-2xl border bg-white shadow-2xl">
      {/* Header */}
      <div
        className="flex cursor-pointer items-center gap-2.5 rounded-t-2xl bg-primary px-4 py-3 text-white"
        onClick={toggleMinimize}
      >
        <Rocket className="h-4 w-4 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-none">Primeiros Passos</p>
          <p className="mt-0.5 text-xs text-white/70">
            {allDone ? 'Tudo configurado!' : `${doneCount} de ${totalCount} concluídos`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {minimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <button
            onClick={(e) => { e.stopPropagation(); dismiss() }}
            className="rounded p-0.5 hover:bg-white/20"
            title="Ocultar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Progress bar */}
          <div className="px-4 pt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Progresso</span>
              <span className="font-medium text-primary">{progress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Steps */}
          <div className="max-h-80 overflow-y-auto p-3 space-y-3">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.steps.map((step) => {
                    const Icon = step.icon
                    const isTest = step.key === 'test'
                    return (
                      <Link
                        key={step.key}
                        href={step.href}
                        className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/60 ${
                          step.done ? 'opacity-60' : ''
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {step.done ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : isTest ? (
                            <Icon className="h-4 w-4 text-primary" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground/50" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-medium leading-snug ${step.done ? 'line-through text-muted-foreground' : ''}`}>
                            {step.label}
                          </p>
                          {!step.done && (
                            <p className="text-[11px] text-muted-foreground leading-tight">{step.description}</p>
                          )}
                        </div>
                        {!step.done && (
                          <span className="ml-auto shrink-0 text-[10px] font-medium text-primary">→</span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {allDone && (
            <div className="border-t px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground mb-2">Você configurou tudo!</p>
              <button
                onClick={dismiss}
                className="text-xs font-medium text-primary hover:underline"
              >
                Ocultar este painel
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
