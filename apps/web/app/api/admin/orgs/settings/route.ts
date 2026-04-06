import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/admin'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function PATCH(req: NextRequest) {
  const supabaseAuth = createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  if (!(await isPlatformAdmin(user.id))) return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 })

  const { id, module, enabled } = await req.json()
  if (!id || !module) return NextResponse.json({ error: 'id e module são obrigatórios.' }, { status: 400 })

  const supabase = getServiceClient()

  // Fetch current settings
  const { data: org } = await supabase
    .from('organizations')
    .select('settings')
    .eq('id', id)
    .single()

  const currentSettings = (org?.settings ?? {}) as Record<string, unknown>
  const currentModules: string[] = (currentSettings.enabled_modules as string[]) ?? []
  const nextModules = enabled
    ? [...new Set([...currentModules, module])]
    : currentModules.filter((m) => m !== module)

  const { error } = await supabase
    .from('organizations')
    .update({ settings: { ...currentSettings, enabled_modules: nextModules } })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
