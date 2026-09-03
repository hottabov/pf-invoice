// Server-only: HTML rendering + Gotenberg conversion for the quotation PDF
// pipeline (src/app/api/documents/[documentId]/quotation-pdf/route.ts).
// Kept separate from that route so `renderQuotationHtml`/`fileImageResolver`
// stay reachable from tests without spinning up a route handler.
//
// `renderToStaticMarkup` comes from "react-dom/server". Next's bundler
// statically forbids importing that module from anything reachable through
// the RSC module graph — even from a plain route handler pinned to
// `export const runtime = "nodejs"` — because it can't prove at build time
// that this file is never pulled into a Server Component tree (see the
// `next build` error this sidesteps: "You're importing a component that
// imports react-dom/server..."). A dynamic `import()` inside the function
// (rather than a top-level static import) isn't subject to that same
// static-analysis check, and Node only ever resolves it once, on first
// call, from this route's own server bundle.
import { readFileSync } from "fs";
import { QuotationSheet } from "@/components/sheet/quotation-sheet";
import { resolveUploadPath } from "@/lib/uploads";
import type { ImageResolver } from "@/lib/sheet-data";
import type { QuotationData } from "@/lib/quotation-data";

// --- HTML rendering -----------------------------------------------------

/**
 * Renders `QuotationSheet` to a full standalone HTML document — doctype,
 * charset, and an `@page` rule that fixes Gotenberg's headless Chromium to
 * A4 with 15mm margins (the same margins `QuotationSheet`'s own
 * `.pq-content` padding assumes visually, so the printed page and the
 * in-app preview match). `data` must already have every image resolved to
 * something Chromium can load with no further network/auth context — see
 * `fileImageResolver` below — since Gotenberg's Chromium never has this
 * app's session cookie.
 */
export async function renderQuotationHtml(data: QuotationData): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const body = renderToStaticMarkup(QuotationSheet({ data }));
  return `<!doctype html><html><head><meta charSet="utf-8"><style>@page{size:A4;margin:15mm} body{margin:0}</style></head><body>${body}</body></html>`;
}

// --- footer -----------------------------------------------------------

/** Minimal HTML-escape — the document number is server-generated (see
 * `formatDocNumber`, src/lib/numbering.ts) and never expected to carry
 * markup, but it's still interpolated into HTML here, so it's escaped
 * rather than trusted to stay within its expected `Q-AU-2026-001` shape
 * forever. Same five-entity escape as `escapeHtml` in src/lib/markdown.ts,
 * duplicated locally (that one isn't exported) rather than importing a
 * markdown-rendering module for one string helper. */
