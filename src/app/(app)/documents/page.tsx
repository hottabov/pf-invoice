import Link from "next/link";
import type { Metadata } from "next";
import { FileText, Receipt, Plus, Search } from "lucide-react";
import { auth } from "@/auth";
import { listDocuments, type DocumentListItem } from "@/lib/queries/documents";
import { createDraft } from "@/lib/actions/documents";
import { formatMoney, relativeDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  TableShell,
  tableClassName,
  tableHeadRowClassName,
  tableRowClassName,
  StatusBadge,
  STATUS_TONE,
  EmptyState,
} from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

type SearchParams = { type?: string; q?: string };

const TABS: { type?: "QUOTE" | "INVOICE"; label: string }[] = [
  { type: undefined, label: "All" },
  { type: "QUOTE", label: "Quotes" },
  { type: "INVOICE", label: "Invoices" },
];

function tabHref(type: "QUOTE" | "INVOICE" | undefined, q?: string): string {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/documents?${query}` : "/documents";
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { type, q } = await searchParams;
  // AppLayout (src/app/(app)/layout.tsx) already calls requireSession and
  // redirects unauthenticated requests, so a session is always present here.
  const session = (await auth())!;

  const activeType = type === "QUOTE" || type === "INVOICE" ? type : undefined;
  const documents = await listDocuments(session.user, { type: activeType, q });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Documents"
        description={
          session.user.role === "ADMIN"
            ? "Every quote and invoice across the business."
            : "Quotes and invoices you've created."
        }
        actions={
          <>
            <form action={createDraft.bind(null, "QUOTE")}>
              <Button type="submit" variant="outline" className="h-11 w-full sm:w-auto">
                <Plus className="size-4" data-icon="inline-start" aria-hidden="true" />
                New quote
              </Button>
            </form>
            <form action={createDraft.bind(null, "INVOICE")}>
              <Button
                type="submit"
                className="h-11 w-full bg-brand text-white hover:bg-brand/90 sm:w-auto"
              >
                <Plus className="size-4" data-icon="inline-start" aria-hidden="true" />
                New invoice
              </Button>
            </form>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Filter documents by type"
          className="inline-flex w-fit rounded-lg border border-slate-200 bg-white p-1"
        >
          {TABS.map((tab) => {
            const isActive = tab.type === activeType;
            return (
              <Link
                key={tab.label}
                href={tabHref(tab.type, q)}
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "focus-ring rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive ? "bg-brand text-white" : "text-slate-500 hover:text-brand-dark"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <form method="GET" className="sm:w-72">
          {activeType ? <input type="hidden" name="type" value={activeType} /> : null}
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              aria-label="Search by company"
              placeholder="Search by company…"
              className="focus-ring h-11 w-full rounded-lg border border-slate-200 bg-white pr-3 pl-9 text-base text-brand-dark outline-none transition-colors placeholder:text-slate-400 focus-visible:border-brand"
            />
          </div>
        </form>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={q ? "No documents match your search" : "No documents yet"}
          description={
            q ? "Try a different company name." : "Create your first quote or invoice above."
          }
        />
      ) : (
        <TableShell
          table={
            <table className={tableClassName}>
              <thead>
                <tr className={tableHeadRowClassName}>
                  <th scope="col" className="px-4 py-3">
                    Number
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Type
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Company
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Total
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <DocumentRow key={d.id} document={d} />
                ))}
              </tbody>
            </table>
          }
          cards={documents.map((d) => (
            <DocumentCard key={d.id} document={d} />
          ))}
        />
      )}
    </div>
  );
}

function DocumentRow({ document: d }: { document: DocumentListItem }) {
  const typeLabel = d.type === "QUOTE" ? "Quote" : "Invoice";
  const statusLabel = d.status === "DRAFT" ? "Draft" : "Final";
  const numberLabel = d.number ?? `${typeLabel} draft`;

  return (
    <tr className={cn(tableRowClassName, "relative")}>
      <td className="px-4 py-3 align-middle">
        <Link
          href={`/documents/${d.id}`}
          className="absolute inset-0 focus-visible:z-10 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        >
          <span className="sr-only">Open {numberLabel}</span>
        </Link>
        <span aria-hidden="true" className="relative font-mono text-sm text-brand-dark">
          {numberLabel}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          {d.type === "QUOTE" ? (
            <FileText className="size-3.5 text-brand" aria-hidden="true" />
          ) : (
            <Receipt className="size-3.5 text-brand" aria-hidden="true" />
          )}
          {typeLabel}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">{d.companyName ?? "No client"}</td>
      <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-brand-dark">
        {formatMoney(d.total, d.currency)}
      </td>
      <td className="px-4 py-3">
        <StatusBadge tone={STATUS_TONE[d.status]}>{statusLabel}</StatusBadge>
      </td>
      <td className="px-4 py-3 text-sm text-slate-500">{relativeDate(d.updatedAt)}</td>
    </tr>
  );
}

function DocumentCard({ document: d }: { document: DocumentListItem }) {
  const typeLabel = d.type === "QUOTE" ? "Quote" : "Invoice";
  const statusLabel = d.status === "DRAFT" ? "Draft" : "Final";

  return (
    <Link
      href={`/documents/${d.id}`}
      className="focus-ring flex min-h-12 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-colors active:bg-slate-100"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
          {d.type === "QUOTE" ? (
            <FileText className="size-3.5 text-brand" aria-hidden="true" />
          ) : (
            <Receipt className="size-3.5 text-brand" aria-hidden="true" />
          )}
          {typeLabel}
        </span>
        <StatusBadge tone={STATUS_TONE[d.status]}>{statusLabel}</StatusBadge>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-brand-dark">{d.companyName ?? "No client"}</p>
          <p className="font-mono text-xs text-slate-500">
            {d.number ?? `${typeLabel} draft`} · {relativeDate(d.updatedAt)}
          </p>
        </div>
        <span className="shrink-0 text-sm font-medium tabular-nums text-brand-dark">
          {formatMoney(d.total, d.currency)}
        </span>
      </div>
    </Link>
  );
}
