'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Mail } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

function getLoginErrorMessage(message: string): { text: string; isEmailConfirm: boolean } {
  const lower = message.toLowerCase()
  if (lower.includes('email not confirmed') || lower.includes('not confirmed')) {
    return {
      text: 'Você precisa confirmar seu e-mail antes de fazer login. Verifique sua caixa de entrada (e o spam).',
      isEmailConfirm: true,
    }
  }
  if (lower.includes('invalid login') || lower.includes('invalid credentials') || lower.includes('wrong password')) {
    return { text: 'E-mail ou senha incorretos. Tente novamente.', isEmailConfirm: false }
  }
  if (lower.includes('user not found') || lower.includes('no user')) {
    return { text: 'Nenhuma conta encontrada com este e-mail.', isEmailConfirm: false }
  }
  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return { text: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.', isEmailConfirm: false }
  }
  return { text: 'E-mail ou senha inválidos. Tente novamente.', isEmailConfirm: false }
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isEmailConfirmError, setIsEmailConfirmError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent, setResendSent] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsEmailConfirmError(false)
    setLoading(true)

    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        const { text, isEmailConfirm } = getLoginErrorMessage(error.message)
        setError(text)
        setIsEmailConfirmError(isEmailConfirm)
        return
      }

      router.push('/agents')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleResendConfirmation() {
    if (!email) return
    setResendLoading(true)
    try {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      setResendSent(true)
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <Link href="/" className="mb-4">
            <Image src="/logo.png" alt="White Zap" width={260} height={90} className="object-contain" priority />
          </Link>
          <h1 className="text-2xl font-bold">Bem-vindo de volta</h1>
          <p className="mt-1 text-sm text-muted-foreground">Entre na sua conta para continuar</p>
        </div>

        {/* Form */}
        <div className="rounded-xl border bg-white p-8 shadow-sm">
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className={`rounded-lg p-3 text-sm ${isEmailConfirmError ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-destructive/10 text-destructive'}`}>
                <p>{error}</p>
                {isEmailConfirmError && (
                  <div className="mt-2">
                    {resendSent ? (
                      <p className="text-xs font-medium text-amber-700">✓ E-mail de confirmação reenviado!</p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendConfirmation}
                        disabled={resendLoading || !email}
                        className="text-xs font-semibold underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
                      >
                        {resendLoading ? 'Enviando...' : 'Reenviar e-mail de confirmação'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
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
                placeholder="seu@email.com"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  Senha
                </label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                  Esqueceu a senha?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Não tem uma conta?{' '}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Criar conta grátis
          </Link>
        </p>
      </div>
    </div>
  )
}
