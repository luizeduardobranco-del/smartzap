'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import {
  Bot, MessageSquare, Zap, BarChart3, Settings, Coins, LogOut,
  Kanban, Send, Users, ShieldCheck, ChevronLeft, ChevronRight, Menu, X, GitBranch, Handshake, ImagePlay,
} from 'lucide-react'

const baseNavItems = [
  { href: '/agents',        label: 'Agentes',        icon: Bot,        module: null },
  { href: '/conversations', label: 'Conversas',       icon: MessageSquare, module: null },
  { href: '/contacts',      label: 'Contatos',        icon: Users,      module: null },
  { href: '/crm',           label: 'CRM',             icon: Kanban,     module: null },
  { href: '/funnels',       label: 'Funis',           icon: GitBranch,  module: null },
  { href: '/automations',   label: 'Automações',      icon: Zap,        module: null },
  { href: '/campaigns',     label: 'Disparos',        icon: Send,       module: null },
  { href: '/stories',       label: 'Stories',         icon: ImagePlay,  module: null },
  { href: '/analytics',     label: 'Analytics',       icon: BarChart3,  module: null },
  { href: '/credits',       label: 'Créditos',        icon: Coins,      module: null },
  { href: '/referrals',     label: 'Afiliados',       icon: Handshake,  module: 'affiliates' },
  { href: '/settings',      label: 'Configurações',   icon: Settings,   module: null },
]

interface SidebarProps {
  user: User
  isAdmin?: boolean
  enabledModules?: string[]
}

export function Sidebar({ user, isAdmin, enabledModules = [] }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const navItems = baseNavItems.filter(
    (item) => item.module === null || enabledModules.includes(item.module)
  )

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

  const sidebarContent = (isMobile = false) => (
    <aside
      className={`flex h-full flex-col border-r bg-white transition-all duration-200 ${
        isMobile ? 'w-60' : collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Logo + collapse toggle */}
      <div className="flex h-20 items-center justify-between border-b px-3">
        {(!collapsed || isMobile) && (
          <Link href="/agents" className="flex items-center overflow-hidden">
            <Image src="/logo.png" alt="White Zap" width={150} height={52} className="object-contain" priority />
          </Link>
        )}
        {collapsed && !isMobile && (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
        )}
        {/* Toggle collapse — desktop only */}
        {!isMobile && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}
        {/* Close button — mobile only */}
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 p-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => isMobile && setMobileOpen(false)}
              title={collapsed && !isMobile ? item.label : undefined}
              className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              } ${collapsed && !isMobile ? 'justify-center' : ''}`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {(!collapsed || isMobile) && <span>{item.label}</span>}
            </Link>
          )
        })}

        {/* Admin link */}
        {isAdmin && (
          <Link
            href="/admin"
            onClick={() => isMobile && setMobileOpen(false)}
            title={collapsed && !isMobile ? 'Painel Admin' : undefined}
            className={`flex items-center gap-3 rounded-lg bg-primary/10 px-2.5 py-2 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors mt-1 ${
              collapsed && !isMobile ? 'justify-center' : ''
            }`}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            {(!collapsed || isMobile) && <span>Painel Admin</span>}
          </Link>
        )}
      </nav>

      {/* Bottom: logout + user */}
      <div className="border-t p-2 space-y-1">
        {/* Logout button — always visible */}
        <button
          onClick={handleLogout}
          title="Sair"
          className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors ${
            collapsed && !isMobile ? 'justify-center' : ''
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {(!collapsed || isMobile) && <span>Sair</span>}
        </button>

        {/* User info */}
        {(!collapsed || isMobile) && (
          <div className="flex items-center gap-2 rounded-lg px-2.5 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium leading-tight">{displayName}</p>
              <p className="truncate text-[10px] text-muted-foreground leading-tight">{user.email}</p>
            </div>
          </div>
        )}
        {collapsed && !isMobile && (
          <div
            className="flex justify-center py-1"
            title={user.email}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              {initials}
            </div>
          </div>
        )}
      </div>
    </aside>
  )

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-lg border bg-white shadow-sm md:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Desktop sidebar */}
      <div className="hidden md:flex h-full">
        {sidebarContent(false)}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full">
            {sidebarContent(true)}
          </div>
        </div>
      )}
    </>
  )
}
