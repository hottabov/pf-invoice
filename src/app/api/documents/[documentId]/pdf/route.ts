import { auth } from "@/auth";
import { getDocumentForBuilder } from "@/lib/queries/documents";
import { toSheetData } from "@/lib/sheet-data";
import { renderDocumentHtml, htmlToPdf, fileImageResolver, pdfFilename } from "@/lib/pdf";

// `react-dom/server` (used transitively via src/lib/pdf.ts) and Gotenberg's
// HTTP call both need the Node runtime — not available on the edge runtime.
export const runtime = "nodejs";

type Params = { documentId: string };

/**
 * Streams a document (DRAFT or FINAL) back as a downloadable PDF: loads it
 * scoped to the caller exactly like the preview page does, maps it to
 * `DocSheetData` with every image inlined as a base64 data URI (see
 * `fileImageResolver` — Gotenberg's headless Chromium has no session cookie
 * to hit the auth-gated `/api/files/...` route with), renders the same
 * `DocumentSheet` markup the in-app preview shows, and posts it to Gotenberg
 * for conversion. A DRAFT renders with its watermark, same as the preview.
 */
export async function GET(_request: Request, { params }: { params: Promise<Params> }) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { documentId } = await params;
  const document = await getDocumentForBuilder(session.user, documentId);
  if (!document) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const sheetData = toSheetData(document, fileImageResolver);
  const html = await renderDocumentHtml(sheetData);

  let pdf: Buffer;
  try {
    pdf = await htmlToPdf(html);
  } catch (error) {
    console.error("PDF generation failed", error);
    return Response.json({ error: "PDF service unavailable" }, { status: 502 });
  }

  const filename = pdfFilename(document.number, document.id);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
