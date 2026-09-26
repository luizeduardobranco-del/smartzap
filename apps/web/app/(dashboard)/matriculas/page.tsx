import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/supabase/server'
import { MatriculasManager } from '@/components/matriculas/MatriculasManager'

export const metadata = { title: 'Matrículas' }

/**
 * O slug vem do servidor porque é ele que monta o link público da ficha —
 * o mesmo link que o agente manda no WhatsApp quando o responsável fecha.
 */
async function getSlug(userId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .single()
  if (!member) return null

  const { data: org } = await supabase
    .from('organizations')
    .select('slug')
    .eq('id', member.organization_id)
    .single()

  return org?.slug ?? null
}

export default async function MatriculasPage() {
  const user = await getUser()
  const slug = user ? await getSlug(user.id) : null

  return <MatriculasManager slug={slug} />
}
