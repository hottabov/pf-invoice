// The one SMTP sender this app configures — read `src/auth.ts`'s Nodemailer
// provider before touching this file. Magic-link sign-in builds a transport
// inline (`createTransport(provider.server)` inside its own
// `sendVerificationRequest`) from the same `SMTP_*`/`EMAIL_FROM` env vars
// documented in docs/email-sending-setup.md and exercised by
// scripts/send-test-email.ts. This module exists so the support-message
// action (src/lib/actions/support.ts) reuses that exact configuration
// instead of standing up a second sender — "the app already has a working
// SMTP setup; use it" is the whole point.
import { createTransport, type Transporter } from "nodemailer";

/**
 * Built fresh per call rather than held as a long-lived singleton — same
 * choice auth.ts makes, and for the same reason: a serverless/edge-adjacent
 * Next.js runtime has no good lifecycle hook to close a long-lived
 * connection, and nodemailer transports are cheap to construct (no
 * connection is opened until `sendMail`/`verify` actually runs).
 */
export function createAppMailTransport(): Transporter {
  return createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/** The From address every outgoing mail — magic-link or support — uses. */
export function mailFromAddress(): string | undefined {
  return process.env.EMAIL_FROM;
}
