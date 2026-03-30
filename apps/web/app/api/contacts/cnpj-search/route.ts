import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

const CREDITS_PER_CNPJ = 2

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function formatPhone(ddd: string, number: string): string {
  if (!ddd || !number) return ''
  const clean = number.replace(/\D/g, '')
  return `55${ddd.replace(/\D/g, '')}${clean}`
}

function formatCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, '').slice(0, 14)
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { cnpjs } = await req.json()
  if (!cnpjs || !Array.isArray(cnpjs) || cnpjs.length === 0) {
    return NextResponse.json({ error: 'Lista de CNPJs obrigatória' }, { status: 400 })
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

  const totalCost = cnpjs.length * CREDITS_PER_CNPJ
  if ((org.credits_balance ?? 0) < totalCost) {
    return NextResponse.json({
      error: `Créditos insuficientes. ${cnpjs.length} CNPJs custam ${totalCost} créditos. Você possui ${org.credits_balance ?? 0}.`,
      code: 'INSUFFICIENT_CREDITS',
    }, { status: 402 })
  }

  const results: any[] = []
  const errors: string[] = []

  for (const raw of cnpjs.slice(0, 50)) {
    const cnpj = formatCnpj(raw)
    if (cnpj.length !== 14) { errors.push(`CNPJ inválido: ${raw}`); continue }

    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        errors.push(`${cnpj}: ${err?.message ?? 'não encontrado'}`)
        continue
      }

      const d = await res.json()

      // Skip inactive companies
      if (d.situacao_cadastral && d.situacao_cadastral !== 2) {
        errors.push(`${cnpj}: empresa ${d.descricao_situacao_cadastral ?? 'inativa'}`)
        continue
      }

      const phone = formatPhone(d.ddd_telefone_1, d.telefone_1 ?? d.ddd_telefone_1)
      const phone2 = formatPhone(d.ddd_telefone_2, d.telefone_2 ?? '')
      const name = d.nome_fantasia?.trim() || d.razao_social?.trim() || cnpj

      const address = [
        d.logradouro,
        d.numero,
        d.complemento,
        d.bairro,
        d.municipio,
        d.uf,
      ].filter(Boolean).join(', ')

      results.push({
        cnpj: d.cnpj,
        name,
        razao_social: d.razao_social,
        phone: phone || phone2,
        phone2: phone && phone2 ? phone2 : '',
        email: d.email?.toLowerCase() || '',
        address,
        city: d.municipio || '',
        state: d.uf || '',
        website: '',
        cnae: d.cnae_fiscal_descricao || '',
        cnae_code: String(d.cnae_fiscal || ''),
        capital_social: d.capital_social || 0,
      })
    } catch (err: any) {
      errors.push(`${cnpj}: erro na consulta`)
    }

    // Small delay to respect BrasilAPI rate limits
    await new Promise(r => setTimeout(r, 300))
  }

  // Deduct credits for successful results
  if (results.length > 0) {
    const cost = results.length * CREDITS_PER_CNPJ
    await db
      .from('organizations')
      .update({ credits_balance: (org.credits_balance ?? 0) - cost })
      .eq('id', member.organization_id)
  }

  return NextResponse.json({
    results,
    errors,
    total: results.length,
    credits_used: results.length * CREDITS_PER_CNPJ,
    credits_remaining: (org.credits_balance ?? 0) - results.length * CREDITS_PER_CNPJ,
  })
}
