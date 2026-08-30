import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Download } from "lucide-react";
import { auth } from "@/auth";
import { getDocumentForBuilder } from "@/lib/queries/documents";
import { toSheetData } from "@/lib/sheet-data";
import { DocumentSheet } from "@/components/sheet/document-sheet";

export const dynamic = "force-dynamic";

type Params = { documentId: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { documentId } = await params;
  // Metadata runs before the page body — re-check scope here too so a
  // manager browsing to a foreign document's preview URL never even sees
  // its number/type in the tab title.
  const session = (await auth())!;
  const document = await getDocumentForBuilder(session.user, documentId);
  if (!document) return { title: "Preview" };
  return { title: document.number ? `${document.number} — preview` : "Preview" };
}

/**
 * Read-only render of the same `DocumentSheet` the PDF route (Task C) posts
 * to Gotenberg — lets an author sanity-check layout/content in the browser
 * before downloading. Images are passed straight through as their stored
 * `/api/files/<name>` URL (the default `toSheetData` resolver): unlike the
 * PDF pipeline, this page runs in an already-authenticated browser tab, so
 * the auth-gated file route just works.
 */
export default async function DocumentPreviewPage({ params }: { params: Promise<Params> }) {
  const { documentId } = await params;
  // AppLayout (src/app/(app)/layout.tsx) already calls requireSession and
  // redirects unauthenticated requests, so a session is always present here.
  const session = (await auth())!;

  const document = await getDocumentForBuilder(session.user, documentId);
  // A foreign document (belongs to another manager) resolves to the same
  // `null` as a nonexistent one — never leak which case it was.
  if (!document) notFound();

  const sheetData = toSheetData(document);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3">
        <Link
          href={`/documents/${document.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-brand-dark"
        >
          <ArrowLeft className="size-4" />
          Back to editor
        </Link>
        <a
          href={`/api/documents/${document.id}/pdf`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-2.5 text-sm font-medium text-white hover:bg-brand/90"
        >
          <Download className="size-4" />
          Download PDF
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl bg-zinc-200 p-4 sm:p-8">
        <div className="mx-auto w-fit shadow-lg">
          <DocumentSheet data={sheetData} />
        </div>
      </div>
    </div>
  );
}
