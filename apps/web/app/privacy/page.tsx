import Link from 'next/link'

export const metadata = { title: 'Política de Privacidade | White Zap' }

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-10">
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Voltar ao início</Link>
        </div>

        <h1 className="mb-2 text-3xl font-bold text-slate-900">Política de Privacidade</h1>
        <p className="mb-10 text-sm text-slate-500">Última atualização: 1º de abril de 2026</p>

        <div className="prose prose-slate max-w-none space-y-8 text-slate-700">

          <section>
            <h2 className="text-xl font-semibold text-slate-900">1. Quem somos</h2>
            <p>
              WHITE ZAP é uma plataforma SaaS de agentes de inteligência artificial para atendimento automatizado
              via WhatsApp, Instagram e sites, desenvolvida e operada pela{' '}
              <strong>White Trackers Rastreadores LTDA</strong> e <strong>Marques Rastreadores LTDA</strong>,
              sob as marcas White Trackers, White ERP e WHITE ZAP.
            </p>
            <p className="mt-2">
              <strong>Responsável:</strong> Luiz Eduardo Branco<br />
              <strong>E-mail do desenvolvedor:</strong>{' '}
              <a href="mailto:Luizeduardobranco@gmail.com" className="text-blue-600 hover:underline">
                Luizeduardobranco@gmail.com
              </a><br />
              <strong>Site:</strong> <a href="https://atendente.whiteerp.com" className="text-blue-600 hover:underline">atendente.whiteerp.com</a>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">2. Dados que coletamos</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Dados de cadastro:</strong> nome, e-mail e senha ao criar sua conta.</li>
              <li><strong>Dados de uso:</strong> interações com a plataforma, configurações de agentes e histórico de conversas.</li>
              <li><strong>Dados de contatos:</strong> informações dos seus clientes inseridas na plataforma (nome, telefone, e-mail).</li>
              <li><strong>Dados de integração:</strong> quando você conecta serviços como Google Calendar ou Gmail, coletamos tokens de acesso para operar as integrações.</li>
              <li><strong>Dados de pagamento:</strong> processados por terceiros (Asaas/Stripe). Não armazenamos dados de cartão.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">3. Como usamos seus dados</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Prestar e melhorar os serviços da plataforma.</li>
              <li>Autenticar sua conta e garantir a segurança.</li>
              <li>Operar integrações autorizadas por você (Google, WhatsApp, Instagram).</li>
              <li>Enviar comunicações relacionadas ao serviço (alertas, faturas).</li>
              <li>Cumprir obrigações legais.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">4. Uso do Google API</h2>
            <p>
              Quando você conecta sua conta Google, utilizamos a API do Google para acessar apenas os recursos
              que você autorizar explicitamente (Google Calendar e/ou Gmail). O uso dessas informações respeita
              a <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">Política de Dados do Usuário dos Serviços de API do Google</a>,
              incluindo os requisitos de Uso Limitado. Não compartilhamos dados obtidos via Google API com terceiros
              sem sua autorização.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">5. Compartilhamento de dados</h2>
            <p>Não vendemos seus dados. Compartilhamos informações apenas com:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Provedores de infraestrutura:</strong> Supabase (banco de dados), Vercel (hospedagem), OpenAI (IA).</li>
              <li><strong>Processadores de pagamento:</strong> Asaas e Stripe.</li>
              <li><strong>Autoridades legais:</strong> quando exigido por lei.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">6. Seus direitos (LGPD)</h2>
            <p>De acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você tem direito a:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Acessar, corrigir ou excluir seus dados pessoais.</li>
              <li>Revogar consentimentos a qualquer momento.</li>
              <li>Portabilidade dos dados.</li>
              <li>Ser informado sobre o uso dos seus dados.</li>
            </ul>
            <p>Para exercer esses direitos, entre em contato: <strong>Luizeduardobranco@gmail.com</strong></p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">7. Segurança</h2>
            <p>
              Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo criptografia em
              trânsito (TLS), autenticação segura e controle de acesso baseado em funções.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">8. Retenção de dados</h2>
            <p>
              Mantemos seus dados enquanto sua conta estiver ativa. Após o encerramento, os dados são excluídos
              em até 90 dias, salvo obrigação legal de retenção.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">9. Alterações nesta política</h2>
            <p>
              Podemos atualizar esta política periodicamente. Notificaremos por e-mail ou dentro da plataforma
              em caso de mudanças relevantes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">10. Contato</h2>
            <p>
              Dúvidas sobre privacidade? Fale conosco:<br />
              <strong>Responsável:</strong> Luiz Eduardo Branco<br />
              <strong>E-mail:</strong> Luizeduardobranco@gmail.com<br />
              <strong>Empresas:</strong> White Trackers Rastreadores LTDA / Marques Rastreadores LTDA<br />
              <strong>Site:</strong> atendente.whiteerp.com
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
