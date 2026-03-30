'use client'

import { X, GitBranch, Clock, Mic, MessageSquare, Image, ChevronRight, Zap, Users } from 'lucide-react'

interface Props {
  onClose: () => void
}

const STAGES = [
  {
    color: '#ef4444',
    name: 'Novo Lead',
    desc: 'Contatos recém-captados, ainda sem contato.',
    messages: [
      { tipo: 'Texto', delay: '0 min', obj: 'Apresentação + pergunta de qualificação' },
      { tipo: 'Áudio', delay: '60 min', obj: 'Reforço em áudio — maior taxa de abertura' },
      { tipo: 'Texto', delay: '24h', obj: 'Follow-up: "Chegou a ver minha mensagem?"' },
    ],
  },
  {
    color: '#f97316',
    name: 'Primeiro Contato',
    desc: 'Respondeu, mas ainda não qualificado.',
    messages: [
      { tipo: 'Texto', delay: '0 min', obj: 'Perguntas de qualificação (budget, urgência)' },
      { tipo: 'Imagem', delay: '2h', obj: 'Portfólio, cases ou tabela de preços' },
      { tipo: 'Texto', delay: '48h', obj: '"Você conseguiu avaliar o que enviei?"' },
    ],
  },
  {
    color: '#eab308',
    name: 'Qualificado',
    desc: 'Tem interesse e perfil — foco em agendar reunião.',
    messages: [
      { tipo: 'Texto', delay: '0 min', obj: 'Proposta de valor + convite para reunião/demo' },
      { tipo: 'Áudio', delay: '4h', obj: 'Reforço pessoal do vendedor' },
      { tipo: 'Texto', delay: '72h', obj: 'Último follow-up antes de arquivar' },
    ],
  },
  {
    color: '#3b82f6',
    name: 'Proposta Enviada',
    desc: 'Recebeu proposta — foco em tirar dúvidas e fechar.',
    messages: [
      { tipo: 'Texto', delay: '0 min', obj: '"Acabei de enviar a proposta. Alguma dúvida?"' },
      { tipo: 'Texto', delay: '48h', obj: 'Escassez suave: condição válida até [data]' },
      { tipo: 'Áudio', delay: '5 dias', obj: 'Última chamada para decisão' },
    ],
  },
  {
    color: '#22c55e',
    name: 'Fechado',
    desc: 'Cliente convertido — foco em onboarding.',
    messages: [
      { tipo: 'Texto', delay: '0 min', obj: 'Boas-vindas + próximos passos' },
      { tipo: 'Texto', delay: '7 dias', obj: 'Pesquisa de satisfação' },
    ],
  },
]

const TIPO_COLOR: Record<string, string> = {
  Texto: 'bg-blue-100 text-blue-700',
  Áudio: 'bg-green-100 text-green-700',
  Imagem: 'bg-pink-100 text-pink-700',
}

const FLOW_STEPS = [
  { icon: Users, title: 'Lead adicionado à etapa', desc: 'Você adiciona um contato a uma etapa. O sistema agenda a 1ª mensagem para envio imediato.' },
  { icon: Zap, title: 'Cron verifica a cada minuto', desc: 'Um processo automático verifica quais leads têm mensagem vencida e dispara via WhatsApp.' },
  { icon: MessageSquare, title: 'Mensagem enviada', desc: 'Texto, imagem ou áudio — conforme você configurou na sequência da etapa.' },
  { icon: Clock, title: 'Próxima mensagem agendada', desc: 'O sistema registra quando a próxima deve sair e repete até terminar a sequência.' },
  { icon: GitBranch, title: 'Status "Aguardando"', desc: 'Quando a sequência termina, o lead fica com badge laranja. Esse é o sinal para você avaliar e mover.' },
]

