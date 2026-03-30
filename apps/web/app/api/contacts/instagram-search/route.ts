import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const CREDITS_PER_PROFILE = 3

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function extractPhoneFromBio(bio: string): string {
  if (!bio) return ''
  // Match Brazilian phone patterns: (XX) XXXXX-XXXX, XX XXXXX-XXXX, +55...
  const patterns = [
    /\+55\s?\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/,
    /\(?\d{2}\)?\s?\d{4,5}[-\s]?\d{4}/,
    /\d{10,11}/,
  ]
  for (const pattern of patterns) {
    const match = bio.match(pattern)
    if (match) {
      const digits = match[0].replace(/\D/g, '')
      if (digits.length >= 10 && digits.length <= 13) {
        // Normalize to 55DDDNUMBER format
        if (digits.startsWith('55') && digits.length >= 12) return digits
        if (digits.length === 11 || digits.length === 10) return `55${digits}`
      }
    }
  }
  return ''
}

async function fetchInstagramProfile(username: string): Promise<{
  username: string
  full_name: string
  bio: string
  website: string
  phone: string
  followers: number
  category: string
  is_business: boolean
} | null> {
  // Use Instagram's public graph API endpoint
  const url = `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'x-ig-app-id': '936619743392459',
    'Referer': 'https://www.instagram.com/',
    'Origin': 'https://www.instagram.com',
  }

  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) return null

    const json = await res.json()
    const user = json?.data?.user
    if (!user) return null

    const bio = user.biography ?? ''
    const phone = user.business_phone_number
      ? user.business_phone_number.replace(/\D/g, '')
      : extractPhoneFromBio(bio)

    return {
      username: user.username ?? username,
      full_name: user.full_name ?? '',
      bio,
      website: user.external_url ?? '',
      phone,
      followers: user.edge_followed_by?.count ?? 0,
      category: user.category_name ?? '',
      is_business: user.is_business_account ?? false,
    }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { usernames } = await req.json()
  if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
    return NextResponse.json({ error: 'Lista de usernames obrigatória' }, { status: 400 })
  }

  const db = getServiceClient()

  const { data: member } = await db
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return NextResponse.json({ error: 'Organização não encontrada' }, { status: 403 })

  const { data: org } = await db
    .from('organizations')
    .select('credits_balance')
    .eq('id', member.organization_id)
    .single()
  if (!org) return NextResponse.json({ error: 'Organização não encontrada' }, { status: 403 })

  const totalCost = usernames.length * CREDITS_PER_PROFILE
  if ((org.credits_balance ?? 0) < totalCost) {
    return NextResponse.json({
      error: `Créditos insuficientes. ${usernames.length} perfis custam ${totalCost} créditos. Você possui ${org.credits_balance ?? 0}.`,
      code: 'INSUFFICIENT_CREDITS',
    }, { status: 402 })
  }

  const results: any[] = []
  const errors: string[] = []

  for (const raw of usernames.slice(0, 30)) {
    const username = raw.trim().replace(/^@/, '').toLowerCase()
    if (!username || username.length > 30) {
      errors.push(`Username inválido: ${raw}`)
      continue
    }

    const profile = await fetchInstagramProfile(username)
    if (!profile) {
      errors.push(`@${username}: perfil não encontrado ou privado`)
    } else {
      results.push(profile)
    }

    // Delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500))
  }

  // Deduct credits only for successful lookups
  if (results.length > 0) {
    const cost = results.length * CREDITS_PER_PROFILE
    await db
      .from('organizations')
      .update({ credits_balance: (org.credits_balance ?? 0) - cost })
      .eq('id', member.organization_id)
  }

  return NextResponse.json({
    results,
    errors,
    total: results.length,
    credits_used: results.length * CREDITS_PER_PROFILE,
    credits_remaining: (org.credits_balance ?? 0) - results.length * CREDITS_PER_PROFILE,
  })
}
