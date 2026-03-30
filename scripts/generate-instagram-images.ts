/**
 * Script — Geração de Imagens para Instagram (Luna IA)
 *
 * Gera imagens para posts do Instagram usando DALL-E 3 (OpenAI).
 * As imagens são salvas em: assets/instagram/
 *
 * Uso:
 *   OPENAI_API_KEY="sk-..." npx tsx scripts/generate-instagram-images.ts
 *
 * Ou adicione OPENAI_API_KEY no arquivo apps/worker/.env.local e rode:
 *   npx tsx scripts/generate-instagram-images.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import OpenAI from 'openai'

// Carrega variáveis de ambiente
config({ path: resolve(process.cwd(), 'apps/worker/.env.local') })
config({ path: resolve(process.cwd(), '.env.local') })

// ─── Definição dos posts ──────────────────────────────────────────────────────

interface InstagramPost {
  id: string
  product: 'zapagent' | 'whiteerp'
  format: 'feed' | 'stories' | 'reels'
  size: '1024x1024' | '1024x1792' | '1792x1024'
  objective: string
  prompt: string
}

const INSTAGRAM_POSTS: InstagramPost[] = [
  // ── ZapAgent ────────────────────────────────────────────────────────────────
  {
    id: 'zapagent-hero-feed',
    product: 'zapagent',
    format: 'feed',
    size: '1024x1024',
    objective: 'Awareness — Hero da plataforma',
    prompt: `A futuristic AI robot assistant communicating via smartphone with WhatsApp-style green chat bubbles floating around it.
Dark navy blue background. Glowing green accent lights. Purple neon highlights.
Clean tech aesthetic, isometric 3D illustration style.
Professional product marketing visual. No text. High contrast. Ultra sharp quality.`,
  },
  {
    id: 'zapagent-automation-feed',
    product: 'zapagent',
    format: 'feed',
    size: '1024x1024',
    objective: 'Funcionalidade — Automação de atendimento',
    prompt: `A visual representation of automated business communication: multiple smartphone screens arranged in a grid,
each showing different AI chat conversations in Portuguese.
Dark tech background with glowing purple and green gradient accents.
Connected by flowing digital lines suggesting automation and workflow.
Flat design with depth, modern SaaS product illustration. No text. Clean and professional.`,
  },
  {
    id: 'zapagent-growth-feed',
    product: 'zapagent',
    format: 'feed',
    size: '1024x1024',
    objective: 'Growth — Resultados e crescimento',
    prompt: `Abstract data visualization showing business growth: upward trending graphs made of glowing green particles,
connected nodes suggesting AI network, dark navy background with purple gradient.
Digital rain effect with chat message icons. Futuristic and confident aesthetic.
No text. High quality 3D render style.`,
  },
  {
    id: 'zapagent-stories',
    product: 'zapagent',
    format: 'stories',
    size: '1024x1792',
    objective: 'Stories — Apresentação da plataforma',
    prompt: `Vertical mobile-first design: a sleek smartphone floating in dark space showing an AI chat interface.
Multiple green WhatsApp-style message bubbles flowing upward like a waterfall.
Purple and green neon glow effects. Stars and particles in background.
Cinematic lighting from below. Ultra detailed. No text on the image itself.`,
  },

  // ── White ERP ───────────────────────────────────────────────────────────────
  {
    id: 'whiteerp-restaurant-feed',
    product: 'whiteerp',
    format: 'feed',
    size: '1024x1024',
    objective: 'Awareness — Restaurante com tecnologia',
    prompt: `A modern Brazilian restaurant kitchen with a smiling chef holding a tablet showing a clean digital order management dashboard.
Bright white and green color palette. Natural warm lighting.
Professional food photography style. Clean and organized environment.
Sense of efficiency and technology. No text visible on screens.`,
  },
  {
    id: 'whiteerp-delivery-feed',
    product: 'whiteerp',
    format: 'feed',
    size: '1024x1024',
    objective: 'Funcionalidade — Delivery e pedidos',
    prompt: `Overhead flat lay of food delivery items: smartphone showing a clean delivery app interface in green and white,
food containers, delivery bag, and a tablet with order management screen.
Minimal white background. Fresh and appetizing food items around the devices.
Clean product photography style. Professional lighting. Brazilian food context.`,
  },
  {
    id: 'whiteerp-dashboard-feed',
    product: 'whiteerp',
    format: 'feed',
    size: '1024x1024',
    objective: 'Funcionalidade — Dashboard financeiro',
    prompt: `A clean modern laptop screen showing a business financial dashboard with green charts and graphs,
placed on a minimalist white desk in a restaurant office.
Cup of coffee beside it. Bright natural window light.
Professional and trustworthy atmosphere. Green (#22C55E) and white color scheme.
No visible text in the charts.`,
  },
  {
    id: 'whiteerp-stories',
    product: 'whiteerp',
    format: 'stories',
    size: '1024x1792',
    objective: 'Stories — Solução para restaurantes',
    prompt: `Vertical composition: split screen showing before and after of restaurant management.
Top half: chaotic paper orders, stressed staff, messy environment in muted colors.
Bottom half: same restaurant transformed — clean, organized, smiling staff with tablets,
bright green and white modern aesthetic.
Dramatic lighting contrast between the two halves. No text.`,
  },
]

// ─── Funções auxiliares ───────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Falha ao baixar imagem: ${response.statusText}`)
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    console.error('\n❌ OPENAI_API_KEY não encontrada.')
    console.error('   Adicione em apps/worker/.env.local:')
    console.error('   OPENAI_API_KEY=sk-...\n')
    process.exit(1)
  }

  const client = new OpenAI({ apiKey })

  const outputDir = resolve(process.cwd(), 'assets/instagram')
  ensureDir(outputDir)
  ensureDir(`${outputDir}/zapagent`)
  ensureDir(`${outputDir}/whiteerp`)

  console.log('\n🎨 Luna — Geração de Imagens Instagram')
  console.log('━'.repeat(50))
  console.log(`📁 Saída: assets/instagram/`)
  console.log(`🖼️  Total de imagens: ${INSTAGRAM_POSTS.length}`)
  console.log(`🤖 Modelo: DALL-E 3\n`)

  const results: Array<{ id: string; status: 'ok' | 'error'; path?: string; error?: string }> = []

  for (const post of INSTAGRAM_POSTS) {
    const formatLabel = { feed: '📷 Feed 1:1', stories: '📱 Stories 9:16', reels: '🎬 Reels' }[post.format]
    console.log(`⏳ Gerando: [${post.product.toUpperCase()}] ${post.objective}`)
    console.log(`   ${formatLabel} | ${post.size}`)

    try {
      const response = await client.images.generate({
        model: 'dall-e-3',
        prompt: post.prompt,
        size: post.size,
        quality: 'hd',
        n: 1,
      })

      const imageUrl = response.data[0]?.url
      if (!imageUrl) throw new Error('URL da imagem não retornada pela API')

      const imageBuffer = await downloadImage(imageUrl)
      const filePath = `${outputDir}/${post.product}/${post.id}.png`
      writeFileSync(filePath, imageBuffer)

      console.log(`   ✅ Salvo: assets/instagram/${post.product}/${post.id}.png\n`)
      results.push({ id: post.id, status: 'ok', path: filePath })

      // Pausa entre requests para evitar rate limit
      if (INSTAGRAM_POSTS.indexOf(post) < INSTAGRAM_POSTS.length - 1) {
        await new Promise((r) => setTimeout(r, 2000))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`   ❌ Erro: ${message}\n`)
      results.push({ id: post.id, status: 'error', error: message })
    }
  }

  // ─── Resumo ─────────────────────────────────────────────────────────────────

  const ok = results.filter((r) => r.status === 'ok')
  const errors = results.filter((r) => r.status === 'error')

  console.log('━'.repeat(50))
  console.log('📊 RESUMO')
  console.log('━'.repeat(50))
  console.log(`✅ Geradas:  ${ok.length}/${INSTAGRAM_POSTS.length}`)
  console.log(`❌ Erros:    ${errors.length}`)

  if (ok.length > 0) {
    console.log('\n📁 Imagens salvas em:')
    console.log('   assets/instagram/zapagent/  — ZapAgent (4 imagens)')
    console.log('   assets/instagram/whiteerp/  — White ERP (4 imagens)')
  }

  if (errors.length > 0) {
    console.log('\n⚠️  Erros:')
    errors.forEach((e) => console.log(`   - ${e.id}: ${e.error}`))
  }

  console.log('\n💡 Próximos passos:')
  console.log('   1. Revise as imagens geradas na pasta assets/instagram/')
  console.log('   2. Peça ao Leo para criar as captions de cada post')
  console.log('   3. Peça à Ana para definir os melhores horários de publicação')
  console.log('   4. Agende os posts com o Max no calendário editorial\n')

  process.exit(errors.length === INSTAGRAM_POSTS.length ? 1 : 0)
}

main().catch((err) => {
  console.error('❌ Erro fatal:', err)
  process.exit(1)
})
