import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { FichaForm } from '@/components/matriculas/FichaForm'

/**
 * Página pública da ficha de matrícula — é o link que o agente manda no
 * WhatsApp quando o responsável decide fechar. Sem login, sem menu, sem nada
 * do painel: só o formulário.
 */

export const dynamic = 'force-dynamic'

type ConfigMatriculas = {
  titulo?: string
  subtitulo?: string
  colegios?: string[]
  pede_bairro?: boolean
  pede_serie?: boolean
}

async function getOrg(slug: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data } = await supabase
    .from('organizations')
    .select('name, settings')
    .eq('slug', slug)
    .single()
  return data
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const org = await getOrg(params.slug)
  return { title: org ? `Ficha de matrícula | ${org.name}` : 'Ficha de matrícula' }
}

export default async function FichaPage({ params }: { params: { slug: string } }) {
  const org = await getOrg(params.slug)

  const settings = (org?.settings ?? null) as
    | { enabled_modules?: string[]; matriculas?: ConfigMatriculas }
    | null

  // Sem o módulo ligado, o link não existe — nem para quem adivinhar o slug.
  if (!org || !settings?.enabled_modules?.includes('matriculas')) notFound()

  const config = settings.matriculas ?? {}

  return (
    <main className="min-h-[100dvh] bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-6 text-center">
          <p className="text-sm font-medium text-blue-600">{org.name}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {config.titulo ?? 'Ficha de matrícula'}
          </h1>
          {config.subtitulo && (
            <p className="mt-2 text-sm text-slate-600">{config.subtitulo}</p>
          )}
        </header>

        <FichaForm
          slug={params.slug}
          colegios={config.colegios ?? []}
          pedeBairro={config.pede_bairro ?? false}
          pedeSerie={config.pede_serie ?? false}
        />

        <p className="mt-6 text-center text-xs text-slate-400">
          Seus dados são usados apenas para o atendimento da matrícula.
        </p>
      </div>
    </main>
  )
}