function escapeHtmlAttr(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Gotenberg substitutes the pageNumber/totalPages spans from Chromium's own
 * print classes; everything else is literal markup. Font size is set inline
 * because the footer is rendered in its own document with no stylesheet. */
export function buildFooterHtml(documentNumber: string | null): string {
  const left = escapeHtmlAttr(documentNumber ?? "Draft");
  return `<div style="width:100%;font-size:8px;font-family:sans-serif;color:#666;padding:0 12mm;display:flex;justify-content:space-between;">
  <span>${left}</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>`;
}

// --- Gotenberg conversion -------------------------------------------------

const GOTENBERG_TIMEOUT_MS = 30_000;

/**
 * Posts `html` to Gotenberg's Chromium-HTML endpoint and returns the
 * resulting PDF bytes. Margins are pinned to 0 here because `@page` inside
 * the HTML itself (see `renderQuotationHtml`) already reserves the 15mm
 * margin as part of the page content — doubling it up via Gotenberg's own
 * margin options would push the sheet's own padding further in than
 * intended.
 *
 * `footerHtml` (see `buildFooterHtml`) is optional so callers that don't
 * pass one keep today's exact zero-margin behavior. When it IS passed,
 * Chromium's `header.html`/`footer.html` mechanism renders it INSIDE the
 * `marginBottom` band from `Page.printToPDF` — a completely separate
 * reservation from the `@page{margin:15mm}` CSS rule the sheet's own content
 * relies on. With `marginBottom` left at 0, Gotenberg would have no room to
 * place the footer and it would be clipped, so a non-zero `marginBottom` is
 * set whenever a footer is supplied (~10mm — enough for the single-line
 * footer `buildFooterHtml` builds). That reservation stacks on top of, not
 * instead of, the sheet's own 15mm bottom padding, so page content simply
 * ends a little higher up the page — never clipped.
 */
export async function htmlToPdf(html: string, footerHtml?: string): Promise<Buffer> {
  const baseUrl = process.env.GOTENBERG_URL;
  if (!baseUrl) {
    throw new Error("GOTENBERG_URL is not configured");
  }

  const form = new FormData();
  form.set("files", new Blob([html], { type: "text/html" }), "index.html");
  form.set("paperWidth", "8.27");
  form.set("paperHeight", "11.69");
  form.set("marginTop", "0");
  form.set("marginBottom", footerHtml ? "0.4" : "0");
  form.set("marginLeft", "0");
  form.set("marginRight", "0");
  if (footerHtml) {
    // `printBackground` isn't needed here — `buildFooterHtml`'s markup has
    // no background of its own — so it's left at Gotenberg's default rather
    // than turned on for a case that doesn't use it.
    form.append("files", new Blob([footerHtml], { type: "text/html" }), "footer.html");
  }

  const response = await fetch(`${baseUrl}/forms/chromium/convert/html`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(GOTENBERG_TIMEOUT_MS),
  });

  if (!response.ok) {
    const snippet = (await response.text().catch(() => "")).slice(0, 500);
    throw new Error(`Gotenberg returned ${response.status}: ${snippet}`);
  }

  const buf = await response.arrayBuffer();
  return Buffer.from(buf);
}

// --- image resolution -----------------------------------------------------

const FILE_URL_PATTERN = /^\/api\/files\/(.+)$/;

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/**
 * `ImageResolver` (see src/lib/sheet-data.ts) for the PDF pipeline: turns a
 * stored `/api/files/<name>` URL — auth-gated, so Gotenberg's Chromium could
 * never load it directly — into a base64 `data:` URI read straight off
 * disk via `resolveUploadPath`. Used for both item thumbnails and the
 * entity logo (`entitySnapshot.logoUrl` / live region `logoUrl` both funnel
 * through this same `/api/files/...` shape before reaching here). Any
 * failure — non-matching URL, path-traversal rejection, missing file, read
 * error — returns `undefined` so the sheet simply skips the image rather
 * than failing the whole PDF render.
 */
export const fileImageResolver: ImageResolver = (url) => {
  try {
    const match = FILE_URL_PATTERN.exec(url);
    if (!match) return undefined;

    const filePath = resolveUploadPath(match[1]);
    if (!filePath) return undefined;

    const ext = match[1].slice(match[1].lastIndexOf(".") + 1).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) return undefined;

    const bytes = readFileSync(filePath);
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return undefined;
  }
};

// --- filename ---------------------------------------------------------------

/**
 * The quotation PDF's downloaded filename: `<number>-quotation.pdf` for a
 * finalized quote, `draft-quotation.pdf` for one still in draft — always
 * downloaded from a single already-open document, so there's no need to
 * disambiguate between drafts by id. Strips everything except word
 * characters/dot/dash/underscore so a value can never break out of the
 * `Content-Disposition` header's quoted-string (e.g. embedded `"`, CR/LF, or
 * other header-splitting characters) — document numbers are server-
 * generated (see formatDocNumber) and never contain such characters, but
 * this stays defensive regardless.
 */
export function quotationPdfFilename(number: string | null): string {
  const raw = `${number ?? "draft"}-quotation`;
  const sanitized = raw.replace(/[^\w.-]+/g, "_");
  return `${sanitized}.pdf`;
}
