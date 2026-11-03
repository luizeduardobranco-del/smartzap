'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Sparkles, Upload, ClipboardPaste, MessagesSquare, Loader2, Trash2, ShieldCheck, ChevronDown,
  ChevronRight, CheckCircle2, AlertTriangle, HelpCircle, X, User,
} from 'lucide-react'
import { unzipSync, strFromU8 } from 'fflate'
import { trpc } from '@/lib/trpc/client'
import { lerConversaWhatsApp, type MensagemExportada } from '@/lib/treino/exportacao-whatsapp'
import type { ItemAprendido, RegraAprendida, TipoItem } from '@/lib/treino/treino-agente'

// "Melhorar meu agente" — treino com conversas reais. As conversas ficam só no navegador
// até a análise; o servidor anonimiza, a IA extrai e o cliente aprova item a item.

type ConversaLocal = {
  id: string
  titulo: string
  origem: 'colada' | 'arquivo'
  mensagens?: MensagemExportada[]
  textoLivre?: string
}

type ConversaPainel = { id: string; nome: string; ultimaMensagem: string | null; mensagens: number; atendidaPorPessoa: boolean }

type ItemEditavel = ItemAprendido & { aprovado: boolean }

const ROTULO_TIPO: Record<TipoItem, { titulo: string; desc: string }> = {
  fato: { titulo: 'Informações da empresa', desc: 'Preços, prazos, regras e condições. Vão para a base de conhecimento.' },
  faq: { titulo: 'Perguntas frequentes', desc: 'Como a empresa responde. Vão para a base de conhecimento.' },
  objecao: { titulo: 'Objeções e como contornar', desc: 'Vão para a base de conhecimento.' },
  estilo: { titulo: 'Jeito de falar', desc: 'Entram nas instruções do agente.' },
  transferencia: { titulo: 'Quando passar para uma pessoa', desc: 'Entram nas instruções do agente.' },
  exemplo: { titulo: 'Exemplos de bons atendimentos', desc: 'O agente usa como modelo.' },
  lacuna: { titulo: 'Perguntas que ficaram sem resposta', desc: 'Escreva a resposta certa para o agente aprender.' },
}
const ORDEM_TIPOS: TipoItem[] = ['fato', 'faq', 'objecao', 'lacuna', 'transferencia', 'estilo', 'exemplo']

const ROTULO_REGRA: Record<RegraAprendida['tipo'], string> = {
  atualizacao: 'Informação atualizada',
  estilo: 'Jeito de falar',
  transferencia: 'Passar para pessoa',
  exemplo: 'Exemplo',
}

function novoId() {
  return Math.random().toString(36).slice(2, 10)
}

