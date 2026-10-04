/** Escapowanie wartości wstawianych do HTML wiadomości (utwardzenie - dane od operatora i z importu). */
function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Link tylko http(s) - inne schematy (np. javascript:) nie trafiają do wiadomości. */
function safeHref(url: string): string {
  return /^https?:\/\//i.test(url) ? esc(url) : "#";
}

/** Temat wiadomości: bez znaków nowej linii (ochrona przed wstrzyknięciem nagłówków). */
function subjectLine(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim();
}

function wrap(orgName: string, bodyHtml: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0F172A;">
      <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748B; margin-bottom: 16px;">${esc(orgName)}</div>
      ${bodyHtml}
      <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 24px 0 12px;" />
      <div style="font-size: 11px; color: #64748B;">Wiadomość wygenerowana automatycznie przez iOBRADY.</div>
    </div>
  `;
}

export function welcomeEmail(opts: { orgName: string; firstName: string; lastName: string; email: string; password: string; loginUrl: string }): { subject: string; html: string } {
  return {
    subject: subjectLine(`${opts.orgName} - dane logowania do systemu`),
    html: wrap(opts.orgName, `
      <p>Dzień dobry ${esc(opts.firstName)} ${esc(opts.lastName)},</p>
      <p>Utworzono dla Pani/Pana konto w systemie iOBRADY. Dane logowania:</p>
      <p><b>Adres logowania:</b> <a href="${safeHref(opts.loginUrl)}">${esc(opts.loginUrl)}</a><br/>
      <b>Login (e-mail):</b> ${esc(opts.email)}<br/>
      <b>Hasło:</b> ${esc(opts.password)}</p>
      <p>Przy pierwszym logowaniu system poprosi o ustawienie własnego hasła.</p>
    `),
  };
}

export function passwordResetEmail(opts: { orgName: string; firstName: string; lastName: string; email: string; password: string; loginUrl: string }): { subject: string; html: string } {
  return {
    subject: subjectLine(`${opts.orgName} - nowe hasło do systemu`),
    html: wrap(opts.orgName, `
      <p>Dzień dobry ${esc(opts.firstName)} ${esc(opts.lastName)},</p>
      <p>Hasło do konta zostało zresetowane. Nowe dane logowania:</p>
      <p><b>Adres logowania:</b> <a href="${safeHref(opts.loginUrl)}">${esc(opts.loginUrl)}</a><br/>
      <b>Login (e-mail):</b> ${esc(opts.email)}<br/>
      <b>Nowe hasło:</b> ${esc(opts.password)}</p>
    `),
  };
}

export function meetingAdHocEmail(opts: { orgName: string; subject: string; bodyText: string; publicUrl?: string }): { subject: string; html: string } {
  const paragraphs = opts.bodyText.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`).join("");
  return {
    subject: subjectLine(opts.subject),
    html: wrap(opts.orgName, `
      ${paragraphs}
      ${opts.publicUrl ? `<p><a href="${safeHref(opts.publicUrl)}">${esc(opts.publicUrl)}</a></p>` : ""}
    `),
  };
}
