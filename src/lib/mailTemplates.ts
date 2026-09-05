function wrap(orgName: string, bodyHtml: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0F172A;">
      <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748B; margin-bottom: 16px;">${orgName}</div>
      ${bodyHtml}
      <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0 12px;" />
      <div style="font-size: 11px; color: #64748B;">Wiadomość wygenerowana automatycznie przez iOBRADY.</div>
    </div>
  `;
}

export function welcomeEmail(opts: { orgName: string; firstName: string; lastName: string; email: string; password: string; loginUrl: string }): { subject: string; html: string } {
  return {
    subject: `${opts.orgName} - dane logowania do systemu`,
    html: wrap(opts.orgName, `
      <p>Dzień dobry ${opts.firstName} ${opts.lastName},</p>
      <p>Utworzono dla Pani/Pana konto w systemie iOBRADY. Dane logowania:</p>
      <p><b>Adres logowania:</b> <a href="${opts.loginUrl}">${opts.loginUrl}</a><br/>
      <b>Login (e-mail):</b> ${opts.email}<br/>
      <b>Hasło:</b> ${opts.password}</p>
      <p>Zalecamy zmianę hasła po pierwszym logowaniu.</p>
    `),
  };
}

export function passwordResetEmail(opts: { orgName: string; firstName: string; lastName: string; email: string; password: string; loginUrl: string }): { subject: string; html: string } {
  return {
    subject: `${opts.orgName} - nowe hasło do systemu`,
    html: wrap(opts.orgName, `
      <p>Dzień dobry ${opts.firstName} ${opts.lastName},</p>
      <p>Hasło do konta zostało zresetowane. Nowe dane logowania:</p>
      <p><b>Adres logowania:</b> <a href="${opts.loginUrl}">${opts.loginUrl}</a><br/>
      <b>Login (e-mail):</b> ${opts.email}<br/>
      <b>Nowe hasło:</b> ${opts.password}</p>
    `),
  };
}

export function meetingAdHocEmail(opts: { orgName: string; subject: string; bodyText: string; publicUrl?: string }): { subject: string; html: string } {
  const paragraphs = opts.bodyText.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("");
  return {
    subject: opts.subject,
    html: wrap(opts.orgName, `
      ${paragraphs}
      ${opts.publicUrl ? `<p><a href="${opts.publicUrl}">${opts.publicUrl}</a></p>` : ""}
    `),
  };
}