const RULES = [
  { icon: '⏱', title: 'Delays ideais', desc: 'Msg 1: sempre 0 min. Entre mensagens de aquecimento: 1h–4h. Follow-ups: 24h–72h.' },
  { icon: '🎙', title: 'Áudio converte mais', desc: 'Leads que recebem áudio têm 2–3× mais chances de responder do que texto puro.' },
  { icon: '✂️', title: 'Sequências curtas', desc: '3 mensagens por etapa é o ideal. Mais de 5 vira spam e gera bloqueios no WhatsApp.' },
  { icon: '⏳', title: 'Espere o "Aguardando"', desc: 'Não mova o lead antes da sequência terminar. O badge laranja é o sinal certo para agir.' },
  { icon: '📱', title: 'Configure o canal', desc: 'Cada funil precisa de um canal WhatsApp ativo. Sem canal, nenhuma mensagem é disparada.' },
  { icon: '🎯', title: 'Um funil por segmento', desc: 'Crie funis separados para cada tipo de cliente. Mensagens genéricas convertem menos.' },
]

export function FunnelHelpModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 border-b bg-gradient-to-r from-blue-900 to-blue-600 px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
            <GitBranch className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Como funciona o módulo de Funis</h2>
            <p className="text-xs text-blue-200">Guia completo de uso</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* Intro */}
          <div className="border-b bg-blue-50 px-6 py-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              O módulo de Funis organiza seus leads em etapas (Kanban) e dispara
              <strong className="text-blue-700"> sequências automáticas de mensagens via WhatsApp</strong> conforme
              o lead avança no processo. As mensagens saem sozinhas no tempo certo — você só precisa mover o lead quando ele estiver pronto para avançar.
            </p>
          </div>

          <div className="space-y-0 divide-y">

            {/* SEÇÃO: Como funciona */}
            <section className="px-6 py-5">
              <h3 className="mb-4 text-sm font-bold text-slate-900">Fluxo automático</h3>
              <div className="space-y-3">
                {FLOW_STEPS.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                        {i + 1}
                      </div>
                      {i < FLOW_STEPS.length - 1 && <div className="mt-1 h-5 w-px bg-blue-200" />}
                    </div>
                    <div className="pb-2">
                      <p className="text-xs font-semibold text-slate-800">{step.title}</p>
                      <p className="text-xs text-slate-500 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* SEÇÃO: Como usar */}
            <section className="px-6 py-5">
              <h3 className="mb-4 text-sm font-bold text-slate-900">Como usar o sistema</h3>
              <div className="space-y-4">

                <div>
                  <p className="mb-2 text-xs font-semibold text-blue-700 uppercase tracking-wide">Criando um funil</p>
                  <ol className="space-y-1.5">
                    {[
                      'Clique em "Novo funil" e dê um nome (ex: "Prospecção B2B")',
                      'O sistema cria automaticamente 5 etapas padrão',
                      'Clique em "Abrir funil" para entrar no Kanban',
                      'Configure as mensagens de cada etapa clicando no ícone ⚙',
                    ].map((t, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 font-bold text-[10px]">{i + 1}</span>
                        {t}
                      </li>
                    ))}
                  </ol>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-blue-700 uppercase tracking-wide">Configurando mensagens da etapa</p>
                  <ol className="space-y-1.5">
                    {[
                      'Clique no ícone ⚙ no cabeçalho da etapa',
                      'Clique em "+ Adicionar" para criar uma mensagem',
                      'Defina: Tipo (Texto / Imagem / Áudio), Delay em minutos e Conteúdo',
                      'A 1ª mensagem deve ter delay = 0 (envio imediato ao entrar na etapa)',
                      'Clique em "Salvar"',
                    ].map((t, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 font-bold text-[10px]">{i + 1}</span>
                        {t}
                      </li>
                    ))}
                  </ol>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-blue-700 uppercase tracking-wide">Ações nos cards de lead</p>
                  <div className="space-y-1.5">
                    {[
                      { icon: '⏸', label: 'Pausar / Retomar', desc: 'Para temporariamente os disparos para aquele lead' },
                      { icon: '↔', label: 'Mover de etapa', desc: 'Transfere o lead e reinicia a sequência da nova etapa' },
                      { icon: '✕', label: 'Remover', desc: 'Remove o lead do funil (não apaga o contato)' },
                      { icon: '🟠', label: 'Badge "Aguardando"', desc: 'Sequência concluída — momento ideal para agir e mover o lead' },
                    ].map((a, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2">
                        <span className="text-sm">{a.icon}</span>
                        <div>
                          <span className="text-xs font-semibold text-slate-700">{a.label}: </span>
                          <span className="text-xs text-slate-500">{a.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* SEÇÃO: Estrutura sugerida */}
            <section className="px-6 py-5">
              <h3 className="mb-1 text-sm font-bold text-slate-900">Estrutura de funil recomendada</h3>
              <p className="mb-4 text-xs text-slate-500">5 etapas com sequências otimizadas para conversão</p>
              <div className="space-y-3">
                {STAGES.map((stage) => (
                  <details key={stage.name} className="group rounded-xl border overflow-hidden">
                    <summary className="flex cursor-pointer items-center gap-2.5 px-4 py-3 hover:bg-slate-50 transition-colors list-none">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                      <span className="flex-1 text-sm font-semibold text-slate-800">{stage.name}</span>
                      <span className="text-xs text-slate-400 mr-2">{stage.desc}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="border-t bg-slate-50 px-4 py-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400">
                            <th className="pb-2 font-medium w-6">#</th>
                            <th className="pb-2 font-medium w-16">Tipo</th>
                            <th className="pb-2 font-medium w-16">Delay</th>
                            <th className="pb-2 font-medium">Objetivo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {stage.messages.map((msg, i) => (
                            <tr key={i}>
                              <td className="py-1.5 text-slate-400">{i + 1}</td>
                              <td className="py-1.5">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TIPO_COLOR[msg.tipo]}`}>
                                  {msg.tipo}
                                </span>
                              </td>
                              <td className="py-1.5 text-slate-500">{msg.delay}</td>
                              <td className="py-1.5 text-slate-600">{msg.obj}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            </section>

            {/* SEÇÃO: Regras de ouro */}
            <section className="px-6 py-5">
              <h3 className="mb-4 text-sm font-bold text-slate-900">Regras de ouro</h3>
              <div className="grid grid-cols-2 gap-3">
                {RULES.map((r) => (
                  <div key={r.title} className="rounded-xl border bg-slate-50 p-3">
                    <div className="mb-1 text-lg">{r.icon}</div>
                    <p className="mb-1 text-xs font-semibold text-slate-800">{r.title}</p>
                    <p className="text-xs text-slate-500 leading-relaxed">{r.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* SEÇÃO: Tabela de delays */}
            <section className="px-6 py-5">
              <h3 className="mb-3 text-sm font-bold text-slate-900">Referência de delays</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-blue-900 text-white">
                    <th className="rounded-tl-lg px-3 py-2 text-left font-medium">Minutos</th>
                    <th className="px-3 py-2 text-left font-medium">Equivale a</th>
                    <th className="rounded-tr-lg px-3 py-2 text-left font-medium">Quando usar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    ['0', 'Imediato', 'Sempre na 1ª mensagem de cada etapa'],
                    ['60', '1 hora', 'Reforço rápido após apresentação'],
                    ['240', '4 horas', 'Segundo toque no mesmo dia'],
                    ['1440', '1 dia', 'Follow-up no dia seguinte'],
                    ['2880', '2 dias', 'Follow-up após proposta'],
                    ['4320', '3 dias', 'Último follow-up de qualificação'],
                    ['7200', '5 dias', 'Pressão de decisão em propostas'],
                    ['10080', '7 dias', 'Pesquisa de satisfação pós-venda'],
                  ].map(([min, eq, when], i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-3 py-2 font-mono font-semibold text-blue-700">{min}</td>
                      <td className="px-3 py-2 text-slate-600">{eq}</td>
                      <td className="px-3 py-2 text-slate-500">{when}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

          </div>
        </div>

        {/* Footer */}
        <div className="border-t bg-slate-50 px-6 py-3 flex items-center justify-between">
          <p className="text-xs text-slate-400">Dúvidas? Entre em contato com o suporte White Zap.</p>
          <button
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
