import "dotenv/config";

/**
 * SMTP smoke test and deliverability bisect.
 *
 * Two jobs:
 *
 * 1. Prove the SMTP path works at all. The magic-link flow reports the same
 *    generic result whether or not mail was actually sent, so a broken config
 *    is invisible from the login page. This talks to SMTP directly and prints
 *    the real error.
 *
 * 2. Find out *which part of a message* a filter objects to. Observed
 *    2026-09-03: the support-notification email reaches an @pathfindercut.com
 *    mailbox, while the magic-link email — same sender, same recipient, same
 *    HTML skeleton — never arrives, even though Resend reports it delivered
 *    (i.e. Microsoft accepted it at SMTP and then filed it somewhere unseen).
 *    The one structural difference is that the magic link contains a clickable
 *    link to a two-day-old domain. The variants below change only the link
 *    treatment, so whichever ones arrive identify the trigger.
 *
 *   docker compose run --rm tools npx tsx scripts/send-test-email.ts you@example.com
 *   docker compose run --rm tools npx tsx scripts/send-test-email.ts you@example.com button
 */

const APP_URL = "https://q.pathfindercut.com/login?test=1";
// A high-reputation URL, to separate "any link is a problem" from "a link to
// our new domain is the problem".
const NEUTRAL_URL = "https://learn.microsoft.com/exchange/mail-flow/mail-flow";

type Variant = {
  /** What this variant is testing, printed and used in the subject. */
  label: string;
  /** Body block that differs between variants; everything else is identical. */
  htmlBlock: string;
  textBlock: string;
};

const VARIANTS: Record<string, Variant> = {
  nolink: {
    label: "no link at all (control — matches the support email that arrives)",
    htmlBlock: `<td style="font-size:14px;line-height:22px;">Your sign-in request has been recorded. No further action is needed.</td>`,
    textBlock: "Your sign-in request has been recorded. No further action is needed.",
  },
  plainlink: {
    label: "URL as visible plain text, not clickable",
    htmlBlock: `<td style="font-size:14px;line-height:22px;">Sign-in address:<br />${APP_URL}</td>`,
    textBlock: `Sign-in address:\n${APP_URL}`,
  },
  anchor: {
    label: "URL as a plain text link",
    htmlBlock: `<td style="font-size:14px;line-height:22px;">Sign-in address:<br /><a href="${APP_URL}">${APP_URL}</a></td>`,
    textBlock: `Sign-in address:\n${APP_URL}`,
  },
  button: {
    label: "styled button hiding the URL (what the real magic link does)",
    htmlBlock: `<td><a href="${APP_URL}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;">Sign in</a></td>`,
    textBlock: `Open this link to sign in:\n${APP_URL}`,
  },
  otherhost: {
    label: "styled button to a high-reputation domain",
    htmlBlock: `<td><a href="${NEUTRAL_URL}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;">Sign in</a></td>`,
    textBlock: `Open this link to sign in:\n${NEUTRAL_URL}`,
  },
};

function render(variant: Variant): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:8px;padding:32px;">
            <tr>
              <td style="font-size:18px;font-weight:600;padding-bottom:16px;">Sign in to PathQuote</td>
            </tr>
            <tr>
              ${variant.htmlBlock}
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function main() {
  const to = process.argv[2];
  const only = process.argv[3];

  if (!to) {
    console.error("usage: tsx scripts/send-test-email.ts <recipient@example.com> [variant]");
    console.error(`variants: ${Object.keys(VARIANTS).join(", ")} (default: all of them)`);
    process.exit(1);
  }
  if (only && !VARIANTS[only]) {
    console.error(`error: unknown variant "${only}"`);
    console.error(`variants: ${Object.keys(VARIANTS).join(", ")}`);
    process.exit(1);
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM, EMAIL_REPLY_TO } = process.env;

  const missing = Object.entries({ SMTP_HOST, SMTP_USER, SMTP_PASS, EMAIL_FROM })
    .filter(([, v]) => !v?.trim())
    .map(([k]) => k);
  if (missing.length) {
    console.error(`error: missing/empty env: ${missing.join(", ")}`);
    console.error("The container reads .env at creation time — `docker compose restart` will");
    console.error("NOT pick up edits. Use `docker compose up -d --force-recreate app`.");
    process.exit(1);
  }

  console.log("config:");
  console.log(`  host      ${SMTP_HOST}:${SMTP_PORT ?? 587}`);
  console.log(`  user      ${SMTP_USER}`);
  // Never print the key: it's a live sending credential.
  console.log(`  pass      ${SMTP_PASS!.slice(0, 6)}… (${SMTP_PASS!.length} chars)`);
  console.log(`  from      ${EMAIL_FROM}`);
  console.log(`  reply-to  ${EMAIL_REPLY_TO || "(none)"}`);
  console.log(`  to        ${to}`);
  console.log();

  const { createTransport } = await import("nodemailer");
  const { resolveReplyTo } = await import("../src/lib/email/reply-to");

  const transport = createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  // Separates "can't reach / can't authenticate" from "server rejected this
  // particular message".
  console.log("verifying connection + credentials…");
  await transport.verify();
  console.log("  ok\n");

  const names = only ? [only] : Object.keys(VARIANTS);
  const replyTo = resolveReplyTo(null, EMAIL_REPLY_TO);

  for (const name of names) {
    const variant = VARIANTS[name];
    // The subject carries the variant name so you can tell from the inbox
    // which ones survived without opening anything.
    const subject = `[test ${name}] Sign in to PathQuote`;

    console.log(`${name} — ${variant.label}`);
    const result = await transport.sendMail({
      to,
      from: EMAIL_FROM,
      replyTo,
      subject,
      text: `Sign in to PathQuote\n\n${variant.textBlock}\n`,
      html: render(variant),
    });
    console.log(`  accepted ${JSON.stringify(result.accepted)}  ${result.response}`);
  }

  console.log(`\nSent ${names.length} message(s). Now check the recipient's inbox, Junk, and the`);
  console.log("Microsoft 365 quarantine, and note which subjects arrived where.");
  console.log("\nHow to read the result:");
  console.log("  all arrive                     → content isn't the problem; look at rules/policy");
  console.log("  only 'nolink' arrives          → any URL trips the filter");
  console.log("  'otherhost' arrives, others not→ our domain's reputation is the trigger");
  console.log("  'plainlink' arrives, 'button' not → the hidden-URL button shape is the trigger");
}

main().catch((e) => {
  console.error("\nFAILED\n");
  console.error(e);
  console.error("\nCommon causes:");
  console.error("  535 / auth failed        → wrong or revoked API key in SMTP_PASS");
  console.error("  403 domain not verified  → q.pathfindercut.com not verified in Resend yet");
  console.error("  450/550 from-address     → EMAIL_FROM is not @ a domain verified in Resend");
  console.error("  ETIMEDOUT / ECONNREFUSED → outbound 587 blocked by the host firewall");
  process.exit(1);
});
