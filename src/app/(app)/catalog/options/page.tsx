import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Search } from "lucide-react";
import { auth } from "@/auth";
import { listOptions, listSeriesWithCounts } from "@/lib/queries/catalog";
import { PriceDisplay, InactiveBadge, CompatBadges } from "@/components/catalog-badges";
import { buttonVariants } from "@/components/ui/button";
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
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-brand-dark">Options</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Global options available across product series.
          </p>
        </div>
        {isAdmin && (
          <Link href="/catalog/options/new" className={cn(buttonVariants(), "shrink-0")}>
            <Plus className="size-4" data-icon="inline-start" />
            Add option
          </Link>
        )}
      </div>

      <form method="GET" className="mt-6">
        {seriesFilter && <input type="hidden" name="series" value={seriesFilter} />}
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search options by name or code…"
            className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        <FilterChip
          label="All series"
          href={buildHref(q)}
          active={!seriesFilter}
        />
        {series.map((s) => (
          <FilterChip
            key={s.id}
            label={s.code}
            href={buildHref(q, s.code)}
            active={seriesFilter === s.code}
          />
        ))}
      </div>

      {options.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No options match your filters.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-2 md:gap-0 md:rounded-xl md:border md:border-border md:bg-white">
          {options.map((o, i) => (
            <Link
              key={o.id}
              href={`/catalog/options/${o.code}`}
              className={cn(
                "flex flex-col gap-2 rounded-xl border border-border bg-white p-4 transition-colors hover:border-brand-accent hover:bg-muted active:bg-muted",
                "md:flex-row md:items-center md:justify-between md:gap-4 md:rounded-none md:border-x-0 md:border-t-0 md:border-b md:last:border-b-0",
                o.active ? "" : "opacity-60",
                i === 0 && "md:rounded-t-xl",
                i === options.length - 1 && "md:rounded-b-xl md:border-b-0"
              )}
            >
              <div className="flex flex-1 flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-brand-dark">{o.code}</span>
                  <span className="text-sm text-foreground">{o.name}</span>
                  {!o.active && <InactiveBadge />}
                </div>
                <CompatBadges seriesCodes={o.compatSeriesCodes} />
              </div>
              <PriceDisplay price={o.price} />
            </Link>
          ))}
        </div>
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
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-brand bg-brand text-white"
          : "border-border bg-white text-muted-foreground hover:border-brand-accent"
      )}
    >
      {label}
    </Link>
  );
}
