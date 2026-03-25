'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import {
  Bot,
  MessageSquare,
  Zap,
  BarChart3,
  Settings,
  Coins,
  LogOut,
  ChevronDown,
  Kanban,
  Send,
  Users,
} from 'lucide-react'

const navItems = [
  { href: '/agents', label: 'Agentes', icon: Bot },
  { href: '/conversations', label: 'Conversas', icon: MessageSquare },
  { href: '/contacts', label: 'Contatos', icon: Users },
  { href: '/crm', label: 'CRM', icon: Kanban },
  { href: '/automations', label: 'Automações', icon: Zap },
  { href: '/campaigns', label: 'Disparos', icon: Send },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/credits', label: 'Créditos', icon: Coins },
  { href: '/settings', label: 'Configurações', icon: Settings },
]

interface SidebarProps {
  user: User
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  const displayName = user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'Usuário'
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <aside className="flex h-full w-60 flex-col border-r bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-4">
        <Link href="/agents" className="flex items-center">
          <Image src="/logo.png" alt="White Zap" width={140} height={48} className="object-contain" priority />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="border-t p-3">
        <div className="flex items-center justify-between rounded-lg p-2 hover:bg-muted">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="rounded p-1 text-muted-foreground hover:text-destructive"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
