import "dotenv/config";

/**
 * SMTP smoke test.
 *
 * The magic-link flow deliberately reports the same generic result whether or
 * not an email was actually sent, so a broken SMTP config is invisible from
 * the login page. This script talks to the SMTP server directly and prints the
 * real error.
 *
 *   docker compose run --rm tools npx tsx scripts/send-test-email.ts you@example.com
 */
async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("usage: tsx scripts/send-test-email.ts <recipient@example.com>");
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
  const { buildMagicLinkEmail } = await import("../src/lib/email/magic-link");
  const { resolveReplyTo } = await import("../src/lib/email/reply-to");

  const transport = createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  // Separates "can't reach / can't authenticate" from "server rejected this
  // particular message" (e.g. an unverified sending domain).
  console.log("verifying connection + credentials…");
  await transport.verify();
  console.log("  ok\n");

  const { subject, text, html } = buildMagicLinkEmail({
    url: "https://q.pathfindercut.com/login?test=1",
  });

  console.log("sending…");
  const result = await transport.sendMail({
    to,
    from: EMAIL_FROM,
    replyTo: resolveReplyTo(null, EMAIL_REPLY_TO),
    subject: `[test] ${subject}`,
    text,
    html,
  });

  console.log(`  messageId ${result.messageId}`);
  console.log(`  accepted  ${JSON.stringify(result.accepted)}`);
  console.log(`  rejected  ${JSON.stringify(result.rejected)}`);
  console.log(`  response  ${result.response}`);
  console.log("\nSent. If it doesn't arrive, check the Resend dashboard → Emails for the");
  console.log("delivery status (bounced / blocked / delivered).");
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
