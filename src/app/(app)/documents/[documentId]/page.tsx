import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import {
  getDocumentForBuilder,
  getItemPickerCatalog,
  listClientPickerCompanies,
} from "@/lib/queries/documents";
import { addItem, deleteDraft, removeItem, setDocumentClient } from "@/lib/actions/documents";
import { ClientSection } from "@/components/builder/client-section";
import { ItemsSection } from "@/components/builder/items-section";
import { StickyFooter } from "@/components/builder/sticky-footer";

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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-4">
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
        removeItemAction={removeItem}
        addItemAction={addItem}
        readOnly={!isDraft}
      />

      <section className="rounded-xl border border-border bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-brand-dark">Extra lines</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Freeform lines (delivery, install, etc.) — next task.
        </p>
      </section>

      <StickyFooter
        type={document.type}
        status={document.status}
        taxName={document.taxName}
        taxRate={document.taxRate}
        subtotal={document.subtotal}
        taxAmount={document.taxAmount}
        total={document.total}
        currency={document.currency}
        deleteAction={isDraft ? deleteDraft.bind(null, document.id) : undefined}
      />
    </div>
  );
}
