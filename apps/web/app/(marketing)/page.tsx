'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Bot,
  BarChart3,
  MessageSquare,
  Globe,
  Shield,
  Zap,
  Play,
  Check,
  Menu,
  X,
  Star,
  Users,
  TrendingUp,
  Clock,
  ChevronRight,
  Cpu,
  Workflow,
  Instagram,
  Phone,
  MapPin,
  Building2,
  Filter,
  Layers,
} from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />
      <main>
        <HeroSection />
        <LogosSection />
        <HowItWorksSection />
        <FeaturesSection />
        <ProspectingSection />
        <StatsSection />
        <PricingSection />
        <FinalCTASection />
      </main>
      <Footer />
    </div>
  )
}

function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navLinks = [
    { href: '#features', label: 'Recursos' },
    { href: '#how-it-works', label: 'Como funciona' },
    { href: '#prospecting', label: 'Prospecção' },
    { href: '#pricing', label: 'Preços' },
  ]

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 shadow-sm backdrop-blur-md border-b border-slate-100'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/logo.png"
              alt="White Zap"
              width={150}
              height={52}
              className="object-contain"
              priority
            />
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-blue-500 ${
                  scrolled ? 'text-slate-600' : 'text-white/85'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/login"
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                scrolled
                  ? 'text-slate-700 hover:bg-slate-100'
                  : 'text-white/90 hover:text-white hover:bg-white/10'
              }`}
            >
              Entrar
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-blue-700 transition-all hover:shadow-lg hover:-translate-y-px"
            >
              Começar grátis
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className={`rounded-lg p-2 md:hidden transition-colors ${
              scrolled ? 'text-slate-700 hover:bg-slate-100' : 'text-white hover:bg-white/10'
            }`}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-slate-100 bg-white/98 backdrop-blur-md md:hidden">
          <div className="mx-auto max-w-7xl px-4 py-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-blue-500" />
                {link.label}
              </Link>
            ))}
            <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Entrar
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileOpen(false)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                Começar grátis
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

function HeroSection() {
  return (
    <section className="relative min-h-screen overflow-hidden gradient-hero flex items-center">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 -left-32 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl animate-pulse-slow" />
        <div
          className="absolute top-1/3 right-0 h-80 w-80 rounded-full bg-blue-400/15 blur-3xl animate-pulse-slow"
          style={{ animationDelay: '1.5s' }}
        />
        <div
          className="absolute bottom-1/4 left-1/3 h-64 w-64 rounded-full bg-sky-500/10 blur-2xl animate-pulse-slow"
          style={{ animationDelay: '3s' }}
        />
        <div className="absolute top-20 right-1/4 h-2 w-2 rounded-full bg-blue-400/60 animate-float" />
        <div className="absolute top-40 left-1/4 h-1.5 w-1.5 rounded-full bg-sky-300/50 animate-float-delay" />
        <div
          className="absolute bottom-40 right-1/3 h-2 w-2 rounded-full bg-blue-400/50 animate-float"
          style={{ animationDelay: '0.8s' }}
        />
        <div
          className="absolute top-24 right-12 h-32 w-32 rounded-2xl border border-white/5 rotate-12 hidden lg:block animate-float"
          style={{ animationDelay: '0.5s' }}
        />
        <div className="absolute bottom-32 left-12 h-20 w-20 rounded-2xl border border-white/5 -rotate-6 hidden lg:block animate-float-delay" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-32 sm:px-6 lg:px-8 text-center">
        {/* Logo hero */}
        <div className="animate-slide-up flex justify-center mb-8">
          <Image
            src="/logo.png"
            alt="White Zap"
            width={220}
            height={76}
            className="object-contain opacity-95"
            priority
          />
        </div>

        <div className="animate-slide-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-300 backdrop-blur-sm">
            <span className="flex h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            Novo: Extração de leads + Funil de prospecção
          </span>
        </div>

        <h1 className="mt-8 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-7xl text-balance animate-slide-up-d1">
          Agentes de IA que{' '}
          <span className="gradient-text-white">vendem e atendem</span>
          <br className="hidden sm:block" />
          enquanto você dorme
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300/90 leading-relaxed animate-slide-up-d2">
          Conecte GPT-4o ao seu WhatsApp e Instagram, extraia leads automaticamente e gerencie
          todo o funil de vendas em um só lugar. Sem código. Resultado do primeiro dia.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row animate-slide-up-d3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-8 py-4 text-base font-bold text-white shadow-xl shadow-blue-900/40 hover:bg-blue-400 transition-all hover:-translate-y-1 hover:shadow-2xl"
          >
            Criar meu agente grátis
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            href="#how-it-works"
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.08] px-8 py-4 text-base font-semibold text-white backdrop-blur-sm hover:bg-white/[0.15] transition-all hover:-translate-y-1"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/40 bg-white/10">
              <Play className="h-3 w-3 fill-white text-white ml-0.5" />
            </div>
            Ver como funciona
          </Link>
        </div>

        <div className="mt-14 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-10 animate-slide-up-d4">
          {[
            { Icon: TrendingUp, label: '10.000+ mensagens/dia' },
            { Icon: Shield, label: '99.9% uptime' },
            { Icon: Clock, label: '< 2s resposta' },
          ].map(({ Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <Icon className="h-4 w-4 text-blue-400" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function LogosSection() {
  const models = [
    { name: 'GPT-4o', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { name: 'Claude', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-100' },
    { name: 'LLaMA 3', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100' },
    { name: 'DeepSeek', color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-100' },
    { name: 'Groq', color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-100' },
  ]

  return (
    <section className="border-b border-blue-50 bg-blue-50/40 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="mb-8 text-center text-xs font-semibold uppercase tracking-widest text-slate-400">
          Compatível com os melhores modelos de IA
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {models.map((m) => (
            <div
              key={m.name}
              className={`inline-flex items-center gap-2 rounded-xl border ${m.border} ${m.bg} px-5 py-2.5 shadow-sm hover:shadow-md transition-shadow`}
            >
              <Cpu className={`h-4 w-4 ${m.color}`} />
              <span className={`text-sm font-bold ${m.color}`}>{m.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  const steps = [
    {
      number: '01',
      Icon: Bot,
      title: 'Crie seu agente',
      description: 'Dê um nome, escolha a personalidade e defina o objetivo do agente em segundos.',
      iconColor: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
    },
    {
      number: '02',
      Icon: MessageSquare,
      title: 'Treine com seus dados',
      description: 'Suba documentos, PDFs, links, FAQs e fotos de produtos. O agente aprende tudo.',
      iconColor: 'text-sky-600',
      bg: 'bg-sky-50',
      border: 'border-sky-100',
    },
    {
      number: '03',
      Icon: Phone,
      title: 'Conecte o canal',
      description: 'Escaneie o QR code do WhatsApp ou conecte o Instagram com um clique.',
      iconColor: 'text-violet-600',
      bg: 'bg-violet-50',
      border: 'border-violet-100',
    },
    {
      number: '04',
      Icon: Workflow,
      title: 'Configure automações',
      description: 'Defina gatilhos, horários de atendimento, handoff humano e muito mais.',
      iconColor: 'text-indigo-600',
      bg: 'bg-indigo-50',
      border: 'border-indigo-100',
    },
    {
      number: '05',
      Icon: Zap,
      title: 'Bot atende e vende',
      description: 'Seu agente começa a responder clientes 24h por dia, 7 dias por semana.',
      iconColor: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
    },
  ]

  return (
    <section id="how-it-works" className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700">
            Como funciona
          </span>
          <h2 className="mt-4 text-3xl font-extrabold text-slate-900 sm:text-4xl lg:text-5xl">
            Do zero ao bot funcionando{' '}
            <span className="gradient-text">em 5 minutos</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-500">
            Sem precisar de desenvolvedor. Sem configurações complicadas. Qualquer pessoa consegue.
          </p>
        </div>

        <div className="relative">
          <div
            className="absolute top-16 bottom-16 w-px bg-gradient-to-b from-blue-200 via-blue-400 to-blue-200 hidden lg:block"
            style={{ left: 'calc(50% - 0.5px)' }}
          />
          <div className="space-y-10">
            {steps.map((step, i) => (
              <div
                key={step.number}
                className={`relative flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-16 ${
                  i % 2 === 1 ? 'lg:flex-row-reverse' : ''
                }`}
              >
                <div className={`flex-1 ${i % 2 === 1 ? 'lg:text-right' : ''}`}>
                  <div
                    className={`inline-flex flex-col gap-3 rounded-2xl border ${step.border} ${step.bg} p-6 shadow-sm hover:shadow-md transition-shadow max-w-sm ${
                      i % 2 === 1 ? 'lg:ml-auto' : ''
                    }`}
                  >
                    <div
                      className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border ${step.border} bg-white shadow-sm`}
                    >
                      <step.Icon className={`h-6 w-6 ${step.iconColor}`} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">{step.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-500">{step.description}</p>
                  </div>
                </div>

                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-xl mx-auto lg:mx-0 z-10">
                  <span className="text-xl font-black">{step.number}</span>
                </div>

                <div className="flex-1 hidden lg:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  const features = [
    {
      Icon: Bot,
      title: 'Agentes IA sem código',
      description:
        'Configure personalidade, tom de voz, base de conhecimento e comportamentos sem escrever uma linha de código.',
      badge: 'Core',
      badgeColor: 'bg-blue-100 text-blue-700',
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-50',
    },
    {
      Icon: MessageSquare,
      title: 'WhatsApp & Instagram',
      description:
        'Conecte seus canais com QR Code e comece a atender em minutos. Suporte a múltiplos números e perfis.',
      badge: 'Canais',
      badgeColor: 'bg-sky-100 text-sky-700',
      iconColor: 'text-sky-600',
      iconBg: 'bg-sky-50',
    },
    {
      Icon: BarChart3,
      title: 'CRM Kanban integrado',
      description:
        'Gerencie leads no funil de vendas com arrastar e soltar. Veja todo o pipeline em um único painel.',
      badge: 'Vendas',
      badgeColor: 'bg-violet-100 text-violet-700',
      iconColor: 'text-violet-600',
      iconBg: 'bg-violet-50',
    },
    {
      Icon: Globe,
      title: 'Widget para seu site',
      description:
        'Adicione um chat flutuante ao seu site com uma linha de código. Personalização total de cores e posição.',
      badge: 'Web',
      badgeColor: 'bg-indigo-100 text-indigo-700',
      iconColor: 'text-indigo-600',
      iconBg: 'bg-indigo-50',
    },
    {
      Icon: Workflow,
      title: 'Automações visuais',
      description:
        'Crie fluxos de atendimento com gatilhos, condições e ações. Agende mensagens e campanhas de disparo.',
      badge: 'Automação',
      badgeColor: 'bg-blue-100 text-blue-700',
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-50',
    },
    {
      Icon: Shield,
      title: 'Múltiplos modelos IA',
      description:
        'Use GPT-4o, Claude, LLaMA 3 ou DeepSeek. Escolha o melhor custo-benefício para cada agente.',
      badge: 'IA',
      badgeColor: 'bg-cyan-100 text-cyan-700',
      iconColor: 'text-cyan-600',
      iconBg: 'bg-cyan-50',
    },
  ]

  return (
    <section id="features" className="py-24 bg-blue-50/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-16 text-center">
          <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700">
            Recursos
          </span>
          <h2 className="mt-4 text-3xl font-extrabold text-slate-900 sm:text-4xl lg:text-5xl">
            Tudo que você precisa{' '}
            <span className="gradient-text">em um só lugar</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-500">
            Da criação do agente até o fechamento da venda, sem sair da plataforma.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="mb-4 flex items-start justify-between">
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${f.iconBg}`}>
                  <f.Icon className={`h-6 w-6 ${f.iconColor}`} />
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${f.badgeColor}`}>
                  {f.badge}
                </span>
              </div>

              <h3 className="mb-2 text-base font-bold text-slate-900">{f.title}</h3>
              <p className="text-sm leading-relaxed text-slate-500">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProspectingSection() {
  const extractionSources = [
    {
      Icon: MapPin,
      title: 'Google Maps',
      description: 'Extraia leads de qualquer segmento e região com nome, telefone e endereço.',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      badge: 'Disponível',
      badgeColor: 'bg-blue-100 text-blue-700',
    },
    {
      Icon: Instagram,
      title: 'Instagram',
      description: 'Importe seguidores dos concorrentes e transforme-os em leads qualificados.',
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      border: 'border-violet-100',
      badge: 'Em breve',
      badgeColor: 'bg-violet-100 text-violet-700',
    },
    {
      Icon: Building2,
      title: 'CNPJ / Receita Federal',
      description: 'Filtre empresas por segmento, porte e data de abertura diretamente da Receita.',
      color: 'text-sky-600',
      bg: 'bg-sky-50',
      border: 'border-sky-100',
      badge: 'Em breve',
      badgeColor: 'bg-sky-100 text-sky-700',
    },
    {
      Icon: MessageSquare,
      title: 'Grupos WhatsApp',
      description: 'Extraia contatos de grupos e inicie conversas automáticas com segmentação.',
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      border: 'border-indigo-100',
      badge: 'Em breve',
      badgeColor: 'bg-indigo-100 text-indigo-700',
    },
  ]

  const funnelStages = [
    { label: 'Novo Lead', count: 142, color: 'bg-blue-500' },
    { label: 'Primeiro Contato', count: 87, color: 'bg-sky-500' },
    { label: 'Qualificado', count: 54, color: 'bg-violet-500' },
    { label: 'Proposta', count: 28, color: 'bg-indigo-500' },
    { label: 'Fechado', count: 16, color: 'bg-blue-700' },
  ]

  return (
    <section id="prospecting" className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Extração de leads */}
        <div className="mb-20">
          <div className="mb-12 text-center">
            <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700">
              Extração de Leads
            </span>
            <h2 className="mt-4 text-3xl font-extrabold text-slate-900 sm:text-4xl lg:text-5xl">
              Encontre clientes onde{' '}
              <span className="gradient-text">eles estão</span>
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-500">
              Extraia leads com telefone diretamente do Google Maps, Instagram, CNPJ e grupos do
              WhatsApp. Tudo dentro da plataforma, sem ferramentas externas.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {extractionSources.map((s) => (
              <div
                key={s.title}
                className={`relative rounded-2xl border ${s.border} ${s.bg} p-6 hover:shadow-md transition-shadow`}
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm border ${s.border}`}>
                    <s.Icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.badgeColor}`}>
                    {s.badge}
                  </span>
                </div>
                <h3 className="mb-1.5 text-base font-bold text-slate-900">{s.title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{s.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Funil de prospecção */}
        <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-50/50 p-8 lg:p-12">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700 mb-4">
                Funil de Prospecção
              </span>
              <h2 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">
                Sequências automáticas{' '}
                <span className="gradient-text">que vendem por você</span>
              </h2>
              <p className="mt-4 text-lg text-slate-500">
                Crie etapas personalizadas no funil e configure sequências automáticas de mensagens
                — texto, áudio, imagem ou PDF — com delays inteligentes. A IA qualifica e avança
                o lead automaticamente.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'Etapas personalizadas com nome e cor',
                  'Sequências: texto, áudio, imagem e PDF',
                  'Delays configuráveis entre mensagens',
                  'IA avança o lead por resposta automática',
                  'Métricas de conversão por etapa',
                  'Kanban visual com drag-and-drop',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    <span className="text-sm text-slate-600">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex items-center gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg hover:bg-blue-700 transition-all hover:-translate-y-px"
                >
                  Começar grátis
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <span className="text-xs text-slate-400">Em breve no plano Pro</span>
              </div>
            </div>

            {/* Funil visual mockup */}
            <div className="rounded-2xl border border-blue-200 bg-white p-6 shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-slate-800">Funil: Clientes Tinta</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs text-slate-400">327 leads totais</span>
                </div>
              </div>

              <div className="space-y-3">
                {funnelStages.map((stage, i) => (
                  <div key={stage.label} className="flex items-center gap-3">
                    <div className="w-28 shrink-0">
                      <span className="text-xs font-medium text-slate-600">{stage.label}</span>
                    </div>
                    <div className="flex-1 h-7 rounded-lg bg-slate-100 overflow-hidden relative">
                      <div
                        className={`h-full rounded-lg ${stage.color} flex items-center justify-end pr-2 transition-all`}
                        style={{ width: `${(stage.count / 142) * 100}%` }}
                      >
                        <span className="text-xs font-bold text-white">{stage.count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg font-black text-blue-600">11%</div>
                  <div className="text-xs text-slate-400">Conversão</div>
                </div>
                <div>
                  <div className="text-lg font-black text-slate-800">2.4x</div>
                  <div className="text-xs text-slate-400">ROI médio</div>
                </div>
                <div>
                  <div className="text-lg font-black text-violet-600">3h</div>
                  <div className="text-xs text-slate-400">Economia/dia</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function StatsSection() {
  const stats = [
    { value: '500+', label: 'Empresas ativas', Icon: Users },
    { value: '2M+', label: 'Mensagens por mês', Icon: MessageSquare },
    { value: '98%', label: 'Satisfação dos clientes', Icon: Star },
    { value: '24/7', label: 'Suporte em português', Icon: Clock },
  ]

  return (
    <section className="gradient-dark py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Números que comprovam nosso impacto
          </h2>
          <p className="mt-3 text-slate-400">Empresas de todos os tamanhos confiam no White Zap</p>
        </div>

        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center text-center">
              <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/15 border border-blue-500/20">
                <stat.Icon className="h-6 w-6 text-blue-400" />
              </div>
              <div className="text-4xl font-black text-white lg:text-5xl">{stat.value}</div>
              <div className="mt-2 text-sm font-medium text-slate-400">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PricingSection() {
  const [annual, setAnnual] = useState(false)

  const plans = [
    {
      name: 'Free',
      description: 'Para conhecer a plataforma',
      monthlyPrice: 0,
      featured: false,
      cta: 'Criar conta grátis',
      ctaHref: '/signup',
      features: [
        '1 agente de IA',
        '1 canal conectado',
        '100 créditos/mês',
        'WhatsApp + Widget',
        'Base de conhecimento',
        'Suporte via chat',
      ],
    },
    {
      name: 'Starter',
      description: 'Para quem quer começar a automatizar',
      monthlyPrice: 97,
      featured: false,
      cta: 'Começar agora',
      ctaHref: '/signup?plan=starter',
      features: [
        '3 agentes de IA',
        '3 canais conectados',
        '2.000 créditos/mês',
        'WhatsApp + Instagram + Widget',
        'CRM Kanban',
        'Automações',
        'Analytics',
        'Suporte via chat',
      ],
    },
    {
      name: 'Pro',
      description: 'Para times em crescimento acelerado',
      monthlyPrice: 297,
      featured: true,
      cta: 'Testar grátis por 14 dias',
      ctaHref: '/signup?plan=pro',
      features: [
        '10 agentes de IA',
        '10 canais conectados',
        '10.000 créditos/mês',
        'Todos os canais',
        'Extração de leads (Maps)',
        'Funil de prospecção',
        'CRM + Analytics avançado',
        'API de integração',
        'Marca personalizada',
        'Suporte prioritário',
      ],
    },
    {
      name: 'Enterprise',
      description: 'Para grandes operações e revendas',
      monthlyPrice: null,
      featured: false,
      cta: 'Falar com vendas',
      ctaHref: '/contact',
      features: [
        'Agentes ilimitados',
        'Canais ilimitados',
        'Créditos ilimitados',
        'SLA dedicado 99.9%',
        'Onboarding guiado',
        'Gerente de sucesso',
        'Suporte 24/7',
      ],
    },
  ]

  return (
    <section id="pricing" className="py-24 bg-blue-50/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <span className="inline-block rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700">
            Preços
          </span>
          <h2 className="mt-4 text-3xl font-extrabold text-slate-900 sm:text-4xl lg:text-5xl">
            Planos para cada{' '}
            <span className="gradient-text">fase do negócio</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-500">
            Pague apenas pelo que usar. Escale quando precisar. Cancele quando quiser.
          </p>

          <div className="mt-8 inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                !annual
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                annual
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Anual
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                -20%
              </span>
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-4 lg:items-stretch">
          {plans.map((plan) => {
            const price =
              plan.monthlyPrice !== null
                ? plan.monthlyPrice === 0
                  ? 0
                  : annual
                  ? Math.round(plan.monthlyPrice * 0.8)
                  : plan.monthlyPrice
                : null

            return (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl p-7 ${
                  plan.featured
                    ? 'border-2 border-blue-500 bg-slate-900 shadow-2xl shadow-blue-900/30 lg:scale-105'
                    : 'border border-slate-200 bg-white shadow-sm hover:shadow-lg transition-shadow'
                }`}
              >
                {plan.featured && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500 px-4 py-1 text-xs font-bold text-white shadow-lg">
                      <Star className="h-3 w-3 fill-white" />
                      Mais popular
                    </span>
                  </div>
                )}

                <div>
                  <h3
                    className={`text-xl font-bold ${
                      plan.featured ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {plan.name}
                  </h3>
                  <p
                    className={`mt-1 text-sm ${
                      plan.featured ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {plan.description}
                  </p>

                  <div className="mt-6 flex items-end gap-1">
                    {price !== null ? (
                      price === 0 ? (
                        <span className={`text-3xl font-black ${plan.featured ? 'text-white' : 'text-slate-900'}`}>
                          Grátis
                        </span>
                      ) : (
                        <>
                          <span className={`text-sm font-medium ${plan.featured ? 'text-slate-400' : 'text-slate-500'}`}>
                            R$
                          </span>
                          <span className={`text-5xl font-black leading-none ${plan.featured ? 'text-white' : 'text-slate-900'}`}>
                            {price}
                          </span>
                          <span className={`mb-1 text-sm ${plan.featured ? 'text-slate-400' : 'text-slate-500'}`}>
                            /mês
                          </span>
                        </>
                      )
                    ) : (
                      <span className={`text-3xl font-black ${plan.featured ? 'text-white' : 'text-slate-900'}`}>
                        Sob consulta
                      </span>
                    )}
                  </div>

                  {annual && price !== null && plan.monthlyPrice !== null && plan.monthlyPrice > 0 && (
                    <p className="mt-1 text-xs text-blue-400 font-medium">
                      Cobrado anualmente · Economize R$
                      {Math.round(plan.monthlyPrice * 12 * 0.2)}/ano
                    </p>
                  )}
                </div>

                <ul className="mt-8 space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          plan.featured ? 'text-blue-400' : 'text-blue-600'
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          plan.featured ? 'text-slate-300' : 'text-slate-600'
                        }`}
                      >
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  <Link
                    href={plan.ctaHref}
                    className={`block w-full rounded-xl px-6 py-3.5 text-center text-sm font-bold transition-all hover:-translate-y-px ${
                      plan.featured
                        ? 'bg-blue-500 text-white hover:bg-blue-400 shadow-lg shadow-blue-900/40'
                        : 'bg-slate-900 text-white hover:bg-slate-700'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FinalCTASection() {
  return (
    <section
      className="relative overflow-hidden py-28"
      style={{ background: 'linear-gradient(135deg, #0c1a4e 0%, #1e3a8a 40%, #2563eb 100%)' }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <div className="mb-6 flex justify-center">
          <Image src="/logo.png" alt="White Zap" width={180} height={62} className="object-contain opacity-90" />
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-4 py-1.5 text-xs font-semibold text-blue-300 mb-6">
          <Zap className="h-3.5 w-3.5" />
          Comece hoje, sem riscos
        </span>

        <h2 className="text-3xl font-extrabold text-white sm:text-4xl lg:text-5xl text-balance">
          Seu primeiro agente pronto
          <br />
          <span className="gradient-text-white">em 5 minutos.</span>
        </h2>

        <p className="mx-auto mt-6 max-w-xl text-lg text-blue-100/80">
          Junte-se a centenas de empresas que já automatizaram seu atendimento e prospecção com White Zap.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-blue-700 shadow-2xl hover:bg-blue-50 transition-all hover:-translate-y-1"
          >
            Criar conta grátis
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-8 py-4 text-base font-semibold text-white backdrop-blur-sm hover:bg-white/20 transition-all hover:-translate-y-1"
          >
            Já tenho uma conta
          </Link>
        </div>

        <p className="mt-6 text-sm text-blue-200/60">
          Sem cartão de crédito · Cancele quando quiser
        </p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-slate-100 bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <Image src="/logo.png" alt="White Zap" width={160} height={55} className="object-contain mb-4" />
            <p className="text-sm leading-relaxed text-slate-500 max-w-xs">
              Plataforma de agentes de IA para WhatsApp, Instagram e sites. Automatize seu
              atendimento e prospecção em minutos.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-slate-900">Produto</h4>
            <ul className="space-y-2.5">
              {[
                { href: '#features', label: 'Recursos' },
                { href: '#how-it-works', label: 'Como funciona' },
                { href: '#prospecting', label: 'Prospecção' },
                { href: '#pricing', label: 'Preços' },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-slate-500 hover:text-blue-600 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-slate-900">Conta</h4>
            <ul className="space-y-2.5">
              {[
                { href: '/signup', label: 'Criar conta' },
                { href: '/login', label: 'Entrar' },
                { href: '/forgot-password', label: 'Recuperar senha' },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-slate-500 hover:text-blue-600 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-8 sm:flex-row">
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} White Zap. Todos os direitos reservados.
          </p>
          <p className="text-xs text-slate-400">
            Pagamentos processados com segurança via Asaas · PIX e Cartão
          </p>
        </div>
      </div>
    </footer>
  )
}
