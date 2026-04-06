'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, CheckCircle, XCircle, Users } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

type InviteInfo = {
  email: string
  orgName: string
  role: string
}

export default function InviteAcceptPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get('token')

  const [status, setStatus] = useState<'loading' | 'found' | 'authing' | 'success' | 'error'>('loading')
  const [invite, setInvite] = useState<InviteInfo | null>(null)
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
  const [isNewUser, setIsNewUser] = useState(false)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('Link de convite inválido.')
      return
    }

    async function loadInvite() {
      const supabase = createSupabaseBrowserClient()

      // Check if already signed in
      const { data: { user } } = await supabase.auth.getUser()

      // Load invite info via API route
      const res = await fetch(`/api/invite/info?token=${token}`)
      if (!res.ok) {
        setStatus('error')
        setMessage('Convite inválido ou expirado.')
        return
      }
      const data = await res.json()
      setInvite(data)

      if (user) {
        // Already signed in — accept immediately
        await acceptInvite(token!, user.id, supabase)
      } else {
        // Check if email has existing account
        setIsNewUser(true)
        setStatus('found')
      }
    }

    loadInvite()
  }, [token])

  async function acceptInvite(tok: string, userId: string, supabase: any) {
    const res = await fetch('/api/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tok, userId }),
    })
    if (res.ok) {
      setStatus('success')
      setMessage('Convite aceito! Redirecionando...')
      setTimeout(() => router.replace('/'), 2000)
    } else {
      const err = await res.json()
      setStatus('error')
      setMessage(err.error ?? 'Erro ao aceitar convite.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!invite || !token) return
    setStatus('authing')

    const supabase = createSupabaseBrowserClient()

    // Try sign in first
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: invite.email,
      password,
    })

    if (signInData?.user) {
      await acceptInvite(token, signInData.user.id, supabase)
      return
    }

    // Sign in failed — try sign up
    if (signInError) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: { emailRedirectTo: undefined },
      })

      if (signUpError) {
        setStatus('found')
        setMessage(signUpError.message)
        return
      }

      if (signUpData?.user) {
        await acceptInvite(token, signUpData.user.id, supabase)
        return
      }
    }

    setStatus('found')
    setMessage('Não foi possível autenticar. Tente novamente.')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-blue-500 px-8 py-6 text-center">
          <img src="/logo.png" alt="WHITE ZAP" className="mx-auto h-10 mb-2" />
          <p className="text-blue-100 text-xs tracking-widest uppercase font-semibold">Convite para a plataforma</p>
        </div>

        <div className="px-8 py-8 text-center space-y-5">
          {status === 'loading' && (
            <>
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Carregando convite...</p>
            </>
          )}

          {status === 'found' && invite && (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 mx-auto">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Você foi convidado!</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Para entrar em <strong className="text-primary">{invite.orgName}</strong>
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3 text-left">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={invite.email}
                    disabled
                    className="w-full rounded-lg border bg-gray-50 px-3 py-2.5 text-sm text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {isNewUser ? 'Crie uma senha para entrar' : 'Sua senha'}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {isNewUser && (
                    <p className="text-xs text-muted-foreground mt-1">Mínimo 6 caracteres. Se já tiver conta, use sua senha atual.</p>
                  )}
                </div>
                {message && <p className="text-sm text-red-500">{message}</p>}
                <button
                  type="submit"
                  className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90"
                >
                  Aceitar convite e entrar
                </button>
              </form>
            </>
          )}

          {status === 'authing' && (
            <>
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Entrando na organização...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
              <p className="font-semibold text-green-700">{message}</p>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle className="mx-auto h-10 w-10 text-red-500" />
              <p className="font-medium text-red-700">{message}</p>
              <a href="/login" className="inline-block rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90">
                Ir para o login
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
