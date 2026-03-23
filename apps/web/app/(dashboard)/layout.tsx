import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto">
        <div className="container max-w-7xl py-6">{children}</div>
      </main>
    </div>
  )
}
