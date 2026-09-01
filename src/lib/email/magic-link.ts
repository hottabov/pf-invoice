// Magic-link sign-in email.
//
// Kept separate from `src/auth.ts` (which only wires up the SMTP transport) so
// the template is a pure function: no Prisma, no NextAuth, no env reads, and
// therefore unit-testable. See tests/magic-link-email.test.ts.
//
// Auth.js ships a default template, but it lives at an unexported deep path
// inside @auth/core and is branded "Auth.js". Ours also needs a Reply-To,
// because the From address (noreply@q.pathfindercut.com) is on the Resend
// sending subdomain and receives nothing.

const PRODUCT_NAME = "PathQuote";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type MagicLinkEmailInput = {
  /** The one-time Auth.js callback URL. */
  url: string;
  /** Address a human actually reads. Blank/whitespace is treated as unset. */
  replyTo?: string;
  /** Link lifetime, for the copy only. Should match the provider's `maxAge`. */
  maxAgeMinutes?: number;
};

export type MagicLinkEmail = {
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
};

export function buildMagicLinkEmail({
  url,
  replyTo,
  maxAgeMinutes = 15,
}: MagicLinkEmailInput): MagicLinkEmail {
  const href = escapeHtml(url);
  const validFor = `${maxAgeMinutes} minutes`;

  const text = [
    `Sign in to ${PRODUCT_NAME}`,
    "",
    "Open this link to sign in:",
    url,
    "",
    `The link is valid for ${validFor} and can only be used once.`,
    "If you didn't request it, you can ignore this email.",
  ].join("\n");

  // Table-based layout and inline styles: Outlook (the recipients here are on
  // Microsoft 365) ignores <style> blocks and most modern CSS.
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:8px;padding:32px;">
            <tr>
              <td style="font-size:18px;font-weight:600;padding-bottom:16px;">Sign in to ${PRODUCT_NAME}</td>
            </tr>
            <tr>
              <td style="font-size:14px;line-height:22px;padding-bottom:24px;">Click the button below to sign in.</td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;">
                <a href="${href}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;">Sign in</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:12px;line-height:20px;color:#666;">
                The link is valid for ${validFor} and can only be used once.<br />
                If you didn't request it, you can ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const trimmedReplyTo = replyTo?.trim();

  return {
    subject: `Sign in to ${PRODUCT_NAME}`,
    text,
    html,
    replyTo: trimmedReplyTo ? trimmedReplyTo : undefined,
  };
}
