import Link from 'next/link'
import { Bot, Zap, BarChart3, MessageSquare, Globe, Shield } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold">ZapAgent</span>
          </div>
          <nav className="hidden gap-6 md:flex">
            <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground">
              Recursos
            </Link>
            <Link href="#pricing" className="text-sm text-muted-foreground hover:text-foreground">
              Preços
            </Link>
            <Link href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground">
              Como funciona
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Entrar
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              Começar grátis
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <div className="mb-4 inline-flex items-center rounded-full border bg-muted px-3 py-1 text-xs font-medium">
          <Zap className="mr-1.5 h-3 w-3 text-primary" />
          Novo: Integração com DeepSeek R1 e LLaMA 3.3
        </div>
        <h1 className="mb-6 max-w-4xl text-4xl font-extrabold tracking-tight sm:text-6xl">
          Crie funcionários virtuais de IA que{' '}
          <span className="text-primary">trabalham 24 horas</span>
        </h1>
        <p className="mb-8 max-w-2xl text-lg text-muted-foreground">
          Automatize atendimento, vendas e suporte no WhatsApp, Instagram e seu site.
          Sem programar. Sem contratar. Resultados imediatos.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="rounded-lg bg-primary px-8 py-3 text-base font-semibold text-white shadow-lg hover:bg-primary/90"
          >
            Testar grátis por 14 dias
          </Link>
          <Link
            href="#how-it-works"
            className="rounded-lg border px-8 py-3 text-base font-semibold hover:bg-muted"
          >
            Ver como funciona
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Sem cartão de crédito. Cancele quando quiser.
        </p>
      </section>

      {/* Features */}
      <section id="features" className="border-t bg-muted/50 py-24">
        <div className="container">
          <h2 className="mb-4 text-center text-3xl font-bold">Tudo que você precisa em um só lugar</h2>
          <p className="mb-16 text-center text-muted-foreground">
            Da criação do agente até o fechamento da venda, sem sair da plataforma.
          </p>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-xl border bg-white p-6 shadow-sm">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-2 font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24">
        <div className="container">
          <h2 className="mb-4 text-center text-3xl font-bold">Planos para cada fase do negócio</h2>
          <p className="mb-16 text-center text-muted-foreground">
            Pague apenas pelo que usar. Escale quando precisar.
          </p>
          <div className="grid gap-8 md:grid-cols-3">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-xl border p-8 ${plan.featured ? 'border-primary bg-primary text-white shadow-xl' : 'bg-white'}`}
              >
                <h3 className="mb-1 text-xl font-bold">{plan.name}</h3>
                <p className={`mb-4 text-sm ${plan.featured ? 'text-white/80' : 'text-muted-foreground'}`}>
                  {plan.description}
                </p>
                <div className="mb-6">
                  <span className="text-4xl font-extrabold">{plan.price}</span>
                  {plan.period && (
                    <span className={`text-sm ${plan.featured ? 'text-white/80' : 'text-muted-foreground'}`}>
                      {plan.period}
                    </span>
                  )}
                </div>
                <ul className="mb-8 space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <span className={plan.featured ? 'text-white' : 'text-primary'}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`block w-full rounded-lg px-4 py-2 text-center text-sm font-semibold ${
                    plan.featured
                      ? 'bg-white text-primary hover:bg-white/90'
                      : 'bg-primary text-white hover:bg-primary/90'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
              <Zap className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-semibold">ZapAgent</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2025 ZapAgent. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  )
}

const features = [
  {
    icon: Bot,
    title: 'Agentes de IA sem código',
    description:
      'Configure personalidade, tom de voz, base de conhecimento e comportamentos sem escrever uma linha de código.',
  },
  {
    icon: MessageSquare,
    title: 'WhatsApp & Instagram',
    description:
      'Conecte seus canais com QR Code e comece a atender em minutos. Suporte a múltiplos números e perfis.',
  },
  {
    icon: BarChart3,
    title: 'CRM Kanban integrado',
    description:
      'Gerencie leads no funil de vendas com arrastar e soltar. Veja tudo em um único painel.',
  },
  {
    icon: Globe,
    title: 'Widget para seu site',
    description:
      'Adicione um chat ao seu site com uma linha de código. Personalização completa de cores e posição.',
  },
  {
    icon: Zap,
    title: 'Automações visuais',
    description:
      'Crie fluxos de atendimento com gatilhos, condições e ações. Agende mensagens e campanhas.',
  },
  {
    icon: Shield,
    title: 'Múltiplos modelos de IA',
    description:
      'Use GPT-4o, Claude, LLaMA ou DeepSeek. Escolha o melhor custo-benefício para cada agente.',
  },
]

const pricingPlans = [
  {
    name: 'Starter',
    description: 'Para começar a automatizar',
    price: 'R$ 97',
    period: '/mês',
    featured: false,
    cta: 'Começar agora',
    features: [
      '3 agentes de IA',
      '3 canais conectados',
      '2.000 créditos/mês',
      'WhatsApp + Widget',
      'CRM Kanban',
      'Automações básicas',
    ],
  },
  {
    name: 'Pro',
    description: 'Para times em crescimento',
    price: 'R$ 297',
    period: '/mês',
    featured: true,
    cta: 'Testar grátis',
    features: [
      '10 agentes de IA',
      '10 canais conectados',
      '10.000 créditos/mês',
      'Todos os canais',
      'CRM + Analytics',
      'Automações avançadas',
      'API de integração',
      'Marca personalizada',
    ],
  },
  {
    name: 'Enterprise',
    description: 'Para grandes operações',
    price: 'Custom',
    period: undefined,
    featured: false,
    cta: 'Falar com vendas',
    features: [
      'Agentes ilimitados',
      'Canais ilimitados',
      'Créditos ilimitados',
      'SLA dedicado',
      'Onboarding guiado',
      'Suporte prioritário',
    ],
  },
]
