'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function InviteAcceptPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function handleInvite() {
      const supabase = createSupabaseBrowserClient()

      // Wait for Supabase to process the hash token from the invite link
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        setStatus('error')
        setMessage('Link de convite inválido ou expirado.')
        return
      }

      const user = session.user
      const email = user.email

      // Find pending invite for this email
      const { data: invite, error: inviteError } = await supabase
        .from('organization_invites')
        .select('id, organization_id, role')
        .eq('email', email!)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (inviteError || !invite) {
        // User may already be a member - redirect to dashboard
        setStatus('success')
        setMessage('Bem-vindo! Redirecionando...')
        setTimeout(() => router.replace('/'), 1500)
        return
      }

      // Check if already a member
      const { data: existingMember } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', invite.organization_id)
        .eq('user_id', user.id)
        .single()

      if (!existingMember) {
        // Add to organization
        const { error: memberError } = await supabase
          .from('organization_members')
          .insert({
            organization_id: invite.organization_id,
            user_id: user.id,
            role: invite.role,
          })

        if (memberError) {
          setStatus('error')
          setMessage('Erro ao aceitar convite. Tente novamente.')
          return
        }
      }

      // Mark invite as accepted
      await supabase
        .from('organization_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invite.id)

      setStatus('success')
      setMessage('Convite aceito! Redirecionando para o painel...')
      setTimeout(() => router.replace('/'), 2000)
    }

    handleInvite()
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Processando convite...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="mx-auto h-10 w-10 text-green-500" />
            <p className="font-medium text-green-700">{message}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="mx-auto h-10 w-10 text-red-500" />
            <p className="font-medium text-red-700">{message}</p>
            <a href="/login" className="inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90">
              Ir para o login
            </a>
          </>
        )}
      </div>
    </div>
  )
}
