import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { getUser } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/admin'
import { COOKIE_SUPORTE } from '@/lib/suporte'

/**
 * Entrar como usuário (modo suporte).
 *
 * O admin da plataforma abre uma sessão do cliente sem saber a senha dele. O
 * caminho é o magic link do Supabase: geramos um com service_role e já o
 * consumimos aqui no servidor, então o token nunca chega ao navegador nem ao
 * e-mail do cliente.
 *
 * A sessão do admin É SUBSTITUÍDA pela do cliente — é o mesmo comportamento do
 * GPSWOX. A volta não pede senha: o `return_token` gravado no log reabre a
 * sessão do admin em /api/admin/impersonate/exit.
 */

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const admin = await getUser()
  if (!admin || !(await isPlatformAdmin(admin.id))) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 })
  }

  const { userId, motivo } = (await req.json().catch(() => ({}))) as {
    userId?: string
    motivo?: string
  }

  if (!userId) {
    return NextResponse.json({ error: 'Usuário não informado.' }, { status: 400 })
  }
  if (!motivo || motivo.trim().length < 5) {
    // O motivo é o que torna o acesso auditável. Sem ele, não entra.
    return NextResponse.json(
      { error: 'Descreva o motivo do acesso (mínimo 5 caracteres).' },
      { status: 400 }
    )
  }
  if (userId === admin.id) {
    return NextResponse.json({ error: 'Você já está nesta conta.' }, { status: 400 })
  }

  const service = getServiceClient()

  const { data: alvo, error: erroAlvo } = await service.auth.admin.getUserById(userId)
  if (erroAlvo || !alvo?.user?.email) {
    return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
  }

  // Um admin não entra na conta de outro admin: se precisar, que ele mesmo
  // entre. Evita que um operador de suporte alcance o painel da plataforma.
  if (await isPlatformAdmin(userId)) {
    return NextResponse.json(
      { error: 'Não é possível entrar na conta de outro administrador.' },
      { status: 403 }
    )
  }

  const { data: membro } = await service
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .single()

  // Magic link gerado e consumido aqui mesmo — não é enviado por e-mail.
  const { data: link, error: erroLink } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: alvo.user.email,
  })

  const tokenHash = link?.properties?.hashed_token
  if (erroLink || !tokenHash) {
    return NextResponse.json({ error: 'Não foi possível abrir a sessão.' }, { status: 500 })
  }

  const returnToken = randomBytes(32).toString('hex')

  const { data: log, error: erroLog } = await service
    .from('impersonation_logs')
    .insert({
      admin_user_id: admin.id,
      admin_email: admin.email,
      target_user_id: userId,
      target_email: alvo.user.email,
      target_org_id: membro?.organization_id ?? null,
      motivo: motivo.trim(),
      return_token: returnToken,
    })
    .select('id')
    .single()

  if (erroLog || !log) {
    // Sem registro não há acesso: o log não é enfeite, é a condição.
    // O detalhe do Postgres vai junto porque esta rota já é restrita a admin —
    // e sem ele a falha vira adivinhação.
    console.error('[impersonate] falha ao registrar acesso:', erroLog)
    return NextResponse.json(
      {
        error: 'Não foi possível registrar o acesso.',
        detalhe: erroLog?.message ?? 'insert não retornou linha',
        codigo: (erroLog as { code?: string } | null)?.code ?? null,
      },
      { status: 500 }
    )
  }

  const cookieStore = cookies()
  const response = NextResponse.json({ ok: true, redirect: '/agents' })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // A partir daqui os cookies de sessão são do cliente, não do admin.
  const { error: erroSessao } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  })

  if (erroSessao) {
    await service
      .from('impersonation_logs')
      .update({ ended_at: new Date().toISOString(), return_token: null })
      .eq('id', log.id)
    return NextResponse.json({ error: 'Não foi possível abrir a sessão.' }, { status: 500 })
  }

  // httpOnly: o banner é montado no servidor. O navegador não precisa ler isso,
  // e o return_token não pode ficar exposto a script de página.
  response.cookies.set(
    COOKIE_SUPORTE,
    JSON.stringify({ logId: log.id, adminEmail: admin.email, targetEmail: alvo.user.email, returnToken }),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 4, // 4 horas: suporte é sessão curta, não acesso permanente.
    }
  )

  return response
}
