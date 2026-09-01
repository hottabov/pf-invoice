import { describe, it, expect } from "vitest";
import { resolveReplyTo } from "@/lib/email/reply-to";

const FALLBACK = "sales@pathfindercut.com";

describe("resolveReplyTo", () => {
  it("prefers the document author, so a client's reply reaches the manager who built the quote", () => {
    expect(
      resolveReplyTo({ email: "john@pathfindercut.com", name: "John Smith", active: true }, FALLBACK)
    ).toBe("John Smith <john@pathfindercut.com>");
  });

  it("sends a bare address when the author has no name set", () => {
    expect(resolveReplyTo({ email: "john@pathfindercut.com", name: null, active: true }, FALLBACK)).toBe(
      "john@pathfindercut.com"
    );
  });

  it("falls back when there is no author at all", () => {
    expect(resolveReplyTo(null, FALLBACK)).toBe(FALLBACK);
    expect(resolveReplyTo(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it("falls back when the author has been deactivated", () => {
    // A deactivated manager has left or changed roles. Their mailbox is
    // probably gone, so a reply routed there would vanish silently — worse
    // than landing in the shared sales inbox.
    expect(
      resolveReplyTo({ email: "gone@pathfindercut.com", name: "Gone", active: false }, FALLBACK)
    ).toBe(FALLBACK);
  });

  it("falls back when the author's address is blank", () => {
    expect(resolveReplyTo({ email: "", name: "X", active: true }, FALLBACK)).toBe(FALLBACK);
    expect(resolveReplyTo({ email: "   ", name: "X", active: true }, FALLBACK)).toBe(FALLBACK);
  });

  it("returns undefined rather than an empty header when nothing is configured", () => {
    expect(resolveReplyTo(null, "")).toBeUndefined();
    expect(resolveReplyTo(null, "   ")).toBeUndefined();
    expect(resolveReplyTo(null, undefined)).toBeUndefined();
  });

  it("still uses the author when no fallback is configured", () => {
    expect(resolveReplyTo({ email: "john@pathfindercut.com", name: "John", active: true }, "")).toBe(
      "John <john@pathfindercut.com>"
    );
  });

  it("quotes a display name containing RFC 5322 specials", () => {
    // "Smith, John <...>" unquoted parses as two addresses and the header is
    // rejected or mangled by the receiving MTA.
    expect(
      resolveReplyTo({ email: "j@pathfindercut.com", name: "Smith, John", active: true }, FALLBACK)
    ).toBe('"Smith, John" <j@pathfindercut.com>');
  });

  it("escapes quotes and backslashes inside a quoted display name", () => {
    expect(
      resolveReplyTo({ email: "j@pathfindercut.com", name: 'John "JD" Smith', active: true }, FALLBACK)
    ).toBe('"John \\"JD\\" Smith" <j@pathfindercut.com>');
  });

  it("trims surrounding whitespace on name and address", () => {
    expect(
      resolveReplyTo({ email: "  j@pathfindercut.com  ", name: "  John  ", active: true }, `  ${FALLBACK}  `)
    ).toBe("John <j@pathfindercut.com>");
  });

  it("treats a whitespace-only name as no name", () => {
    expect(resolveReplyTo({ email: "j@pathfindercut.com", name: "   ", active: true }, FALLBACK)).toBe(
      "j@pathfindercut.com"
    );
  });

  it("defaults a missing active flag to active", () => {
    // Callers selecting a narrow set of columns shouldn't accidentally route
    // every reply to the fallback.
    expect(resolveReplyTo({ email: "j@pathfindercut.com", name: "John" }, FALLBACK)).toBe(
      "John <j@pathfindercut.com>"
    );
  });

  it("never emits a header containing CR or LF", () => {
    // Header injection: a name is user-editable in settings, and a newline
    // would let it forge additional headers.
    const out = resolveReplyTo(
      { email: "j@pathfindercut.com", name: "John\r\nBcc: attacker@evil.com", active: true },
      FALLBACK
    );
    expect(out).not.toMatch(/[\r\n]/);
  });
});
