// Server-only: HTML rendering + Gotenberg conversion for the document PDF
// pipeline (src/app/api/documents/[documentId]/pdf/route.ts). Kept separate
// from that route so `renderDocumentHtml`/`fileImageResolver` stay reachable
// from tests without spinning up a route handler.
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
import { DocumentSheet } from "@/components/sheet/document-sheet";
import { resolveUploadPath } from "@/lib/uploads";
import type { DocSheetData, ImageResolver } from "@/lib/sheet-data";

// --- HTML rendering -----------------------------------------------------

/**
 * Renders `DocumentSheet` to a full standalone HTML document — doctype,
 * charset, and an `@page` rule that fixes Gotenberg's headless Chromium to
 * A4 with 15mm margins (the same margins `DocumentSheet`'s own `.pq-content`
 * padding assumes visually, so the printed page and the in-app preview
 * match). `data` must already have every image resolved to something
 * Chromium can load with no further network/auth context — see
 * `fileImageResolver` below — since Gotenberg's Chromium never has this
 * app's session cookie.
 */
export async function renderDocumentHtml(data: DocSheetData): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const body = renderToStaticMarkup(DocumentSheet({ data }));
  return `<!doctype html><html><head><meta charSet="utf-8"><style>@page{size:A4;margin:15mm} body{margin:0}</style></head><body>${body}</body></html>`;
}

// --- Gotenberg conversion -------------------------------------------------

const GOTENBERG_TIMEOUT_MS = 30_000;

/**
 * Posts `html` to Gotenberg's Chromium-HTML endpoint and returns the
 * resulting PDF bytes. Margins are pinned to 0 here because `@page` inside
 * the HTML itself (see `renderDocumentHtml`) already reserves the 15mm
 * margin as part of the page content — doubling it up via Gotenberg's own
 * margin options would push the sheet's own padding further in than
 * intended.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const baseUrl = process.env.GOTENBERG_URL;
  if (!baseUrl) {
    throw new Error("GOTENBERG_URL is not configured");
  }

  const form = new FormData();
  form.set("files", new Blob([html], { type: "text/html" }), "index.html");
  form.set("paperWidth", "8.27");
  form.set("paperHeight", "11.69");
  form.set("marginTop", "0");
  form.set("marginBottom", "0");
  form.set("marginLeft", "0");
  form.set("marginRight", "0");

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
 * The PDF's downloaded filename: the document's number when it has one
 * (a FINAL document), or `draft-<id>` for a DRAFT. Strips everything except
 * word characters/dot/dash/underscore so a value can never break out of the
 * `Content-Disposition` header's quoted-string (e.g. embedded `"`, CR/LF, or
 * other header-splitting characters) — document numbers are server-
 * generated (see formatDocNumber) and never contain such characters, but
 * this stays defensive since the header value is otherwise attacker-
 * adjacent (id is a route param).
 */
export function pdfFilename(number: string | null, id: string): string {
  const raw = number ?? `draft-${id}`;
  const sanitized = raw.replace(/[^\w.-]+/g, "_");
  return `${sanitized}.pdf`;
}
