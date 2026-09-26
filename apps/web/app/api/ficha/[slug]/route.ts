import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

/**
 * Recebe a ficha de matrícula preenchida pelo responsável.
 *
 * É uma rota PÚBLICA: quem preenche não tem login. Por isso a gravação usa
 * service_role aqui no servidor e nunca a chave anônima no navegador — o
 * visitante consegue inserir a própria ficha e nada mais. A organização vem do
 * slug na URL, nunca do corpo do POST.
 */

const schema = z.object({
  responsavel_nome: z.string().trim().min(3).max(120),
  responsavel_telefone: z.string().trim().min(8).max(30),
  aluno_nome: z.string().trim().min(3).max(120),
  periodo: z.enum(['manha', 'tarde']),
  endereco: z.string().trim().min(5).max(300),
  colegio: z.string().trim().min(2).max(160),
  bairro: z.string().trim().max(80).optional(),
  serie: z.string().trim().max(40).optional(),
  observacao: z.string().trim().max(500).optional(),
  // Campo isca: fica escondido no formulário. Humano nunca preenche; robô de
  // spam preenche tudo que encontra.
  website: z.string().max(0).optional(),
})

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})))

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Confira os campos: algum dado ficou incompleto.' },
      { status: 400 }
    )
  }

  const { website, ...ficha } = parsed.data

  // Isca preenchida: responde 200 para o robô achar que deu certo, e não grava.
  if (website) return NextResponse.json({ ok: true })

  const supabase = getServiceSupabase()

  const { data: org } = await supabase
    .from('organizations')
    .select('id, settings')
    .eq('slug', params.slug)
    .single()

  const modulos = (org?.settings as { enabled_modules?: string[] } | null)?.enabled_modules ?? []
  if (!org || !modulos.includes('matriculas')) {
    return NextResponse.json({ error: 'Formulário não encontrado.' }, { status: 404 })
  }

  const { error } = await supabase.from('matriculas').insert({
    organization_id: org.id,
    ...ficha,
    origem: 'formulario',
  })

  if (error) {
    return NextResponse.json({ error: 'Não conseguimos salvar agora.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
