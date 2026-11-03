import { NextRequest, NextResponse } from 'next/server'
import { carregarAgenteDoUsuario, promptDoAgente } from '@/lib/treino/acesso'
import {
  extrairAprendizado, montarTranscricao, promptSemSecao,
  type ConversaTreino, type RegraAprendida,
} from '@/lib/treino/treino-agente'

export const maxDuration = 180

const MAX_CONVERSAS = 30

// POST { conversas?: ConversaTreino[], conversationIds?: string[] }
// Anonimiza, manda para a IA e devolve os itens para o cliente aprovar. Nada é gravado aqui:
// as conversas não ficam guardadas.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await carregarAgenteDoUsuario(params.id)
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
  const { agente, db } = r

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) return NextResponse.json({ error: 'IA não configurada' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const conversas: ConversaTreino[] = Array.isArray(body.conversas) ? body.conversas.slice(0, MAX_CONVERSAS) : []
  const conversationIds: string[] = Array.isArray(body.conversationIds)
    ? body.conversationIds.filter((x: unknown) => typeof x === 'string').slice(0, MAX_CONVERSAS)
    : []

  // Conversas do próprio WHITE ZAP: só as da organização do agente.
  if (conversationIds.length) {
    const { data: convs } = await db
      .from('conversations')
      .select('id, contacts(name)')
      .eq('organization_id', agente.organization_id)
      .in('id', conversationIds)
    const { data: msgs } = await db
      .from('messages')
      .select('conversation_id, role, sender_type, content, content_type, created_at')
      .eq('organization_id', agente.organization_id)
      .in('conversation_id', (convs ?? []).map((c) => c.id))
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: true })
      .limit(5000)
    for (const c of convs ?? []) {
      const contato = (Array.isArray(c.contacts) ? c.contacts[0] : c.contacts) as { name?: string } | null
      const mensagens = (msgs ?? [])
        .filter((m) => m.conversation_id === c.id && m.content && !/^\[(mídia|figurinha|reação:[^\]]*)\]$/.test(m.content.trim()))
        .map((m) => ({
          lado: (m.role === 'user' ? 'cliente' : m.sender_type === 'human' ? 'empresa' : 'agente') as 'cliente' | 'empresa' | 'agente',
          autor: m.role === 'user' ? contato?.name ?? undefined : undefined,
          texto: String(m.content),
        }))
      if (mensagens.length >= 2) conversas.push({ mensagens })
    }
  }

  // Sanitiza o que veio do navegador.
  const limpas: ConversaTreino[] = conversas
    .map((c) => ({
      titulo: typeof c.titulo === 'string' ? c.titulo.slice(0, 100) : undefined,
      textoLivre: typeof c.textoLivre === 'string' ? c.textoLivre : undefined,
      mensagens: Array.isArray(c.mensagens)
        ? c.mensagens
            .filter((m) => m && typeof m.texto === 'string' && ['empresa', 'cliente', 'agente'].includes(m.lado))
            .map((m) => ({ lado: m.lado, autor: typeof m.autor === 'string' ? m.autor.slice(0, 80) : undefined, texto: m.texto.slice(0, 4000) }))
        : undefined,
    }))
    .filter((c) => (c.mensagens?.length ?? 0) > 0 || (c.textoLivre?.trim().length ?? 0) > 0)

  if (!limpas.length) return NextResponse.json({ error: 'Nenhuma conversa com conteúdo para analisar.' }, { status: 400 })

  const transcricao = montarTranscricao(limpas)
  if (transcricao.length < 80) return NextResponse.json({ error: 'As conversas estão muito curtas para aprender algo.' }, { status: 400 })

  // O que o agente já sabe: prompt (sem a seção aprendida), regras aprendidas e base de conhecimento.
  const { texto: prompt } = promptDoAgente(agente.personality)
  const regras = ((agente.behavior_config?.treino as { regras?: RegraAprendida[] } | undefined)?.regras ?? [])
  const { data: fontes } = await db
    .from('agent_knowledge_sources')
    .select('type, name, metadata')
    .eq('organization_id', agente.organization_id)
    .eq('agent_id', agente.id)
    .in('type', ['text', 'faq'])
    .limit(200)
  const base = (fontes ?? [])
    .map((f) => {
      const m = (f.metadata ?? {}) as Record<string, string>
      return f.type === 'faq' ? `P: ${m.question}\nR: ${m.answer}` : `${f.name}: ${m.content ?? ''}`
    })
    .join('\n')
  const conhecimentoAtual = [
    promptSemSecao(prompt).slice(0, 14_000),
    regras.length ? `Regras já aprendidas:\n${regras.map((x) => `- ${x.texto}`).join('\n')}`.slice(0, 4_000) : '',
    base ? `Base de conhecimento:\n${base}`.slice(0, 14_000) : '',
  ].filter(Boolean).join('\n\n')

  try {
    const itens = await extrairAprendizado({ transcricao, conhecimentoAtual, nomeAgente: agente.name, openaiKey })
    return NextResponse.json({ itens, conversasAnalisadas: limpas.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao analisar'
    console.error('[treino/analisar]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
