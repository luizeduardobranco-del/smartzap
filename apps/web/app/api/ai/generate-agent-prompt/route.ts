import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    businessName,
    businessType,
    mainProduct,
    targetAudience,
    agentRole,
    tone,
    canSchedule,
    canSendPrice,
    humanHandoffKeyword,
    additionalInfo,
  } = body

  const systemPrompt = `Você é um especialista em criação de agentes de atendimento via WhatsApp/Instagram para negócios brasileiros.
Crie prompts de sistema completos, profissionais e em português, que instruem o agente IA a se comportar exatamente como um funcionário real do negócio.`

  const userPrompt = `Crie um prompt de sistema completo para um agente de IA com as seguintes informações:

**Negócio:** ${businessName}
**Tipo de negócio:** ${businessType}
**Produto/Serviço principal:** ${mainProduct}
**Público-alvo:** ${targetAudience}
**Função do agente:** ${agentRole}
**Tom de comunicação:** ${tone}
**Pode agendar horários?** ${canSchedule ? 'Sim' : 'Não'}
**Pode informar preços?** ${canSendPrice ? 'Sim' : 'Não'}
**Palavra para transferir para humano:** ${humanHandoffKeyword || 'atendente'}
${additionalInfo ? `**Informações adicionais:** ${additionalInfo}` : ''}

O prompt deve:
1. Definir claramente a identidade e papel do agente
2. Estabelecer o tom e estilo de comunicação
3. Listar o que o agente pode e não pode fazer
4. Incluir instruções sobre como tratar dúvidas sem resposta
5. Orientar sobre quando transferir para humano
6. Ser escrito em 1ª pessoa, como se o agente estivesse lendo suas próprias instruções

Retorne APENAS o prompt de sistema, sem explicações adicionais.`

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return NextResponse.json({ error: 'OpenAI não configurado' }, { status: 500 })
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    return NextResponse.json({ error: err.error?.message ?? 'Erro ao gerar prompt' }, { status: 500 })
  }

  const data = await response.json()
  const generatedPrompt = data.choices[0]?.message?.content ?? ''

  return NextResponse.json({ prompt: generatedPrompt })
}
