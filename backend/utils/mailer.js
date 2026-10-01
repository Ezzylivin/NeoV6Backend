// File: backend/utils/mailer.js
// SMTP email via Nodemailer, configured entirely from env vars (set on Render):
//   SMTP_HOST, SMTP_PORT (587 STARTTLS or 465 SSL), SMTP_USER, SMTP_PASS, MAIL_FROM
//   FRONTEND_URL (for the verify link; falls back to the first ALLOWED_ORIGINS)
// If SMTP isn't configured, every send is a logged no-op — nothing in the app
// breaks, emails are just skipped until you add the credentials.
//
// nodemailer is loaded LAZILY (dynamic import) so that if the package is missing
// or fails to resolve on the host, it degrades to a no-op instead of crashing the
// whole server at boot (an import failure here would take the API down).
let _nodemailer = null;
async function loadNodemailer() {
  if (_nodemailer) return _nodemailer;
  try {
    _nodemailer = (await import("nodemailer")).default;
  } catch (e) {
    console.error("[mailer] nodemailer unavailable — email disabled:", e.message);
    _nodemailer = null;
  }
  return _nodemailer;
}

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

const FRONTEND_URL =
  (process.env.FRONTEND_URL ||
    (process.env.ALLOWED_ORIGINS || "").split(",")[0] ||
    "https://neo-v6-git-main-eric-dickersons-projects-94391fd0.vercel.app")
    .trim()
    .replace(/\/$/, "");

let transporter = null;

export function isMailConfigured() {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

async function getTransport() {
  if (!isMailConfigured()) return null;
  if (!transporter) {
    const nm = await loadNodemailer();
    if (!nm) return null; // package missing on host — degrade to no-op
    const port = Number(SMTP_PORT) || 587;
    transporter = nm.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendMail({ to, subject, html, text }) {
  if (!to) return { sent: false, reason: "no_recipient" };
  const t = await getTransport();
  if (!t) {
    console.warn(`[mailer] SMTP unavailable — skipped "${subject}" to ${to}`);
    return { sent: false, reason: "not_configured" };
  }
  try {
    await t.sendMail({ from: MAIL_FROM || SMTP_USER, to, subject, html, text: text || undefined });
    return { sent: true };
  } catch (e) {
    console.error(`[mailer] send failed to ${to}: ${e.message}`);
    return { sent: false, reason: e.message };
  }
}

const shell = (title, body) => `
<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#0b0f14;color:#e7eef6;padding:24px;border-radius:12px;max-width:520px;margin:auto;border:1px solid #1f2b38">
  <h2 style="color:#34d399;margin:0 0 10px">${title}</h2>
  ${body}
  <p style="color:#6b7684;font-size:11px;margin-top:22px">NeoV6 Trading · automated message · paper mode</p>
</div>`;

export async function sendVerificationEmail(to, token) {
  const link = `${FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}`;
  return sendMail({
    to,
    subject: "Verify your NeoV6 email",
    html: shell("Verify your email", `
      <p>Welcome to NeoV6. Confirm this address to activate trade alerts and secure your account:</p>
      <p style="margin:18px 0"><a href="${link}" style="background:#34d399;color:#04110b;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:700">Verify email</a></p>
      <p style="color:#8aa0b4;font-size:12px">Or paste this link into your browser:<br>${link}</p>
      <p style="color:#6b7684;font-size:11px">This link expires in 24 hours.</p>`),
    text: `Verify your NeoV6 email: ${link}`,
  });
}

export async function sendTradeAlert(to, ev) {
  const side = String(ev.side || "").toUpperCase();
  const isEntry = (ev.action || ev.type) === "entry";
  const win = Number(ev.pnl) >= 0;
  const title = isEntry
    ? `🚀 ${ev.symbol} ${side} opened`
    : `${win ? "🟢" : "🔴"} ${ev.symbol} ${side} closed`;
  const body = isEntry
    ? `<p>Entered <b>${ev.symbol} ${side}</b> at <b>$${ev.price}</b>.</p>`
    : `<p>Closed <b>${ev.symbol} ${side}</b> at <b>$${ev.price}</b>${ev.reason ? ` — ${ev.reason}` : ""}.</p>
       <p>P&amp;L: <b style="color:${win ? "#34d399" : "#f87171"}">${win ? "+" : ""}$${ev.pnl}</b></p>`;
  return sendMail({ to, subject: title, html: shell(title, body), text: title });
}
