import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { getUser } from '@/lib/supabase/server'
import { isPlatformAdmin, getOrgSettings } from '@/lib/admin'
import { Sidebar } from '@/components/layout/Sidebar'
import { DashboardScroll } from '@/components/layout/DashboardScroll'
import { GettingStarted } from '@/components/onboarding/GettingStarted'
import { SupportChat } from '@/components/support/SupportChat'
import { HumanAttentionPanel } from '@/components/conversations/HumanAttentionPanel'
import { ChannelDisconnectedPanel } from '@/components/channels/ChannelDisconnectedPanel'
import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  const [isAdmin, orgSettings] = await Promise.all([
    isPlatformAdmin(user.id),
    getOrgSettings(user.id),
  ])

  const enabledModules: string[] = [
    ...(orgSettings?.hasAffiliates ? ['affiliates'] : []),
    ...(orgSettings?.hasMatriculas ? ['matriculas'] : []),
  ]

  // Modo suporte: o cookie é httpOnly, então a faixa é montada aqui no servidor.
  let suporte: { adminEmail?: string; targetEmail?: string } | null = null
  try {
    const bruto = cookies().get('wz_suporte')?.value
    if (bruto) suporte = JSON.parse(bruto)
  } catch {
    suporte = null
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-muted/30">
      {suporte?.targetEmail && (
        <ImpersonationBanner
          targetEmail={suporte.targetEmail}
          adminEmail={suporte.adminEmail ?? 'administrador'}
        />
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar user={user} isAdmin={isAdmin} enabledModules={enabledModules} />
        <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <DashboardScroll>{children}</DashboardScroll>
        </main>
        <GettingStarted />
        <SupportChat />
        <HumanAttentionPanel />
        <ChannelDisconnectedPanel />
      </div>
    </div>
  )
}
