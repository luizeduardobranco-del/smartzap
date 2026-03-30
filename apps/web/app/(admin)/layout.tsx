import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/admin'
import { AdminSidebar } from './components/AdminSidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser()
  if (!user) redirect('/login')

  const isAdmin = await isPlatformAdmin(user.id)
  if (!isAdmin) redirect('/agents')

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="container max-w-7xl py-6 px-6">{children}</div>
      </main>
    </div>
  )
}
