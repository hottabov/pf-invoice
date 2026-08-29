import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { auth } from "@/auth";
import { listProductsBySeries } from "@/lib/queries/catalog";
import { PriceDisplay, InactiveBadge } from "@/components/catalog-badges";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { seriesCode: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { seriesCode } = await params;
  const result = await listProductsBySeries(seriesCode);
  return { title: result ? result.series.name : "Series" };
}

export default async function SeriesProductsPage({ params }: { params: Promise<Params> }) {
  const { seriesCode } = await params;
  const [result, session] = await Promise.all([listProductsBySeries(seriesCode), auth()]);

  if (!result) notFound();

  const { series, products } = result;
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-brand-dark">{series.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {series.code}
            {series.maxDiscountPct !== null && (
              <> &middot; max discount {series.maxDiscountPct}%</>
            )}
          </p>
        </div>
        {isAdmin && (
          <Link href={`/catalog/${series.code}/new`} className={cn(buttonVariants(), "shrink-0")}>
            <Plus className="size-4" data-icon="inline-start" />
            Add product
          </Link>
        )}
      </div>

      {products.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No products in this series yet.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-2 md:gap-0 md:rounded-xl md:border md:border-border md:bg-white">
          {products.map((p, i) => (
            <Link
              key={p.id}
              href={`/catalog/${series.code}/${p.code}`}
              className={cn(
                "flex flex-col gap-1 rounded-xl border border-border bg-white p-4 transition-colors hover:border-brand-accent hover:bg-muted active:bg-muted",
                "md:flex-row md:items-center md:justify-between md:rounded-none md:border-x-0 md:border-t-0 md:border-b md:last:border-b-0",
                p.active ? "" : "opacity-60",
                i === 0 && "md:rounded-t-xl",
                i === products.length - 1 && "md:rounded-b-xl md:border-b-0"
              )}
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-brand-dark">{p.code}</span>
                <span className="text-sm text-foreground">{p.name}</span>
                {!p.active && <InactiveBadge />}
              </div>
              <PriceDisplay price={p.price} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
