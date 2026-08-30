import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, Download } from "lucide-react";
import { auth } from "@/auth";
import { getDocumentForBuilder } from "@/lib/queries/documents";
import { toSheetData } from "@/lib/sheet-data";
import { DocumentSheet } from "@/components/sheet/document-sheet";
import { buttonVariants } from "@/components/ui/button";
import { StatusBadge, STATUS_TONE } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

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
 *
 * The chrome around the sheet (this file) is restyled per phase 5b; the
 * sheet itself (`DocumentSheet`) is print-critical and untouched.
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
  const statusLabel = document.status === "DRAFT" ? "Draft" : "Final";
  const numberLabel = document.number ?? `${document.type === "QUOTE" ? "Quote" : "Invoice"} draft`;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/documents/${document.id}`}
            className="focus-ring -my-1 inline-flex items-center gap-1 rounded-md py-1 text-sm font-medium text-slate-500 transition-colors hover:text-brand-dark"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Back to editor
          </Link>
          <span className="h-4 w-px shrink-0 bg-slate-200" aria-hidden="true" />
          <span className="truncate font-mono text-sm text-brand-dark">{numberLabel}</span>
          <StatusBadge tone={STATUS_TONE[document.status]} className="shrink-0">
            {statusLabel}
          </StatusBadge>
        </div>
        <a
          href={`/api/documents/${document.id}/pdf`}
          className={cn(buttonVariants(), "h-11 w-full bg-brand text-white hover:bg-brand/90 sm:w-auto")}
        >
          <Download className="size-4" data-icon="inline-start" aria-hidden="true" />
          Download PDF
        </a>
      </div>

      <div className="overflow-x-auto rounded-xl bg-slate-100 p-4 sm:p-8">
        <div className="mx-auto w-fit shadow-lg">
          <DocumentSheet data={sheetData} />
        </div>
      </div>
    </div>
  );
}
