export function buildInviteEmail({
  inviteeName,
  orgName,
  inviterName,
  acceptUrl,
}: {
  inviteeName?: string
  orgName: string
  inviterName?: string
  acceptUrl: string
}): { subject: string; html: string } {
  const subject = `Você foi convidado para ${orgName} no WHITE ZAP`

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td align="center" style="background:linear-gradient(135deg,#1e40af 0%,#2563eb 60%,#3b82f6 100%);border-radius:16px 16px 0 0;padding:36px 40px 32px;">
              <img
                src="https://atendente.whiteerp.com/logo.png"
                alt="WHITE ZAP"
                width="140"
                style="display:block;margin:0 auto 16px;"
              />
              <p style="margin:0;color:#bfdbfe;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">
                Plataforma de Agentes IA
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px 40px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">
                Você foi convidado! 🎉
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                ${inviterName ? `<strong>${inviterName}</strong> convidou você` : 'Você foi convidado'} para fazer parte da organização
                <strong style="color:#2563eb;">${orgName}</strong> no WHITE ZAP.
              </p>

              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
                <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#1d4ed8;text-transform:uppercase;letter-spacing:1px;">Organização</p>
                <p style="margin:0;font-size:18px;font-weight:700;color:#1e3a8a;">${orgName}</p>
              </div>

              <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6;">
                Com o WHITE ZAP você acessa agentes de IA, automações, campanhas, conversas e muito mais — tudo em um só lugar.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a
                      href="${acceptUrl}"
                      style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:10px;letter-spacing:0.3px;"
                    >
                      Aceitar convite →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.6;">
                Ou copie e cole este link no seu navegador:<br/>
                <a href="${acceptUrl}" style="color:#2563eb;word-break:break-all;">${acceptUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;">
                Este convite expira em <strong>7 dias</strong>. Se você não esperava este convite, pode ignorar este e-mail.
              </p>
              <p style="margin:0;font-size:12px;color:#cbd5e1;">
                © ${new Date().getFullYear()} WHITE ZAP · Plataforma de Agentes IA
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html }
}
