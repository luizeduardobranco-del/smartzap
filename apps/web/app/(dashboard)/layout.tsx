import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/admin'
import { Sidebar } from '@/components/layout/Sidebar'
import { DashboardScroll } from '@/components/layout/DashboardScroll'
import { GettingStarted } from '@/components/onboarding/GettingStarted'
import { SupportChat } from '@/components/support/SupportChat'
import { HumanAttentionPanel } from '@/components/conversations/HumanAttentionPanel'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  const isAdmin = await isPlatformAdmin(user.id)

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-muted/30">
      <Sidebar user={user} isAdmin={isAdmin} />
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <DashboardScroll>{children}</DashboardScroll>
      </main>
      <GettingStarted />
      <SupportChat />
      <HumanAttentionPanel />
    </div>
  )
}
