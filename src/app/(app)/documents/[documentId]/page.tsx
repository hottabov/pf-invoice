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
  type DocumentForBuilder,
} from "@/lib/queries/documents";
import { getShowOptionIcons } from "@/lib/queries/settings";
import {
  addCustomLine,
  addItem,
  createInvoiceFromQuote,
  deleteDraft,
  removeItem,
  removeLine,
  reorderItems,
  setDocumentClient,
  setDocumentDiscount,
  setDocumentNotes,
  setItemDiscount,
  setItemOptions,
  setItemShowImage,
  setPriceDisplay,
} from "@/lib/actions/documents";
import { PageHeader, SectionCard, StatusBadge, STATUS_TONE } from "@/components/ui-kit";
import { ClientSection } from "@/components/builder/client-section";
import { ItemsSection } from "@/components/builder/items-section";
import { ExtraLinesSection } from "@/components/builder/extra-lines-section";
import { DocumentDiscountField } from "@/components/builder/document-discount-field";
import { PriceDisplayToggles } from "@/components/builder/price-display-toggles";
import { NotesSection } from "@/components/builder/notes-section";
import { DocumentTotals, StickyFooter } from "@/components/builder/sticky-footer";
import { FinalizeButton } from "@/components/builder/finalize-button";
import { UnfinalizeButton } from "@/components/builder/unfinalize-button";
import { DeleteDraftButton } from "@/components/builder/delete-draft-button";
import { CreateInvoiceButton } from "@/components/builder/create-invoice-button";

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
  const isAdmin = session.user.role === "ADMIN";

  const [companies, catalog, showOptionIcons] = await Promise.all([
    listClientPickerCompanies(session.user),
    getItemPickerCatalog(document.regionCode),
    getShowOptionIcons(),
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

  const typeLabel = document.type === "QUOTE" ? "Quote" : "Invoice";
  const title = document.company?.name ?? `New ${typeLabel.toLowerCase()}`;
  const description = `${typeLabel} · ${document.number ?? "draft"}${!isDraft ? " — final and read-only" : ""}`;

  return (
    <div className="flex flex-col gap-6 pb-4">
      <PageHeader backHref="/documents" title={title} description={description} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        <div className="flex flex-col gap-4 lg:col-span-2">
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
            setItemShowImageAction={setItemShowImage}
            reorderItemsAction={reorderItems}
            showOptionIcons={showOptionIcons}
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

          <SectionCard title="Discounts">
            <DocumentDiscountField
              documentId={document.id}
              discountPct={document.discountPct}
              setDiscountAction={setDocumentDiscount}
              readOnly={!isDraft}
            />
          </SectionCard>

          {/* Both QUOTE and INVOICE — freeform remarks carried through to
              whichever renderer the document uses (see NotesSection's doc
              comment). */}
          <SectionCard title="Notes">
            <NotesSection
              documentId={document.id}
              notes={document.notes}
              setNotesAction={setDocumentNotes}
              readOnly={!isDraft}
            />
          </SectionCard>

          {/* QUOTE only — an INVOICE always shows full detail, no toggle
              needed (see setPriceDisplay's doc comment). */}
          {document.type === "QUOTE" ? (
            <SectionCard title="Quotation pricing display">
              <PriceDisplayToggles
                documentId={document.id}
                showItemPrices={document.showItemPrices}
                showOptionPrices={document.showOptionPrices}
                setPriceDisplayAction={setPriceDisplay}
                readOnly={!isDraft}
              />
            </SectionCard>
          ) : null}
        </div>

        {/* Desktop/tablet-lg summary: sticky so it stays visible while the
            left column's sections scroll. Hidden below lg — the mobile
            equivalent is the plain (non-sticky) block further down plus the
            sticky totals bar at the very bottom of the viewport. */}
        <aside className="hidden lg:sticky lg:top-6 lg:col-span-1 lg:block">
          <SectionCard title="Summary">
            <div className="flex flex-col gap-4">
              <DocumentSummaryHeader document={document} />
              <div className="border-t border-slate-100 pt-4">
                <DocumentTotals
                  taxName={document.taxName}
                  taxRate={document.taxRate}
                  subtotal={document.subtotal}
                  discountPct={document.discountPct}
                  discountAmount={document.discountAmount}
                  taxAmount={document.taxAmount}
                  total={document.total}
                  currency={document.currency}
                />
              </div>
              <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
                <DocumentActions document={document} isDraft={isDraft} isAdmin={isAdmin} />
              </div>
              {isDraft ? (
                <div className="border-t border-slate-100 pt-4">
                  <DeleteDraftButton action={deleteDraft.bind(null, document.id)} />
                </div>
              ) : null}
            </div>
          </SectionCard>
        </aside>
      </div>

      {/* Mobile/tablet: status, number and the same action stack as a plain
          block (totals stay exclusively in the sticky bar below so they're
          never shown twice on the same screen). */}
      <div className="lg:hidden">
        <SectionCard title="Status & actions">
          <div className="flex flex-col gap-4">
            <DocumentSummaryHeader document={document} />
            <DocumentActions document={document} isDraft={isDraft} isAdmin={isAdmin} />
          </div>
        </SectionCard>
      </div>

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

function DocumentSummaryHeader({ document }: { document: DocumentForBuilder }) {
  const isDraft = document.status === "DRAFT";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <StatusBadge tone={STATUS_TONE[document.status]}>{isDraft ? "Draft" : "Final"}</StatusBadge>
        {document.number ? (
          <span className="font-mono text-sm text-slate-600">{document.number}</span>
        ) : null}
      </div>
      {/* Set only for an INVOICE created via "Create invoice" from a QUOTE
          (see createInvoiceFromQuote) — links back to that quote's own
          builder page. */}
      {document.sourceQuoteId ? (
        <Link
          href={`/documents/${document.sourceQuoteId}`}
          className="focus-ring w-fit rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          From quote {document.sourceQuoteNumber ?? "draft"}
        </Link>
      ) : null}
    </div>
  );
}

const actionLinkClass =
  "focus-ring flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-brand-dark transition-colors md:hover:bg-slate-50";

function DocumentActions({
  document,
  isDraft,
  isAdmin,
}: {
  document: DocumentForBuilder;
  isDraft: boolean;
  isAdmin: boolean;
}) {
  // QUOTE documents get a second, content-block-driven "Quotation"
  // renderer (Phase 6) alongside the plain line-item sheet every document
  // type has always had — so on a QUOTE, that original pair is relabeled
  // "Summary" to distinguish it from the new "Quotation" pair. An INVOICE
  // has no quotation renderer at all, so its links stay exactly as they
  // were.
  const isQuote = document.type === "QUOTE";

  return (
    <div className="flex flex-col gap-2">
      {isDraft ? (
        <FinalizeButton documentId={document.id} />
      ) : isAdmin ? (
        <UnfinalizeButton documentId={document.id} />
      ) : null}

      <Link href={`/documents/${document.id}/preview`} className={actionLinkClass}>
        <Eye className="size-4" aria-hidden="true" />
        {isQuote ? "Summary preview" : "Preview"}
      </Link>

      {/* Available for DRAFT too — /api/documents/[id]/pdf renders a
          watermarked PDF for drafts (see that route), it's not
          FINAL-only. */}
      <a href={`/api/documents/${document.id}/pdf`} className={actionLinkClass}>
        <Download className="size-4" aria-hidden="true" />
        {isQuote ? "Summary PDF" : "Download PDF"}
      </a>

      {isQuote ? (
        <>
          <Link href={`/documents/${document.id}/quotation`} className={actionLinkClass}>
            <Eye className="size-4" aria-hidden="true" />
            Quotation preview
          </Link>

          <a href={`/api/documents/${document.id}/quotation-pdf`} className={actionLinkClass}>
            <Download className="size-4" aria-hidden="true" />
            Quotation PDF
          </a>

          {/* Available for a DRAFT quote too, but only prominent (filled
              brand button, rather than an outline one) once the quote is
              FINAL — "sales approves the quote, invoice without re-entry"
              is squarely a post-approval action. */}
          <CreateInvoiceButton
            action={createInvoiceFromQuote.bind(null, document.id)}
            prominent={!isDraft}
          />
        </>
      ) : null}
    </div>
  );
}
