import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Puzzle, Search } from "lucide-react";
import { auth } from "@/auth";
import { listOptions, listSeriesWithCounts, type OptionListItem } from "@/lib/queries/catalog";
import { PriceDisplay, InactiveBadge, CompatBadges } from "@/components/catalog-badges";
import { buttonVariants } from "@/components/ui/button";
import {
  PageHeader,
  TableShell,
  tableClassName,
  tableHeadRowClassName,
  tableRowClassName,
  EmptyState,
  fieldInputClass,
} from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Options" };
export const dynamic = "force-dynamic";

type SearchParams = { q?: string; series?: string };

export default async function OptionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q, series: seriesFilter } = await searchParams;
  const [options, series, session] = await Promise.all([
    listOptions({ search: q, seriesCode: seriesFilter }),
    listSeriesWithCounts(),
    auth(),
  ]);

  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref="/catalog"
        backLabel="Catalog"
        title="Options"
        description="Global options available across product series."
        actions={
          isAdmin ? (
            <Link
              href="/catalog/options/new"
              className={cn(
                buttonVariants(),
                "h-11 w-full bg-brand text-white hover:bg-brand/90 sm:w-auto"
              )}
            >
              <Plus className="size-4" data-icon="inline-start" aria-hidden="true" />
              Add option
            </Link>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label="Filter options by series"
          className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1"
        >
          <FilterChip label="All series" href={buildHref(q)} active={!seriesFilter} />
          {series.map((s) => (
            <FilterChip key={s.id} label={s.code} href={buildHref(q, s.code)} active={seriesFilter === s.code} />
          ))}
        </div>

        <form method="GET" className="sm:w-72">
          {seriesFilter && <input type="hidden" name="series" value={seriesFilter} />}
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              aria-label="Search options"
              placeholder="Search by name or code…"
              className={cn(fieldInputClass, "pl-9")}
            />
          </div>
        </form>
      </div>

      {options.length === 0 ? (
        <EmptyState
          icon={Puzzle}
          title="No options match your filters"
          description="Try a different search or series."
        />
      ) : (
        <TableShell
          table={
            <table className={tableClassName}>
              <thead>
                <tr className={tableHeadRowClassName}>
                  <th scope="col" className="px-4 py-3">
                    Code
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Compatible series
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Price
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Status</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {options.map((o) => (
                  <OptionRow key={o.id} option={o} />
                ))}
              </tbody>
            </table>
          }
          cards={options.map((o) => (
            <OptionCard key={o.id} option={o} />
          ))}
        />
      )}
    </div>
  );
}

function buildHref(q?: string, seriesCode?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (seriesCode) params.set("series", seriesCode);
  const query = params.toString();
  return query ? `/catalog/options?${query}` : "/catalog/options";
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={cn(
        "focus-ring rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-brand text-white" : "text-slate-500 hover:text-brand-dark"
      )}
    >
      {label}
    </Link>
  );
}

function OptionRow({ option: o }: { option: OptionListItem }) {
  return (
    <tr className={cn(tableRowClassName, "relative", o.active ? "" : "opacity-60")}>
      <td className="px-4 py-3 align-middle">
        <Link
          href={`/catalog/options/${encodeURIComponent(o.code)}`}
          className="absolute inset-0 focus-visible:z-10 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        >
          <span className="sr-only">Open {o.name}</span>
        </Link>
        <span aria-hidden="true" className="relative font-mono text-sm text-brand-dark">
          {o.code}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-700">{o.name}</td>
      <td className="px-4 py-3">
        <CompatBadges seriesCodes={o.compatSeriesCodes} />
      </td>
      <td className="px-4 py-3 text-right">
        <PriceDisplay price={o.price} />
      </td>
      <td className="px-4 py-3 text-right">{!o.active ? <InactiveBadge /> : null}</td>
    </tr>
  );
}

function OptionCard({ option: o }: { option: OptionListItem }) {
  return (
    <Link
      href={`/catalog/options/${encodeURIComponent(o.code)}`}
      className={cn(
        "focus-ring flex min-h-12 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-colors active:bg-slate-100",
        o.active ? "" : "opacity-60"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-sm text-brand-dark">{o.code}</span>
          {!o.active ? <InactiveBadge /> : null}
        </div>
        <PriceDisplay price={o.price} />
      </div>
      <p className="truncate text-sm text-slate-600">{o.name}</p>
      <CompatBadges seriesCodes={o.compatSeriesCodes} />
    </Link>
  );
}
