import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const BUCKET = 'story-media'
const MAX_SIZE = 50 * 1024 * 1024 // 50 MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm',
]

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getSessionUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function POST(req: NextRequest) {
  // Must be authenticated
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const formData = await req.formData()
  const files = formData.getAll('files') as File[]

  if (!files.length) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
  }

  const supabase = getServiceSupabase()
  const urls: string[] = []
  const errors: string[] = []

  for (const file of files) {
    if (!(file instanceof File)) continue

    if (!ALLOWED_TYPES.includes(file.type)) {
      errors.push(`${file.name}: tipo não permitido (${file.type})`)
      continue
    }
    if (file.size > MAX_SIZE) {
      errors.push(`${file.name}: arquivo muito grande (máx 50 MB)`)
      continue
    }

    const ext = file.name.split('.').pop() ?? 'bin'
    const path = `stories/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (error) {
      errors.push(`${file.name}: ${error.message}`)
      continue
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(path)

    urls.push(publicUrl)
  }

  if (!urls.length) {
    return NextResponse.json({ error: errors.join('; ') || 'Falha no upload' }, { status: 500 })
  }

  return NextResponse.json({ urls, errors: errors.length ? errors : undefined })
}
