import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { processarFonteConhecimento } from '@/lib/conhecimento'

export async function POST(req: NextRequest) {
  // Só quem enxerga a fonte (RLS da organização) pode mandar processá-la.
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const sourceId: string | undefined = body.sourceId
  if (!sourceId) return NextResponse.json({ error: 'sourceId required' }, { status: 400 })

  const { data: visivel } = await supabase.from('agent_knowledge_sources').select('id').eq('id', sourceId).maybeSingle()
  if (!visivel) return NextResponse.json({ error: 'Source not found' }, { status: 404 })

  try {
    const r = await processarFonteConhecimento(sourceId)
    return NextResponse.json({ success: true, ...r })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[knowledge/process]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
