import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Package, Puzzle } from "lucide-react";
import { listSeriesWithCounts, countOptions, type SeriesWithCounts } from "@/lib/queries/catalog";
import { PageHeader } from "@/components/ui-kit";

export const metadata: Metadata = { title: "Catalog" };
export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const [series, optionsCount] = await Promise.all([listSeriesWithCounts(), countOptions()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Catalog" description="Browse product series and global options." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {series.map((s) => (
          <SeriesCard key={s.id} series={s} />
        ))}

        {/* Distinct accent border sets the global "Options" entry apart from
            per-series cards — it isn't a series, it's a separate catalog. An
            icon block fills the image slot (options have no photo of their
            own) so it keeps the same horizontal rhythm as the series cards. */}
        <Link
          href="/catalog/options"
          className="focus-ring flex min-h-12 items-center gap-4 rounded-xl border-2 border-brand-accent-ink bg-white p-4 transition-colors hover:bg-slate-50 active:bg-slate-100"
        >
          <span
            className="flex size-28 shrink-0 items-center justify-center rounded-lg border border-brand-accent-ink/30 bg-brand-accent-ink/5 sm:size-32"
            aria-hidden="true"
          >
            <Puzzle className="size-8 text-brand-accent-ink" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-medium text-brand-dark">Options</span>
            <span className="text-sm text-slate-500">
              {optionsCount} global {optionsCount === 1 ? "option" : "options"}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-brand-accent-ink/50" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function SeriesCard({ series: s }: { series: SeriesWithCounts }) {
  return (
    <Link
      href={`/catalog/${encodeURIComponent(s.code)}`}
      className="focus-ring flex min-h-12 items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-accent-ink hover:bg-slate-50 active:bg-slate-100"
    >
      <span className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 sm:size-32">
        {s.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.imageUrl} alt="" className="size-full object-contain p-2" />
        ) : (
          <Package className="size-8 text-slate-300" aria-hidden="true" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium text-brand-dark">{s.name}</span>
        <span className="font-mono text-xs text-slate-500">{s.code}</span>
        <span className="text-sm text-slate-500">
          {s.productCount} {s.productCount === 1 ? "product" : "products"}
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-slate-300" aria-hidden="true" />
    </Link>
  );
}
