import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Download, Eye } from "lucide-react";
import { auth } from "@/auth";
import {
  getDocumentForBuilder,
  getItemPickerCatalog,
  listClientPickerCompanies,
  listCompatibleOptions,
  type CompatibleOption,
} from "@/lib/queries/documents";
import {
  addCustomLine,
  addItem,
  deleteDraft,
  removeItem,
  removeLine,
  setDocumentClient,
  setDocumentDiscount,
  setItemDiscount,
  setItemOptions,
} from "@/lib/actions/documents";
import { finalizeDocument, unfinalizeDocument } from "@/lib/actions/finalize";
import { ClientSection } from "@/components/builder/client-section";
import { ItemsSection } from "@/components/builder/items-section";
import { ExtraLinesSection } from "@/components/builder/extra-lines-section";
import { DocumentDiscountField } from "@/components/builder/document-discount-field";
import { StickyFooter } from "@/components/builder/sticky-footer";
import { FinalizeButton } from "@/components/builder/finalize-button";
import { UnfinalizeButton } from "@/components/builder/unfinalize-button";

export const dynamic = "force-dynamic";

type Params = { documentId: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { documentId } = await params;
  // Metadata runs before the page body — re-check scope here too so a
  // manager browsing to a foreign document never even sees its number/type
  // in the tab title.
  const session = (await auth())!;
  const document = await getDocumentForBuilder(session.user, documentId);
  if (!document) return { title: "Document" };
  return { title: document.number ?? (document.type === "QUOTE" ? "New quote" : "New invoice") };
}

export default async function DocumentBuilderPage({ params }: { params: Promise<Params> }) {
  const { documentId } = await params;
  // AppLayout (src/app/(app)/layout.tsx) already calls requireSession and
  // redirects unauthenticated requests, so a session is always present here.
  const session = (await auth())!;

  const document = await getDocumentForBuilder(session.user, documentId);
  // A foreign document (belongs to another manager) resolves to the same
  // `null` as a nonexistent one — never leak which case it was.
  if (!document) notFound();

  const isDraft = document.status === "DRAFT";

  const [companies, catalog] = await Promise.all([
    listClientPickerCompanies(session.user),
    getItemPickerCatalog(document.regionCode),
  ]);

  // Compatible options are preloaded once per distinct (productId, seriesId)
  // pair across the document's items (not once per item) — most documents
  // have items from a handful of products at most, so this is a small,
  // cheap fan-out. Keyed by productId when available (compatibility can
  // differ product-to-product within the same series, e.g. EasyLoader
  // accessories only for EL-2020) and falling back to `series:<seriesId>`
  // for the defensive case of an item whose product no longer resolves
  // (see `BuilderItem.productId`'s doc comment).
  const compatKeys = new Map<string, { productId: string | null; seriesId: string | null }>();
  for (const item of document.items) {
    if (!item.productId && !item.seriesId) continue;
    const key = item.productId ?? `series:${item.seriesId}`;
    if (!compatKeys.has(key)) compatKeys.set(key, { productId: item.productId, seriesId: item.seriesId });
  }
  const compatibleOptionsEntries = await Promise.all(
    Array.from(compatKeys.entries()).map(
      async ([key, { productId, seriesId }]) =>
        [key, await listCompatibleOptions(productId, seriesId, document.regionId)] as const
    )
  );
  const compatibleOptionsByItemKey: Record<string, CompatibleOption[]> = Object.fromEntries(
    compatibleOptionsEntries
  );

  const isAdmin = session.user.role === "ADMIN";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {document.type === "QUOTE" ? "Quote" : "Invoice"}
            {document.number ? ` · ${document.number}` : " · draft"}
          </p>
          <h1 className="text-xl font-semibold text-brand-dark">
            {document.company?.name ?? "New " + document.type.toLowerCase()}
          </h1>
          {!isDraft && (
            <p className="mt-1 text-xs text-muted-foreground">
              This document is final and read-only.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-start gap-2">
          {document.number ? (
            <span className="inline-flex h-8 items-center rounded-full border border-emerald-300 bg-emerald-50 px-3 text-sm font-medium text-emerald-700">
              {document.number}
            </span>
          ) : null}

          <Link
            href={`/documents/${document.id}/preview`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            <Eye className="size-4" />
            Preview
          </Link>

          {/* Available for DRAFT too — /api/documents/[id]/pdf renders a
              watermarked PDF for drafts (see that route), it's not
              FINAL-only. */}
          <a
            href={`/api/documents/${document.id}/pdf`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            <Download className="size-4" />
            Download PDF
          </a>

          {isDraft ? (
            <FinalizeButton documentId={document.id} finalizeAction={finalizeDocument} />
          ) : isAdmin ? (
            <UnfinalizeButton documentId={document.id} unfinalizeAction={unfinalizeDocument} />
          ) : null}
        </div>
      </div>

      <ClientSection
        documentId={document.id}
        companies={companies}
        initialCompanyId={document.company?.id ?? null}
        initialContactId={document.contactId}
        setClientAction={setDocumentClient}
        readOnly={!isDraft}
      />

      <ItemsSection
        documentId={document.id}
        items={document.items}
        currency={document.currency}
        catalog={catalog}
        compatibleOptionsByItemKey={compatibleOptionsByItemKey}
        removeItemAction={removeItem}
        addItemAction={addItem}
        setItemOptionsAction={setItemOptions}
        setItemDiscountAction={setItemDiscount}
        readOnly={!isDraft}
      />

      <ExtraLinesSection
        documentId={document.id}
        lines={document.extraLines}
        currency={document.currency}
        addCustomLineAction={addCustomLine}
        removeLineAction={removeLine}
        readOnly={!isDraft}
      />

      <section className="rounded-xl border border-border bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-brand-dark">Discounts</h2>
        <div className="mt-3">
          <DocumentDiscountField
            documentId={document.id}
            discountPct={document.discountPct}
            setDiscountAction={setDocumentDiscount}
            readOnly={!isDraft}
          />
        </div>
      </section>

      <StickyFooter
        type={document.type}
        status={document.status}
        taxName={document.taxName}
        taxRate={document.taxRate}
        subtotal={document.subtotal}
        discountPct={document.discountPct}
        discountAmount={document.discountAmount}
        taxAmount={document.taxAmount}
        total={document.total}
        currency={document.currency}
        deleteAction={isDraft ? deleteDraft.bind(null, document.id) : undefined}
      />
    </div>
  );
}
