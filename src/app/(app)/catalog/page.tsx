import Link from "next/link";
import type { Metadata } from "next";
import { Package, Puzzle } from "lucide-react";
import { listSeriesWithCounts, countOptions } from "@/lib/queries/catalog";
import { PageHeader, StatusBadge } from "@/components/ui-kit";

export const metadata: Metadata = { title: "Catalog" };
export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const [series, optionsCount] = await Promise.all([listSeriesWithCounts(), countOptions()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Catalog" description="Browse product series and global options." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {series.map((s) => (
          <Link
            key={s.id}
            href={`/catalog/${encodeURIComponent(s.code)}`}
            className="focus-ring flex min-h-12 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-accent hover:bg-slate-50 active:bg-slate-100"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 font-medium text-brand-dark">
                <Package className="size-5 shrink-0 text-brand" aria-hidden="true" />
                <span className="truncate">{s.name}</span>
              </span>
              {s.maxDiscountPct !== null ? (
                <StatusBadge tone="slate" className="shrink-0">
                  max {s.maxDiscountPct}%
                </StatusBadge>
              ) : null}
            </div>
            <span className="font-mono text-xs text-slate-500">{s.code}</span>
            <span className="text-sm text-slate-500">
              {s.productCount} {s.productCount === 1 ? "product" : "products"}
            </span>
          </Link>
        ))}

        {/* Distinct accent border sets the global "Options" entry apart from
            per-series cards — it isn't a series, it's a separate catalog. */}
        <Link
          href="/catalog/options"
          className="focus-ring flex min-h-12 flex-col gap-2 rounded-xl border-2 border-brand-accent bg-white p-4 transition-colors hover:bg-slate-50 active:bg-slate-100"
        >
          <span className="flex items-center gap-2 font-medium text-brand-dark">
            <Puzzle className="size-5 shrink-0 text-brand-accent" aria-hidden="true" />
            Options
          </span>
          <span className="text-sm text-slate-500">
            {optionsCount} global {optionsCount === 1 ? "option" : "options"}
          </span>
        </Link>
      </div>
    </div>
  );
}
