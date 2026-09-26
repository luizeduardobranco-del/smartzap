import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { COOKIE_SUPORTE } from '@/lib/suporte'

/**
 * Sair do modo suporte e voltar para a conta do admin — sem pedir senha.
 *
 * A autorização NÃO vem do e-mail gravado no cookie (cookie é dado do cliente,
 * e quem o forjasse entraria como qualquer admin). Vem do `return_token`, um
 * segredo aleatório que só existe no log e só vale enquanto a sessão estiver
 * aberta. Sair o queima.
 */

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(_req: NextRequest) {
  const cookieStore = cookies()
  const bruto = cookieStore.get(COOKIE_SUPORTE)?.value

  if (!bruto) {
    return NextResponse.json({ error: 'Nenhuma sessão de suporte aberta.' }, { status: 400 })
  }

  let returnToken: string | undefined
  try {
    returnToken = JSON.parse(bruto)?.returnToken
  } catch {
    returnToken = undefined
  }

  if (!returnToken) {
    return NextResponse.json({ error: 'Sessão de suporte inválida.' }, { status: 400 })
  }

  const service = getServiceClient()

  const { data: log } = await service
    .from('impersonation_logs')
    .select('id, admin_user_id')
    .eq('return_token', returnToken)
    .is('ended_at', null)
    .single()

  if (!log) {
    // Token queimado ou inexistente: derruba a sessão e manda para o login.
    const resposta = NextResponse.json({ ok: true, redirect: '/login' })
    resposta.cookies.delete(COOKIE_SUPORTE)
    return resposta
  }

  const { data: admin } = await service.auth.admin.getUserById(log.admin_user_id)
  if (!admin?.user?.email) {
    const resposta = NextResponse.json({ ok: true, redirect: '/login' })
    resposta.cookies.delete(COOKIE_SUPORTE)
    return resposta
  }

  const { data: link } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: admin.user.email,
  })

  const tokenHash = link?.properties?.hashed_token
  if (!tokenHash) {
    const resposta = NextResponse.json({ ok: true, redirect: '/login' })
    resposta.cookies.delete(COOKIE_SUPORTE)
    return resposta
  }

  const response = NextResponse.json({ ok: true, redirect: '/admin' })

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

  const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })

  // Encerra o registro e queima o token, dando ou não certo a volta.
  await service
    .from('impersonation_logs')
    .update({ ended_at: new Date().toISOString(), return_token: null })
    .eq('id', log.id)

  response.cookies.delete(COOKIE_SUPORTE)

  if (error) {
    const resposta = NextResponse.json({ ok: true, redirect: '/login' })
    resposta.cookies.delete(COOKIE_SUPORTE)
    return resposta
  }

  return response
}
