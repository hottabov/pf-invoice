import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Search, Building2 } from "lucide-react";
import { auth } from "@/auth";
import { listCompanies } from "@/lib/queries/clients";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

type SearchParams = { q?: string };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q } = await searchParams;
  // AppLayout (src/app/(app)/layout.tsx) already calls requireSession and
  // redirects unauthenticated requests, so a session is always present here.
  const session = (await auth())!;

  const companies = await listCompanies(session.user, { q });

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-brand-dark">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {session.user.role === "ADMIN"
              ? "Every company across the business."
              : "Companies you've added."}
          </p>
        </div>
        <Link href="/clients/new" className={cn(buttonVariants(), "shrink-0")}>
          <Plus className="size-4" data-icon="inline-start" />
          Add company
        </Link>
      </div>

      <form method="GET" className="mt-6">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search companies by name…"
            className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      </form>

      {companies.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {q ? "No companies match your search." : "No companies yet — add your first one."}
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-2 md:gap-0 md:rounded-xl md:border md:border-border md:bg-white">
          {companies.map((c, i) => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className={cn(
                "flex flex-col gap-1.5 rounded-xl border border-border bg-white p-4 transition-colors hover:border-brand-accent hover:bg-muted active:bg-muted",
                "md:flex-row md:items-center md:justify-between md:gap-4 md:rounded-none md:border-x-0 md:border-t-0 md:border-b md:last:border-b-0",
                i === 0 && "md:rounded-t-xl",
                i === companies.length - 1 && "md:rounded-b-xl md:border-b-0"
              )}
            >
              <div className="flex items-center gap-3">
                <Building2 className="size-5 shrink-0 text-brand" />
                <div className="flex flex-col">
                  <span className="font-medium text-brand-dark">{c.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {[c.city, c.country].filter(Boolean).join(", ") || "No address"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 pl-8 md:pl-0">
                <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {c.regionCode}
                </span>
                <span className="text-xs text-muted-foreground">
                  {c.contactCount} {c.contactCount === 1 ? "contact" : "contacts"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
