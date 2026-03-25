import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/', '/pricing', '/login', '/signup', '/forgot-password', '/auth']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session on every request
  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith('/auth'))
  const isDashboardRoute =
    pathname.startsWith('/agents') ||
    pathname.startsWith('/conversations') ||
    pathname.startsWith('/automations') ||
    pathname.startsWith('/analytics') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/credits')

  // Redirect unauthenticated users trying to access dashboard
  if (!user && isDashboardRoute) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from auth pages
  if (user && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/agents', request.url))
  }

  // Subscription status check — block past_due and canceled, but not if already on /credits
  if (user && isDashboardRoute && !pathname.startsWith('/credits')) {
    try {
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (member?.organization_id) {
        const { data: org } = await supabase
          .from('organizations')
          .select('subscription_status, trial_ends_at')
          .eq('id', member.organization_id)
          .single()

        if (org) {
          const status = org.subscription_status as string | null
          const isBlockedStatus = status === 'past_due' || status === 'canceled'

          // Don't block if trial is still active
          const trialEndsAt = org.trial_ends_at as string | null
          const trialStillActive = trialEndsAt ? new Date(trialEndsAt) > new Date() : false

          if (isBlockedStatus && !trialStillActive) {
            const creditsUrl = new URL('/credits', request.url)
            creditsUrl.searchParams.set('blocked', '1')
            return NextResponse.redirect(creditsUrl)
          }
        }
      }
    } catch {
      // If subscription check fails, allow through — don't block users due to infra errors
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
