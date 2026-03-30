/**
 * Seed Script — Equipe Digital de Marketing
 *
 * Cria os 5 agentes da equipe de marketing no banco de dados.
 *
 * Uso:
 *   DATABASE_URL="postgresql://..." ORGANIZATION_ID="<uuid>" npx tsx scripts/seed-marketing-team.ts
 *
 * Opcionalmente, crie um arquivo .env.seed na raiz com:
 *   DATABASE_URL=postgresql://...
 *   ORGANIZATION_ID=<uuid-da-sua-organizacao>
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { createDb } from '../packages/database/src'
import { agents } from '../packages/database/src/schema/agents'
import { MARKETING_TEAM, MARKETING_TEAM_SUMMARY } from '../packages/shared/src/constants/marketing-team'

// Carrega .env.seed se existir
config({ path: resolve(process.cwd(), '.env.seed') })
config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  const organizationId = process.env.ORGANIZATION_ID

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL não definida.')
    console.error('   Defina em .env.seed ou como variável de ambiente.')
    process.exit(1)
  }

  if (!organizationId) {
    console.error('❌ ORGANIZATION_ID não definida.')
    console.error('   Informe o UUID da organização que receberá os agentes.')
    console.error('   Ex: ORGANIZATION_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"')
    process.exit(1)
  }

  console.log('\n🚀 Iniciando seed da Equipe Digital de Marketing...')
  console.log(`📦 Organização: ${organizationId}`)
  console.log(`👥 Agentes a criar: ${MARKETING_TEAM.length}\n`)

  const db = createDb(databaseUrl)

  const results: Array<{ name: string; id: string; status: 'created' | 'skipped' | 'error'; error?: string }> = []

  for (const agentConfig of MARKETING_TEAM) {
    try {
      // Verifica se já existe um agente com esse slug na organização
      const existing = await db.query.agents.findFirst({
        where: (table, { and, eq }) =>
          and(eq(table.organizationId, organizationId), eq(table.slug, agentConfig.slug)),
      })

      if (existing) {
        console.log(`⏭️  ${agentConfig.avatarEmoji} ${agentConfig.name} — já existe (slug: ${agentConfig.slug}), pulando...`)
        results.push({ name: agentConfig.name, id: existing.id, status: 'skipped' })
        continue
      }

      const [created] = await db
        .insert(agents)
        .values({
          organizationId,
          name: agentConfig.name,
          slug: agentConfig.slug,
          description: agentConfig.description,
          status: 'active',
          personality: agentConfig.personality,
          aiConfig: agentConfig.aiConfig,
          behaviorConfig: agentConfig.behaviorConfig,
        })
        .returning({ id: agents.id })

      console.log(`✅ ${agentConfig.avatarEmoji} ${agentConfig.name} criado! ID: ${created.id}`)
      results.push({ name: agentConfig.name, id: created.id, status: 'created' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`❌ ${agentConfig.name} — erro: ${message}`)
      results.push({ name: agentConfig.name, id: '', status: 'error', error: message })
    }
  }

  // Resumo
  const created = results.filter((r) => r.status === 'created')
  const skipped = results.filter((r) => r.status === 'skipped')
  const errors = results.filter((r) => r.status === 'error')

  console.log('\n' + '─'.repeat(50))
  console.log('📊 RESUMO DO SEED')
  console.log('─'.repeat(50))
  console.log(`✅ Criados:  ${created.length}`)
  console.log(`⏭️  Pulados:  ${skipped.length}`)
  console.log(`❌ Erros:    ${errors.length}`)

  if (created.length > 0) {
    console.log('\n🎉 Equipe criada com sucesso!')
    console.log('\n👥 Membros da equipe:')
    for (const member of MARKETING_TEAM_SUMMARY.members) {
      const result = results.find((r) => r.name === member.name)
      if (result?.status === 'created') {
        console.log(`   ${member.emoji} ${member.name} — ${member.role}`)
        console.log(`      ID: ${result.id}`)
      }
    }
  }

  if (errors.length > 0) {
    console.log('\n⚠️  Alguns agentes falharam:')
    errors.forEach((e) => console.log(`   - ${e.name}: ${e.error}`))
  }

  console.log('\n💡 Próximos passos:')
  console.log('   1. Acesse o dashboard ZapAgent e localize os agentes criados')
  console.log('   2. Conecte cada agente a um canal (WhatsApp, Widget ou Instagram)')
  console.log('   3. Adicione bases de conhecimento específicas para cada agente')
  console.log('   4. Teste cada membro da equipe antes de ativar em produção')
  console.log('')

  process.exit(errors.length > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('❌ Erro fatal no seed:', err)
  process.exit(1)
})
