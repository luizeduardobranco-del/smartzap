import Link from 'next/link'

export const metadata = { title: 'Termos de Uso | White Zap' }

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-10">
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Voltar ao início</Link>
        </div>

        <h1 className="mb-2 text-3xl font-bold text-slate-900">Termos de Uso</h1>
        <p className="mb-10 text-sm text-slate-500">Última atualização: 1º de abril de 2026</p>

        <div className="prose prose-slate max-w-none space-y-8 text-slate-700">

          <section>
            <h2 className="text-xl font-semibold text-slate-900">1. Aceitação dos termos</h2>
            <p>
              Ao criar uma conta ou utilizar a plataforma White Zap (<strong>atendente.whiteerp.com</strong>),
              você concorda com estes Termos de Uso. Se não concordar, não utilize o serviço.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">2. Descrição do serviço</h2>
            <p>
              White Zap é uma plataforma SaaS que permite criar e gerenciar agentes de inteligência artificial
              para atendimento automatizado via WhatsApp, Instagram e sites. O serviço inclui automações,
              gestão de contatos, campanhas e integrações com serviços externos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">3. Conta de usuário</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Você é responsável por manter a segurança de suas credenciais de acesso.</li>
              <li>Cada conta é pessoal e intransferível.</li>
              <li>Informações falsas no cadastro podem resultar em encerramento da conta.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">4. Uso aceitável</h2>
            <p>É proibido utilizar o White Zap para:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Enviar spam ou mensagens não solicitadas em massa.</li>
              <li>Atividades ilegais ou que violem direitos de terceiros.</li>
              <li>Disseminar conteúdo ofensivo, discriminatório ou enganoso.</li>
              <li>Violar as políticas de uso do WhatsApp, Instagram ou outras plataformas integradas.</li>
              <li>Tentar acessar sistemas ou dados de outros usuários sem autorização.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">5. Planos e pagamentos</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Os planos e preços estão descritos na página de preços da plataforma.</li>
              <li>Pagamentos são processados por Asaas ou Stripe.</li>
              <li>Planos são cobrados de forma recorrente (mensal ou anual) conforme escolhido.</li>
              <li>Cancelamentos devem ser feitos antes da renovação para evitar cobranças.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">6. Integrações com terceiros</h2>
            <p>
              Ao conectar serviços externos (Google, WhatsApp, Instagram), você autoriza o White Zap a operar
              esses serviços em seu nome dentro dos limites da autorização concedida. Você pode revogar
              integrações a qualquer momento pelas Configurações da plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">7. Propriedade intelectual</h2>
            <p>
              O White Zap e todos os seus componentes (marca, código, design, documentação) são propriedade
              da White ERP. O uso da plataforma não transfere qualquer direito de propriedade intelectual.
              Seus dados e conteúdos permanecem de sua propriedade.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">8. Limitação de responsabilidade</h2>
            <p>
              O White Zap é fornecido "como está". Não nos responsabilizamos por interrupções de serviços
              de terceiros (WhatsApp, Instagram, Google), perda de dados por falha do usuário, ou danos
              indiretos decorrentes do uso da plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">9. Encerramento de conta</h2>
            <p>
              Podemos suspender ou encerrar contas que violem estes termos. Você pode encerrar sua conta
              a qualquer momento pelo painel de configurações ou por e-mail.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">10. Lei aplicável</h2>
            <p>
              Estes termos são regidos pelas leis brasileiras. Fica eleito o foro da comarca do Rio de Janeiro/RJ
              para dirimir quaisquer disputas.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-slate-900">11. Contato</h2>
            <p>
              Dúvidas sobre estes termos:<br />
              <strong>E-mail:</strong> contato@whiteerp.com<br />
              <strong>Site:</strong> atendente.whiteerp.com
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
