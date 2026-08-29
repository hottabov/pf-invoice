import Link from "next/link";
import type { Metadata } from "next";
import { Package, Puzzle } from "lucide-react";
import { listSeriesWithCounts, countOptions } from "@/lib/queries/catalog";

export const metadata: Metadata = { title: "Catalog" };
export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const [series, optionsCount] = await Promise.all([listSeriesWithCounts(), countOptions()]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-xl font-semibold text-brand-dark">Catalog</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Browse product series and global options.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {series.map((s) => (
          <Link
            key={s.id}
            href={`/catalog/${s.code}`}
            className="flex flex-col gap-1 rounded-xl border border-border bg-white p-4 transition-colors hover:border-brand-accent hover:bg-muted active:bg-muted"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium text-brand-dark">
                <Package className="size-5 text-brand" />
                {s.name}
              </span>
              {s.maxDiscountPct !== null && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  max discount {s.maxDiscountPct}%
                </span>
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {s.code} &middot; {s.productCount} {s.productCount === 1 ? "product" : "products"}
            </span>
          </Link>
        ))}

        <Link
          href="/catalog/options"
          className="flex flex-col gap-1 rounded-xl border border-border bg-white p-4 transition-colors hover:border-brand-accent hover:bg-muted active:bg-muted"
        >
          <span className="flex items-center gap-2 font-medium text-brand-dark">
            <Puzzle className="size-5 text-brand" />
            Options
          </span>
          <span className="text-sm text-muted-foreground">
            {optionsCount} {optionsCount === 1 ? "option" : "options"}
          </span>
        </Link>
      </div>
    </div>
  );
}
