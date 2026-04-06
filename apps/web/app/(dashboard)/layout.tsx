import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { isPlatformAdmin, getOrgSettings } from '@/lib/admin'
import { Sidebar } from '@/components/layout/Sidebar'
import { DashboardScroll } from '@/components/layout/DashboardScroll'
import { GettingStarted } from '@/components/onboarding/GettingStarted'
import { SupportChat } from '@/components/support/SupportChat'
import { HumanAttentionPanel } from '@/components/conversations/HumanAttentionPanel'
import { ChannelDisconnectedPanel } from '@/components/channels/ChannelDisconnectedPanel'

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
  ]

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-muted/30">
      <Sidebar user={user} isAdmin={isAdmin} enabledModules={enabledModules} />
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <DashboardScroll>{children}</DashboardScroll>
      </main>
      <GettingStarted />
      <SupportChat />
      <HumanAttentionPanel />
      <ChannelDisconnectedPanel />
    </div>
  )
}
