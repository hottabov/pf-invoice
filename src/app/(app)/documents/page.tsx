import Link from "next/link";
import type { Metadata } from "next";
import { FileText, Receipt, Plus, Search } from "lucide-react";
import { auth } from "@/auth";
import { listDocuments } from "@/lib/queries/documents";
import { createDraft } from "@/lib/actions/documents";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

type SearchParams = { type?: string; q?: string };

const TABS: { type?: "QUOTE" | "INVOICE"; label: string }[] = [
  { type: undefined, label: "All" },
  { type: "QUOTE", label: "Quotes" },
  { type: "INVOICE", label: "Invoices" },
];

/** Coarse "3 days ago" / "12 Jan 2026" relative display — good enough for a
 * list row; the builder header shows the full timestamp if ever needed. */
function relativeDate(date: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

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
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-brand-dark">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {session.user.role === "ADMIN"
              ? "Every quote and invoice across the business."
              : "Quotes and invoices you've created."}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <form action={createDraft.bind(null, "QUOTE")}>
            <Button type="submit" variant="outline">
              <Plus className="size-4" data-icon="inline-start" />
              New quote
            </Button>
          </form>
          <form action={createDraft.bind(null, "INVOICE")}>
            <Button type="submit" className="bg-brand text-white hover:bg-brand/90">
              <Plus className="size-4" data-icon="inline-start" />
              New invoice
            </Button>
          </form>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-lg border border-border bg-white p-1">
          {TABS.map((tab) => {
            const isActive = tab.type === activeType;
            return (
              <Link
                key={tab.label}
                href={tabHref(tab.type, q)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <form method="GET" className="sm:w-64">
          {activeType ? <input type="hidden" name="type" value={activeType} /> : null}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search by company…"
              className="h-9 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </form>
      </div>

      {documents.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {q
            ? "No documents match your search."
            : "No documents yet — create your first quote or invoice above."}
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-2 md:gap-0 md:rounded-xl md:border md:border-border md:bg-white">
          {documents.map((d, i) => (
            <Link
              key={d.id}
              href={`/documents/${d.id}`}
              className={cn(
                "flex flex-col gap-1.5 rounded-xl border border-border bg-white p-4 transition-colors hover:border-brand-accent hover:bg-muted active:bg-muted",
                "md:flex-row md:items-center md:justify-between md:gap-4 md:rounded-none md:border-x-0 md:border-t-0 md:border-b md:last:border-b-0",
                i === 0 && "md:rounded-t-xl",
                i === documents.length - 1 && "md:rounded-b-xl md:border-b-0"
              )}
            >
              <div className="flex items-center gap-3">
                {d.type === "QUOTE" ? (
                  <FileText className="size-5 shrink-0 text-brand" />
                ) : (
                  <Receipt className="size-5 shrink-0 text-brand" />
                )}
                <div className="flex flex-col">
                  <span className="font-medium text-brand-dark">{d.companyName ?? "No client"}</span>
                  <span className="text-sm text-muted-foreground">
                    {d.number ?? (d.type === "QUOTE" ? "Quote draft" : "Invoice draft")} &middot;{" "}
                    {relativeDate(d.updatedAt)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 pl-8 md:pl-0">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                    d.status === "DRAFT"
                      ? "border-amber-300 text-amber-600"
                      : "border-emerald-300 bg-emerald-50 text-emerald-700"
                  )}
                >
                  {d.status === "DRAFT" ? "Draft" : "Final"}
                </span>
                <span className="text-sm font-medium text-brand-dark">
                  {formatMoney(d.total, d.currency)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
