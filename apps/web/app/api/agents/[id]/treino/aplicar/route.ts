import { NextRequest, NextResponse } from 'next/server'
import { carregarAgenteDoUsuario, promptDoAgente } from '@/lib/treino/acesso'
import { processarFonteConhecimento } from '@/lib/conhecimento'
import {
  aplicarSecaoNoPrompt, montarSecaoAprendida, MAX_ITENS,
  type ItemAprendido, type RegraAprendida,
} from '@/lib/treino/treino-agente'

export const maxDuration = 120

const MAX_EXEMPLOS = 5
const MAX_HISTORICO = 5

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

// POST { itens: ItemAprendido[] } — só os que o cliente aprovou (podem ter sido editados).
// Perguntas e fatos → base de conhecimento; estilo, transferência, exemplos e fatos que
// mudaram → seção aprendida do prompt. Guarda o prompt anterior em historicoPrompt.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await carregarAgenteDoUsuario(params.id)
  if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
  const { agente, db } = r

  const body = await req.json().catch(() => ({}))
  const itens: ItemAprendido[] = (Array.isArray(body.itens) ? body.itens : []).slice(0, MAX_ITENS)
  if (!itens.length) return NextResponse.json({ error: 'Nenhum item aprovado.' }, { status: 400 })

  const txt = (v: unknown, max = 2500) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const agora = new Date().toISOString()
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  // 1. Base de conhecimento
  const novasFontes: Record<string, unknown>[] = []
  const fatos: string[] = []
  const novasRegras: RegraAprendida[] = []

  for (const it of itens) {
    const pergunta = txt(it.pergunta, 500)
    const resposta = txt(it.resposta)
    const texto = txt(it.texto)
    if ((it.tipo === 'faq' || it.tipo === 'lacuna') && pergunta && resposta) {
      novasFontes.push({ type: 'faq', name: pergunta.slice(0, 100), metadata: { question: pergunta, answer: resposta, origem: 'treino' } })
    } else if (it.tipo === 'objecao' && pergunta && resposta) {
      const q = `Quando o cliente diz: "${pergunta}"`
      novasFontes.push({ type: 'faq', name: q.slice(0, 100), metadata: { question: q, answer: resposta, origem: 'treino' } })
    } else if (it.tipo === 'fato' && texto) {
      fatos.push(texto)
      if (it.situacao === 'contradiz') novasRegras.push({ id: crypto.randomUUID(), tipo: 'atualizacao', texto, criadoEm: agora })
    } else if ((it.tipo === 'estilo' || it.tipo === 'transferencia' || it.tipo === 'exemplo') && texto) {
      novasRegras.push({ id: crypto.randomUUID(), tipo: it.tipo, texto, criadoEm: agora })
    }
  }
  if (fatos.length) {
    novasFontes.push({
      type: 'text',
      name: `Aprendido nas conversas — ${hoje}`,
      metadata: { content: fatos.map((f) => `- ${f}`).join('\n'), origem: 'treino' },
    })
  }

  let idsFontes: string[] = []
  if (novasFontes.length) {
    const { data, error } = await db
      .from('agent_knowledge_sources')
      .insert(novasFontes.map((f) => ({ ...f, agent_id: agente.id, organization_id: agente.organization_id, status: 'pending' })))
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    idsFontes = (data ?? []).map((d) => d.id)
  }

  // 2. Seção aprendida do prompt
  const behavior = agente.behavior_config ?? {}
  const treino = (behavior.treino as { regras?: RegraAprendida[] } | undefined) ?? {}
  let regras = [...(treino.regras ?? [])]
  for (const nova of novasRegras) {
    if (!regras.some((x) => x.tipo === nova.tipo && norm(x.texto) === norm(nova.texto))) regras.push(nova)
  }
  const exemplos = regras.filter((x) => x.tipo === 'exemplo')
  if (exemplos.length > MAX_EXEMPLOS) {
    const sair = new Set(exemplos.slice(0, exemplos.length - MAX_EXEMPLOS).map((x) => x.id))
    regras = regras.filter((x) => !sair.has(x.id))
  }

  const personality = agente.personality ?? {}
  const { campo, texto: promptAtual } = promptDoAgente(personality)
  const novoPrompt = novasRegras.length ? aplicarSecaoNoPrompt(promptAtual, montarSecaoAprendida(regras)) : promptAtual
  const historico = Array.isArray(behavior.historicoPrompt) ? (behavior.historicoPrompt as unknown[]) : []

  if (novoPrompt !== promptAtual) {
    const { error } = await db
      .from('agents')
      .update({
        personality: { ...personality, [campo]: novoPrompt },
        behavior_config: {
          ...behavior,
          treino: { ...treino, regras, atualizadoEm: agora },
          historicoPrompt: [{ em: agora, origem: 'treino', campo, texto: promptAtual }, ...historico].slice(0, MAX_HISTORICO),
        },
        updated_at: agora,
      })
      .eq('id', agente.id)
      .eq('organization_id', agente.organization_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 3. Indexa as fontes novas (embeddings), 4 de cada vez.
  let falhas = 0
  for (let i = 0; i < idsFontes.length; i += 4) {
    const lote = await Promise.allSettled(idsFontes.slice(i, i + 4).map((id) => processarFonteConhecimento(id)))
    falhas += lote.filter((x) => x.status === 'rejected').length
  }

  return NextResponse.json({
    ok: true,
    fontesCriadas: idsFontes.length,
    regrasNoPrompt: novasRegras.length,
    falhasIndexacao: falhas,
    regras,
  })
}
