import { describe, it, expect } from "vitest";
import { buildMagicLinkEmail } from "@/lib/email/magic-link";

// A realistic Auth.js callback URL: the query string carries two params, so
// the `&` separator is the thing most likely to be mangled when the URL is
// interpolated into an href attribute.
const URL_WITH_PARAMS =
  "https://q.pathfindercut.com/api/auth/callback/nodemailer?callbackUrl=%2F&token=abc123&email=a%40b.com";

describe("buildMagicLinkEmail", () => {
  it("subjects the email with the product name, not the hostname", () => {
    const { subject } = buildMagicLinkEmail({ url: URL_WITH_PARAMS });
    expect(subject).toContain("PathQuote");
    expect(subject).not.toContain("q.pathfindercut.com");
  });

  it("puts the link in the plain-text body verbatim", () => {
    const { text } = buildMagicLinkEmail({ url: URL_WITH_PARAMS });
    expect(text).toContain(URL_WITH_PARAMS);
  });

  it("escapes the URL inside the href attribute", () => {
    const { html } = buildMagicLinkEmail({ url: URL_WITH_PARAMS });
    // Raw "&" in an attribute value is invalid HTML and gets rewritten by some
    // mail clients, which breaks the token. It must arrive as &amp;.
    expect(html).toContain("&amp;token=abc123");
    expect(html).not.toMatch(/href="[^"]*&token=/);
  });

  it("mentions how long the link is valid", () => {
    const { text, html } = buildMagicLinkEmail({ url: URL_WITH_PARAMS, maxAgeMinutes: 15 });
    expect(text).toContain("15 minutes");
    expect(html).toContain("15 minutes");
  });

  it("passes Reply-To through when configured", () => {
    const { replyTo } = buildMagicLinkEmail({
      url: URL_WITH_PARAMS,
      replyTo: "quotes@pathfindercut.com",
    });
    expect(replyTo).toBe("quotes@pathfindercut.com");
  });

  it("omits Reply-To when not configured, rather than sending an empty header", () => {
    expect(buildMagicLinkEmail({ url: URL_WITH_PARAMS }).replyTo).toBeUndefined();
    expect(buildMagicLinkEmail({ url: URL_WITH_PARAMS, replyTo: "" }).replyTo).toBeUndefined();
    expect(buildMagicLinkEmail({ url: URL_WITH_PARAMS, replyTo: "   " }).replyTo).toBeUndefined();
  });

  it("does not leak the raw URL into visible link text", () => {
    // The URL contains a single-use token; showing it as the anchor text makes
    // it trivially shoulder-surfable and looks like phishing.
    const { html } = buildMagicLinkEmail({ url: URL_WITH_PARAMS });
    expect(html).not.toContain(">https://q.pathfindercut.com/api/auth/callback");
  });
});