export function MelhorarAgente({ agentId }: { agentId: string }) {
  const utils = trpc.useUtils()
  const [conversas, setConversas] = useState<ConversaLocal[]>([])
  const [empresa, setEmpresa] = useState<Set<string>>(new Set())
  const [selecionadasPainel, setSelecionadasPainel] = useState<Set<string>>(new Set())
  const [painel, setPainel] = useState<ConversaPainel[]>([])
  const [regras, setRegras] = useState<RegraAprendida[]>([])
  const [fonte, setFonte] = useState<'colar' | 'arquivo' | 'painel'>('colar')
  const [textoColado, setTextoColado] = useState('')
  const [mostrarGuia, setMostrarGuia] = useState(false)
  const [analisando, setAnalisando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [itens, setItens] = useState<ItemEditavel[] | null>(null)
  const [mostrarConfirmados, setMostrarConfirmados] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const arquivoRef = useRef<HTMLInputElement>(null)

  async function carregar() {
    try {
      const res = await fetch(`/api/agents/${agentId}/treino`)
      const data = await res.json()
      if (res.ok) {
        setPainel(data.conversas ?? [])
        setRegras(data.regras ?? [])
      }
    } catch {}
  }
  useEffect(() => { carregar() }, [agentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autores de todas as conversas lidas; quem aparece em mais conversas provavelmente é da empresa.
  const autores = useMemo(() => {
    const m = new Map<string, { nome: string; conversas: number; mensagens: number }>()
    for (const c of conversas) {
      const vistos = new Set<string>()
      for (const msg of c.mensagens ?? []) {
        const a = m.get(msg.autor) ?? { nome: msg.autor, conversas: 0, mensagens: 0 }
        a.mensagens++
        if (!vistos.has(msg.autor)) { a.conversas++; vistos.add(msg.autor) }
        m.set(msg.autor, a)
      }
    }
    return [...m.values()].sort((a, b) => b.conversas - a.conversas || b.mensagens - a.mensagens)
  }, [conversas])

  function adicionarConversa(texto: string, titulo: string, origem: ConversaLocal['origem']) {
    const { mensagens, autores: aut } = lerConversaWhatsApp(texto)
    const conversa: ConversaLocal = mensagens.length >= 2 && aut.length >= 2
      ? { id: novoId(), titulo, origem, mensagens }
      : { id: novoId(), titulo, origem, textoLivre: texto.trim() }
    setConversas((cs) => {
      const lista = [...cs, conversa]
      // Palpite inicial: o autor presente em mais conversas é da empresa.
      if (empresa.size === 0 && conversa.mensagens) {
        const cont = new Map<string, number>()
        for (const c of lista) for (const a of new Set((c.mensagens ?? []).map((x) => x.autor))) cont.set(a, (cont.get(a) ?? 0) + 1)
        const top = [...cont.entries()].sort((a, b) => b[1] - a[1])
        if (lista.filter((c) => c.mensagens).length >= 2 && top[0] && top[0][1] >= 2) setEmpresa(new Set([top[0][0]]))
      }
      return lista
    })
  }

  function colar() {
    if (textoColado.trim().length < 30) { setErro('Cole uma conversa com pelo menos algumas mensagens.'); return }
    adicionarConversa(textoColado, `Conversa colada ${conversas.filter((c) => c.origem === 'colada').length + 1}`, 'colada')
    setTextoColado('')
    setErro('')
  }

  async function lerArquivos(files: FileList | null) {
    if (!files?.length) return
    setErro('')
    for (const f of Array.from(files)) {
      try {
        if (/\.zip$/i.test(f.name)) {
          const zip = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (x) => /\.txt$/i.test(x.name) })
          const txts = Object.entries(zip)
          if (!txts.length) { setErro(`O arquivo ${f.name} não tem conversa em texto (.txt).`); continue }
          for (const [nome, dados] of txts) adicionarConversa(strFromU8(dados), tituloArquivo(nome === '_chat.txt' ? f.name : nome), 'arquivo')
        } else if (/\.txt$/i.test(f.name)) {
          adicionarConversa(await f.text(), tituloArquivo(f.name), 'arquivo')
        } else {
          setErro(`Formato não aceito: ${f.name}. Use o .txt ou .zip exportado do WhatsApp.`)
        }
      } catch {
        setErro(`Não foi possível ler ${f.name}.`)
      }
    }
    if (arquivoRef.current) arquivoRef.current.value = ''
  }

  const totalSelecionado = conversas.length + selecionadasPainel.size
  const precisaEscolherEmpresa = conversas.some((c) => c.mensagens) && empresa.size === 0

  async function analisar() {
    setErro(''); setAviso(''); setItens(null)
    if (!totalSelecionado) { setErro('Adicione pelo menos uma conversa.'); return }
    if (precisaEscolherEmpresa) { setErro('Marque quem é da sua empresa nas conversas.'); return }
    setAnalisando(true)
    try {
      const res = await fetch(`/api/agents/${agentId}/treino/analisar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationIds: [...selecionadasPainel],
          conversas: conversas.map((c) => c.mensagens
            ? { titulo: c.titulo, mensagens: c.mensagens.map((m) => ({ lado: empresa.has(m.autor) ? 'empresa' : 'cliente', autor: m.autor, texto: m.texto })) }
            : { titulo: c.titulo, textoLivre: c.textoLivre }),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao analisar')
      const lista: ItemEditavel[] = (data.itens as ItemAprendido[]).map((it) => ({
        ...it,
        aprovado: it.situacao !== 'confirma' && it.tipo !== 'lacuna',
      }))
      setItens(lista)
      if (!lista.length) setAviso('A IA não encontrou nada novo nessas conversas. Tente conversas com mais perguntas de clientes.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao analisar')
    } finally {
      setAnalisando(false)
    }
  }

  function editar(id: string, campos: Partial<ItemEditavel>) {
    setItens((xs) => xs?.map((x) => {
      if (x.id !== id) return x
      const novo = { ...x, ...campos }
      // Lacuna só entra quando o cliente escreve a resposta.
      if (novo.tipo === 'lacuna' && 'resposta' in campos) novo.aprovado = !!novo.resposta?.trim()
      return novo
    }) ?? null)
  }

  const aprovados = (itens ?? []).filter((x) => x.aprovado && (x.tipo !== 'lacuna' || x.resposta?.trim()))

  async function aplicar() {
    if (!aprovados.length) return
    setAplicando(true); setErro('')
    try {
      const res = await fetch(`/api/agents/${agentId}/treino/aplicar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: aprovados.map(({ aprovado: _a, ...it }) => it) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao aplicar')
      setRegras(data.regras ?? [])
      setItens(null)
      setConversas([])
      setSelecionadasPainel(new Set())
      setEmpresa(new Set())
      setAviso(
        `Pronto! ${aprovados.length} ${aprovados.length === 1 ? 'item ensinado' : 'itens ensinados'} ao agente` +
        (data.fontesCriadas ? ` · ${data.fontesCriadas} na base de conhecimento` : '') +
        (data.regrasNoPrompt ? ` · ${data.regrasNoPrompt} nas instruções` : '') +
        (data.falhasIndexacao ? ` · ${data.falhasIndexacao} ainda processando na aba Conhecimento` : '') + '.',
      )
      utils.agents.get.invalidate({ id: agentId })
      utils.knowledge.list.invalidate({ agentId })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao aplicar')
    } finally {
      setAplicando(false)
    }
  }

  async function removerRegra(id: string) {
    const res = await fetch(`/api/agents/${agentId}/treino?regra=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setRegras(data.regras ?? [])
      utils.agents.get.invalidate({ id: agentId })
    }
  }

  const botaoFonte = (id: typeof fonte, label: string, Icon: typeof Upload) => (
    <button
      type="button"
      onClick={() => setFonte(id)}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${fonte === id ? 'bg-primary text-white' : 'border hover:bg-muted'}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  )

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-semibold">Treinar com conversas reais</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Mostre ao agente como sua empresa realmente atende. Envie de 5 a 20 conversas variadas: vendas fechadas,
          clientes que desistiram, dúvidas comuns e reclamações bem resolvidas. A IA aprende preços, respostas,
          jeito de falar e quando chamar alguém da equipe, e você aprova cada item antes de o agente mudar.
        </p>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
          Nomes, telefones, CPF, e-mails e endereços são trocados por marcadores antes da análise. As conversas não ficam guardadas, só o que você aprovar.
        </p>
      </div>

      {/* Fontes */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {botaoFonte('colar', 'Colar conversa', ClipboardPaste)}
          {botaoFonte('arquivo', 'Enviar arquivo do WhatsApp', Upload)}
          {botaoFonte('painel', 'Conversas do WHITE ZAP', MessagesSquare)}
        </div>

        <button type="button" onClick={() => setMostrarGuia((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <HelpCircle className="h-3.5 w-3.5" /> Como tirar uma conversa do WhatsApp
          {mostrarGuia ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        {mostrarGuia && (
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-xs sm:grid-cols-3">
            <div>
              <p className="mb-1 font-semibold">Android</p>
              <ol className="list-decimal space-y-0.5 pl-4 text-muted-foreground">
                <li>Abra a conversa</li>
                <li>Toque nos 3 pontinhos › Mais › Exportar conversa</li>
                <li>Escolha <strong>Sem mídia</strong></li>
                <li>Salve ou mande para você e envie o arquivo aqui</li>
              </ol>
            </div>
            <div>
              <p className="mb-1 font-semibold">iPhone</p>
              <ol className="list-decimal space-y-0.5 pl-4 text-muted-foreground">
                <li>Abra a conversa e toque no nome do contato</li>
                <li>Role até Exportar conversa</li>
                <li>Escolha <strong>Sem mídia</strong></li>
                <li>Salve em Arquivos e envie o .zip aqui</li>
              </ol>
            </div>
            <div>
              <p className="mb-1 font-semibold">WhatsApp Web / computador</p>
              <ol className="list-decimal space-y-0.5 pl-4 text-muted-foreground">
                <li>Abra a conversa</li>
                <li>Selecione as mensagens com o mouse e copie (Ctrl+C)</li>
                <li>Cole em <strong>Colar conversa</strong></li>
              </ol>
            </div>
          </div>
        )}

        {fonte === 'colar' && (
          <div className="space-y-2">
            <textarea
              value={textoColado}
              onChange={(e) => setTextoColado(e.target.value)}
              rows={7}
              placeholder={'[09:12, 02/11/2026] Cliente: Boa tarde! Quanto fica a van do Méier até o colégio?\n[09:15, 02/11/2026] Você: Boa tarde! Para o Méier, no turno da tarde, fica R$ 699 por mês...'}
              className="w-full resize-y rounded-lg border px-3 py-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button type="button" onClick={colar} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">
              Adicionar esta conversa
            </button>
          </div>
        )}

        {fonte === 'arquivo' && (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center hover:bg-muted/30">
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium">Escolha um ou mais arquivos .txt ou .zip</span>
            <span className="text-xs text-muted-foreground">O arquivo de &quot;Exportar conversa&quot; do WhatsApp</span>
            <input ref={arquivoRef} type="file" accept=".txt,.zip,text/plain,application/zip" multiple className="hidden" onChange={(e) => lerArquivos(e.target.files)} />
          </label>
        )}

        {fonte === 'painel' && (
          <div className="max-h-72 overflow-y-auto rounded-lg border">
            {painel.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa deste agente ainda.</p>
            ) : painel.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/30">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={selecionadasPainel.has(c.id)}
                  onChange={(e) => setSelecionadasPainel((s) => {
                    const n = new Set(s)
                    if (e.target.checked) { if (n.size < 30) n.add(c.id) } else n.delete(c.id)
                    return n
                  })}
                />
                <span className="flex-1 truncate text-sm">{c.nome}</span>
                {c.atendidaPorPessoa && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">atendida por pessoa</span>}
                <span className="text-xs text-muted-foreground">{c.mensagens} msgs</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Conversas adicionadas e quem é da empresa */}
      {(conversas.length > 0 || selecionadasPainel.size > 0) && (
        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm font-semibold">Conversas para analisar ({totalSelecionado})</p>
          <div className="flex flex-wrap gap-2">
            {conversas.map((c) => (
              <span key={c.id} className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs">
                {c.titulo} · {c.mensagens ? `${c.mensagens.length} msgs` : 'texto livre'}
                <button type="button" onClick={() => setConversas((cs) => cs.filter((x) => x.id !== c.id))} aria-label="Remover">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {selecionadasPainel.size > 0 && (
              <span className="rounded-full bg-muted px-3 py-1 text-xs">{selecionadasPainel.size} do WHITE ZAP</span>
            )}
          </div>

          {autores.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-medium">Quem é da sua empresa nessas conversas?</p>
              <div className="flex flex-wrap gap-2">
                {autores.slice(0, 30).map((a) => (
                  <label key={a.nome} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${empresa.has(a.nome) ? 'border-primary bg-primary/10 text-primary' : ''}`}>
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-primary"
                      checked={empresa.has(a.nome)}
                      onChange={(e) => setEmpresa((s) => { const n = new Set(s); if (e.target.checked) n.add(a.nome); else n.delete(a.nome); return n })}
                    />
                    <User className="h-3 w-3" /> {a.nome}
                    <span className="text-muted-foreground">({a.conversas} conv.)</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={analisar}
            disabled={analisando || !totalSelecionado}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {analisando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analisando ? 'Analisando… pode levar até 1 minuto' : 'Analisar conversas'}
          </button>
        </div>
      )}

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}
      {aviso && <p className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" />{aviso}</p>}

      {/* Resultado para aprovar */}
      {itens && itens.length > 0 && (
        <div className="space-y-5">
          <div>
            <h3 className="font-semibold">O que a IA aprendeu</h3>
            <p className="text-sm text-muted-foreground">Desmarque o que estiver errado e ajuste o texto se precisar. Nada muda no agente até você aplicar.</p>
          </div>

          {ORDEM_TIPOS.map((tipo) => {
            const doTipo = itens.filter((x) => x.tipo === tipo && x.situacao !== 'confirma')
            if (!doTipo.length) return null
            return (
              <div key={tipo} className="space-y-2">
                <div>
                  <p className="text-sm font-semibold">{ROTULO_TIPO[tipo].titulo} ({doTipo.length})</p>
                  <p className="text-xs text-muted-foreground">{ROTULO_TIPO[tipo].desc}</p>
                </div>
                {doTipo.map((it) => <CartaoItem key={it.id} item={it} onChange={(c) => editar(it.id, c)} />)}
              </div>
            )
          })}

          {itens.some((x) => x.situacao === 'confirma') && (
            <div>
              <button type="button" onClick={() => setMostrarConfirmados((v) => !v)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                {mostrarConfirmados ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                O agente já sabia ({itens.filter((x) => x.situacao === 'confirma').length})
              </button>
              {mostrarConfirmados && (
                <ul className="mt-2 space-y-1 pl-5 text-xs text-muted-foreground">
                  {itens.filter((x) => x.situacao === 'confirma').map((x) => <li key={x.id} className="list-disc">{x.texto ?? x.pergunta}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-xl border bg-white p-3 shadow-sm">
            <span className="text-sm">{aprovados.length} {aprovados.length === 1 ? 'item aprovado' : 'itens aprovados'}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setItens(null)} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">Descartar</button>
              <button
                type="button"
                onClick={aplicar}
                disabled={aplicando || !aprovados.length}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {aplicando && <Loader2 className="h-4 w-4 animate-spin" />} Ensinar ao agente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* O que já foi aprendido */}
      {regras.length > 0 && (
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-semibold">Regras aprendidas nas instruções do agente ({regras.length})</h3>
            <p className="text-xs text-muted-foreground">Perguntas e informações aprendidas ficam na aba Conhecimento, onde também podem ser apagadas.</p>
          </div>
          <div className="divide-y rounded-lg border">
            {regras.map((r) => (
              <div key={r.id} className="flex items-start gap-3 px-3 py-2">
                <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">{ROTULO_REGRA[r.tipo]}</span>
                <p className="flex-1 whitespace-pre-wrap text-sm">{r.texto}</p>
                <button type="button" onClick={() => removerRegra(r.id)} className="text-muted-foreground hover:text-red-600" title="Remover regra" aria-label="Remover regra">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function tituloArquivo(nome: string) {
  return nome.replace(/\.(txt|zip)$/i, '').replace(/^Conversa do WhatsApp com /i, '').replace(/^WhatsApp Chat - /i, '').slice(0, 40) || 'Arquivo'
}

function CartaoItem({ item, onChange }: { item: ItemEditavel; onChange: (c: Partial<ItemEditavel>) => void }) {
  const campo = 'w-full resize-y rounded-md border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30'
  const temPergunta = item.tipo === 'faq' || item.tipo === 'objecao' || item.tipo === 'lacuna'
  return (
    <div className={`rounded-lg border p-3 ${item.aprovado ? 'border-primary/40 bg-white' : 'bg-muted/20 opacity-80'}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 accent-primary"
          checked={item.aprovado}
          disabled={item.tipo === 'lacuna' && !item.resposta?.trim()}
          onChange={(e) => onChange({ aprovado: e.target.checked })}
        />
        <div className="flex-1 space-y-1.5">
          {item.situacao === 'contradiz' && (
            <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Diferente do que o agente sabe hoje{item.conflito ? `: ${item.conflito}` : ''}. Se aprovar, esta informação passa a valer.</span>
            </p>
          )}
          {temPergunta ? (
            <>
              <textarea rows={1} value={item.pergunta ?? ''} onChange={(e) => onChange({ pergunta: e.target.value })} className={`${campo} font-medium`} />
              <textarea
                rows={2}
                value={item.resposta ?? ''}
                placeholder={item.tipo === 'lacuna' ? 'Escreva aqui a resposta certa…' : ''}
                onChange={(e) => onChange({ resposta: e.target.value })}
                className={campo}
              />
            </>
          ) : (
            <textarea rows={item.tipo === 'exemplo' ? 6 : 2} value={item.texto ?? ''} onChange={(e) => onChange({ texto: e.target.value })} className={`${campo} ${item.tipo === 'exemplo' ? 'font-mono text-xs' : ''}`} />
          )}
          {item.evidencia && <p className="text-xs italic text-muted-foreground">Na conversa: &ldquo;{item.evidencia}&rdquo;</p>}
        </div>
      </div>
    </div>
  )
}
