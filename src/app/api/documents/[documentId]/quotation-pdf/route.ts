import { auth } from "@/auth";
import { getDocumentForBuilder } from "@/lib/queries/documents";
import { getContentBlocksForRegion } from "@/lib/queries/content";
import { buildQuotationData } from "@/lib/quotation-data";
import { renderQuotationHtml, htmlToPdf, fileImageResolver, quotationPdfFilename } from "@/lib/pdf";

// `react-dom/server` (used transitively via src/lib/pdf.ts) and Gotenberg's
// HTTP call both need the Node runtime — not available on the edge runtime.
export const runtime = "nodejs";

type Params = { documentId: string };

/**
 * Streams a QUOTE document (DRAFT or FINAL) back as a downloadable extended
 * quotation PDF — the content-block-driven equipment write-up, terms,
 * general conditions and RSP detail, as opposed to `/api/documents/
 * [documentId]/pdf`'s plain line-item summary. Loads and scopes the
 * document exactly like that route, then 404s for an INVOICE (there's no
 * quotation renderer for one) same as a foreign/nonexistent document. Every
 * image is inlined as a base64 data URI via `fileImageResolver` — Gotenberg's
 * headless Chromium has no session cookie to hit the auth-gated
 * `/api/files/...` route with.
 */
export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await params;
  const document = await getDocumentForBuilder(session.user, documentId);
  if (!document || document.type !== "QUOTE") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const blocks = await getContentBlocksForRegion(document.regionId);
  const quotationData = buildQuotationData(document, blocks, { resolveImage: fileImageResolver });
  const html = await renderQuotationHtml(quotationData);

  let pdf: Buffer;
  try {
    pdf = await htmlToPdf(html);
  } catch (error) {
    console.error("Quotation PDF generation failed", error);
    return Response.json({ error: "PDF service unavailable" }, { status: 502 });
  }

  const filename = quotationPdfFilename(document.number);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
