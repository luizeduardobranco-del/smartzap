/**
 * Consolida conversas ABERTAS duplicadas (contact_id + channel_id).
 *
 * Contexto: até 22/08/2026 os webhooks buscavam a conversa aberta com
 * `.eq('status','open').maybeSingle()`. O PostgREST devolve PGRST116/406 quando
 * casa mais de uma linha, o erro era descartado, e o código criava OUTRA conversa
 * aberta — a cada mensagem. Resultado: 1 conversa por mensagem, IA sem histórico
 * (o histórico é lido por conversation_id) e o painel "aguardando atendimento"
 * contando conversas em vez de contatos.
 *
 * O que faz, por grupo (contact_id, channel_id) com MAIS DE UMA conversa aberta:
 *   canônica = a conversa aberta com maior last_message_at
 *   1. messages.conversation_id      → canônica
 *   2. automation_runs.conversation_id → canônica  (FK sem ON DELETE CASCADE)
 *   3. confere que as duplicadas ficaram com 0 mensagens
 *   4. DELETE das duplicadas          (messages tem ON DELETE CASCADE — por isso o passo 3)
 *
 * Conversas com status 'resolved' NÃO são tocadas: podem ser encerramentos
 * deliberados do operador.
 *
 * Uso:
 *   node scripts/consolidate-duplicate-conversations.mjs            # dry-run
 *   node scripts/consolidate-duplicate-conversations.mjs --apply    # executa
 */

import fs from 'node:fs'
import path from 'node:path'

const APPLY = process.argv.includes('--apply')

// ── Credenciais ───────────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), 'apps/web/.env.local')
const env = Object.fromEntries(
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    })
)

const BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!BASE || !KEY) throw new Error('faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function rest(pathAndQuery, init = {}) {
  const res = await fetch(`${BASE}/${pathAndQuery}`, { ...init, headers: { ...headers, ...init.headers } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${pathAndQuery} → ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

/** Pagina o GET porque o PostgREST corta em 1000 linhas por request. */
async function getAll(pathAndQuery) {
  const out = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${BASE}/${pathAndQuery}`, {
      headers: { ...headers, Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' },
    })
    if (!res.ok) throw new Error(`GET ${pathAndQuery} → ${res.status} ${await res.text()}`)
    const rows = await res.json()
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

async function main() {
// ── 1. Levanta as conversas abertas e agrupa ──────────────────────────────────
console.log(APPLY ? '=== MODO APPLY (escreve no banco) ===' : '=== DRY-RUN (nada é escrito) ===\n')

const open = await getAll(
  'conversations?select=id,contact_id,channel_id,organization_id,mode,last_message_at,created_at&status=eq.open'
)
console.log(`conversas abertas no total: ${open.length}`)

const groups = new Map()
for (const c of open) {
  if (!c.contact_id || !c.channel_id) continue
  const key = `${c.contact_id}|${c.channel_id}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(c)
}

const dupGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1)
console.log(`pares contato+canal com conversa aberta: ${groups.size}`)
console.log(`pares COM duplicação: ${dupGroups.length}`)

if (dupGroups.length === 0) {
  console.log('\nNada a consolidar.')
  return
}

// canônica = maior last_message_at (empate → maior created_at)
const plan = []
for (const [key, rows] of dupGroups) {
  const sorted = rows.slice().sort((a, b) => {
    const at = a.last_message_at ?? a.created_at ?? ''
    const bt = b.last_message_at ?? b.created_at ?? ''
    if (at !== bt) return at < bt ? 1 : -1
    return (a.created_at ?? '') < (b.created_at ?? '') ? 1 : -1
  })
  const [canonical, ...dups] = sorted
  plan.push({ key, canonical, dupIds: dups.map((d) => d.id) })
}

const totalDups = plan.reduce((n, p) => n + p.dupIds.length, 0)
console.log(`conversas duplicadas a remover: ${totalDups}\n`)

for (const p of plan.slice().sort((a, b) => b.dupIds.length - a.dupIds.length).slice(0, 10)) {
  const [contactId] = p.key.split('|')
  console.log(`  contato ${contactId}: mantém ${p.canonical.id} (mode=${p.canonical.mode}), remove ${p.dupIds.length}`)
}
if (plan.length > 10) console.log(`  … e mais ${plan.length - 10} pares`)

if (!APPLY) {
  console.log('\nDry-run concluído. Rode com --apply para executar.')
  return
}

// ── 2. Backup antes de escrever ───────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupDir = path.join(process.cwd(), 'scripts', 'backups')
fs.mkdirSync(backupDir, { recursive: true })
const backupFile = path.join(backupDir, `conversations-consolidate-${stamp}.json`)

const allDupIds = plan.flatMap((p) => p.dupIds)
const backupRows = []
for (let i = 0; i < allDupIds.length; i += 100) {
  const chunk = allDupIds.slice(i, i + 100)
  backupRows.push(...(await getAll(`conversations?select=*&id=in.(${chunk.join(',')})`)))
}
fs.writeFileSync(backupFile, JSON.stringify({ plan, conversations: backupRows }, null, 2))
console.log(`\nbackup das ${backupRows.length} conversas → ${path.relative(process.cwd(), backupFile)}`)

// ── 3. Reaponta mensagens e automation_runs, depois apaga ─────────────────────
let movedMsgs = 0
let movedRuns = 0
let deleted = 0

for (const [idx, p] of plan.entries()) {
  const list = p.dupIds.join(',')

  for (let i = 0; i < p.dupIds.length; i += 100) {
    const chunk = p.dupIds.slice(i, i + 100).join(',')

    const msgs = await rest(`messages?conversation_id=in.(${chunk})&select=id`, {
      method: 'PATCH',
      body: JSON.stringify({ conversation_id: p.canonical.id }),
      headers: { Prefer: 'return=representation' },
    })
    movedMsgs += msgs?.length ?? 0

    const runs = await rest(`automation_runs?conversation_id=in.(${chunk})&select=id`, {
      method: 'PATCH',
      body: JSON.stringify({ conversation_id: p.canonical.id }),
      headers: { Prefer: 'return=representation' },
    })
    movedRuns += runs?.length ?? 0
  }

  // Trava de segurança: messages tem ON DELETE CASCADE. Só apaga se ficou vazia.
  const leftovers = await getAll(`messages?select=id&conversation_id=in.(${list})&limit=1`)
  if (leftovers.length > 0) {
    throw new Error(`ABORTADO: ${p.key} ainda tem mensagens nas duplicadas — não vou apagar`)
  }

  for (let i = 0; i < p.dupIds.length; i += 100) {
    const chunk = p.dupIds.slice(i, i + 100).join(',')
    const del = await rest(`conversations?id=in.(${chunk})&select=id`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    })
    deleted += del?.length ?? 0
  }

  if ((idx + 1) % 5 === 0 || idx === plan.length - 1) {
    console.log(`  progresso: ${idx + 1}/${plan.length} pares`)
  }
}

console.log(`\nmensagens reapontadas : ${movedMsgs}`)
console.log(`automation_runs movidos: ${movedRuns}`)
console.log(`conversas removidas    : ${deleted}`)

// ── 4. Verificação final ──────────────────────────────────────────────────────
const after = await getAll('conversations?select=contact_id,channel_id&status=eq.open')
const seen = new Set()
let remaining = 0
for (const c of after) {
  const key = `${c.contact_id}|${c.channel_id}`
  if (seen.has(key)) remaining++
  seen.add(key)
}
console.log(`\nconversas abertas agora: ${after.length}`)
console.log(`duplicações restantes  : ${remaining}`)
console.log(remaining === 0 ? '\nOK — pronto para criar o índice único.' : '\nAINDA HÁ DUPLICAÇÃO — não crie o índice.')
}

await main()
