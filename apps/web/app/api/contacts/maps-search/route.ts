import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const CREDITS_PER_SEARCH = 25

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { query, location, pageToken } = await req.json()
  if (!query && !pageToken) return NextResponse.json({ error: 'query is required' }, { status: 400 })

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Google Maps API key not configured' }, { status: 500 })

  const db = getServiceClient()

  // Get org and check credits
  const { data: member } = await db
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .single()

  if (!member) return NextResponse.json({ error: 'Organização não encontrada' }, { status: 403 })

  const { data: org } = await db
    .from('organizations')
    .select('credits_balance, plan_id')
    .eq('id', member.organization_id)
    .single()

  if (!org) return NextResponse.json({ error: 'Organização não encontrada' }, { status: 403 })

  // Check if plan allows Google Maps lead extraction
  if (org.plan_id) {
    const { data: plan } = await db
      .from('plans')
      .select('limits')
      .eq('id', org.plan_id)
      .single()

    const limits = plan?.limits as Record<string, unknown> | null
    if (!limits?.hasGoogleMapsSearch) {
      return NextResponse.json({
        error: 'Extração de leads pelo Google Maps não está disponível no seu plano atual. Faça upgrade para o plano Pro.',
        code: 'FEATURE_NOT_AVAILABLE',
      }, { status: 403 })
    }
  }

  if ((org.credits_balance ?? 0) < CREDITS_PER_SEARCH) {
    return NextResponse.json({
      error: `Créditos insuficientes. Esta busca custa ${CREDITS_PER_SEARCH} créditos e você possui ${org.credits_balance ?? 0}.`,
      code: 'INSUFFICIENT_CREDITS',
      balance: org.credits_balance ?? 0,
      cost: CREDITS_PER_SEARCH,
    }, { status: 402 })
  }

  try {
    const searchQuery = location ? `${query} em ${location}` : query

    // Build request body — paging requests must only contain pageToken + textQuery
    const body: Record<string, unknown> = pageToken
      ? { pageToken, textQuery: searchQuery }
      : { textQuery: searchQuery, languageCode: 'pt-BR', regionCode: 'BR', maxResultCount: 20 }

    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.nationalPhoneNumber',
          'places.internationalPhoneNumber',
          'places.websiteUri',
          'places.types',
          'nextPageToken',
        ].join(','),
      },
      body: JSON.stringify(body),
    })

    const searchJson = await searchRes.json()

    if (!searchRes.ok) {
      const errMsg = searchJson?.error?.message ?? 'Erro na busca do Google Maps'
      return NextResponse.json({ error: errMsg }, { status: 400 })
    }

    const places = searchJson.places ?? []
    const nextPageToken = searchJson.nextPageToken ?? null

    const results = places.map((place: any) => ({
      place_id: place.id ?? '',
      name: place.displayName?.text ?? '',
      address: place.formattedAddress ?? '',
      phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? '',
      website: place.websiteUri ?? '',
      types: place.types ?? [],
    }))

    // Deduct credits after successful search
    await db
      .from('organizations')
      .update({ credits_balance: (org.credits_balance ?? 0) - CREDITS_PER_SEARCH })
      .eq('id', member.organization_id)

    return NextResponse.json({
      results,
      total: results.length,
      nextPageToken,
      credits_used: CREDITS_PER_SEARCH,
      credits_remaining: (org.credits_balance ?? 0) - CREDITS_PER_SEARCH,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
