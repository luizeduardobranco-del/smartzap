'use client'

import { usePathname } from 'next/navigation'

export function DashboardScroll({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Conversation detail page needs internal scroll (not outer page scroll)
  const isFullHeight = /^\/conversations\/[^/]+$/.test(pathname)

  if (isFullHeight) {
    // overflow-hidden so that h-full resolves correctly in children
    return (
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-4 md:px-6 py-4 pt-14 md:pt-4">
        <div className="max-w-7xl mx-auto w-full flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 pt-14 md:pt-4">
      <div className="max-w-7xl mx-auto h-full">{children}</div>
    </div>
  )
}
