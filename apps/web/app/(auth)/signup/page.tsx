'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { CheckCircle2, Mail } from 'lucide-react'

export default function SignupPage() {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  function fbq(...args: unknown[]) {
    if (typeof window !== 'undefined' && (window as any).fbq) {
      ;(window as any).fbq(...args)
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Evento: usuário iniciou o cadastro
    fbq('track', 'Lead')

    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name, company_name: company },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        if (error.message.includes('already registered') || error.message.includes('already been registered')) {
          setError('Este e-mail já está cadastrado. Faça login ou recupere sua senha.')
        } else {
          setError(error.message)
        }
        return
      }

      // Supabase requires email confirmation — session will be null
      if (data.user && !data.session) {
        fbq('track', 'CompleteRegistration')
        setConfirmed(true)
        return
      }

      // Email confirmation disabled — user is already logged in
      fbq('track', 'CompleteRegistration')
      window.location.href = '/agents'
    } finally {
      setLoading(false)
    }
  }

  if (confirmed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center">
            <Link href="/" className="mb-4">
              <Image src="/logo.png" alt="White Zap" width={180} height={60} className="object-contain" priority />
            </Link>
          </div>

          <div className="rounded-xl border bg-white p-8 shadow-sm text-center space-y-4">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
                <Mail className="h-8 w-8 text-indigo-600" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900">Confirme seu e-mail</h2>
              <p className="mt-2 text-sm text-zinc-600">
                Enviamos um link de confirmação para{' '}
                <span className="font-semibold text-zinc-800">{email}</span>
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Clique no link do e-mail para ativar sua conta e fazer login.
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-left">
              <p className="text-xs text-amber-800">
                <span className="font-semibold">Não recebeu?</span> Verifique sua pasta de spam. O e-mail vem de <span className="font-mono">noreply@mail.app.supabase.io</span>
              </p>
            </div>
            <p className="text-sm text-zinc-500">
              Já confirmou?{' '}
              <Link href="/login" className="font-medium text-indigo-600 hover:underline">
                Fazer login
              </Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <Link href="/" className="mb-4">
            <Image src="/logo.png" alt="White Zap" width={180} height={60} className="object-contain" priority />
          </Link>
          <h1 className="text-2xl font-bold">Crie sua conta grátis</h1>
          <p className="mt-1 text-sm text-muted-foreground">7 dias grátis, sem cartão de crédito</p>
        </div>

        <div className="rounded-xl border bg-white p-8 shadow-sm">
          <form onSubmit={handleSignup} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
                Seu nome
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                placeholder="João Silva"
                required
              />
            </div>
            <div>
              <label htmlFor="company" className="mb-1.5 block text-sm font-medium">
                Nome da empresa
              </label>
              <input
                id="company"
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                placeholder="Minha Empresa Ltda"
                required
              />
            </div>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                placeholder="joao@empresa.com"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
                Senha (mín. 8 caracteres)
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                placeholder="••••••••"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Criando conta...' : 'Criar conta grátis'}
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Ao criar sua conta, você concorda com os{' '}
            <Link href="/terms" className="underline">
              Termos de Uso
            </Link>{' '}
            e{' '}
            <Link href="/privacy" className="underline">
              Política de Privacidade
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Já tem uma conta?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
