import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Package, Plus } from "lucide-react";
import { auth } from "@/auth";
import { listProductsBySeries, type ProductListItem } from "@/lib/queries/catalog";
import { PriceDisplay, InactiveBadge } from "@/components/catalog-badges";
import { buttonVariants } from "@/components/ui/button";
import {
  PageHeader,
  TableShell,
  RowCell,
  tableClassName,
  tableHeadRowClassName,
  tableRowClassName,
  EmptyState,
} from "@/components/ui-kit";
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
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref="/catalog"
        backLabel="Catalog"
        title={series.name}
        description={series.code}
        actions={
          isAdmin ? (
            <Link
              href={`/catalog/${encodeURIComponent(series.code)}/new`}
              className={cn(
                buttonVariants(),
                "h-11 w-full bg-brand text-white hover:bg-brand/90 sm:w-auto"
              )}
            >
              <Plus className="size-4" data-icon="inline-start" aria-hidden="true" />
              Add product
            </Link>
          ) : undefined
        }
      />

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products in this series yet"
          description={isAdmin ? "Add the first one above." : undefined}
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
                  <th scope="col" className="px-4 py-3 text-right">
                    Price
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Status</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <ProductRow key={p.id} seriesCode={series.code} product={p} />
                ))}
              </tbody>
            </table>
          }
          cards={products.map((p) => (
            <ProductCard key={p.id} seriesCode={series.code} product={p} />
          ))}
        />
      )}
    </div>
  );
}

function ProductRow({
  seriesCode,
  product: p,
}: {
  seriesCode: string;
  product: ProductListItem;
}) {
  const href = `/catalog/${encodeURIComponent(seriesCode)}/${encodeURIComponent(p.code)}`;
  return (
    <tr className={cn(tableRowClassName, p.active ? "" : "opacity-60")}>
      <RowCell href={href} primary={`Open ${p.name}`}>
        <span aria-hidden="true" className="font-mono text-sm text-brand-dark">
          {p.code}
        </span>
      </RowCell>
      <RowCell href={href}>
        <span className="text-sm text-slate-700">{p.name}</span>
      </RowCell>
      <RowCell href={href} align="right">
        <PriceDisplay price={p.price} />
      </RowCell>
      <RowCell href={href} align="right">
        {!p.active ? <InactiveBadge /> : null}
      </RowCell>
    </tr>
  );
}

function ProductCard({
  seriesCode,
  product: p,
}: {
  seriesCode: string;
  product: ProductListItem;
}) {
  return (
    <Link
      href={`/catalog/${encodeURIComponent(seriesCode)}/${encodeURIComponent(p.code)}`}
      className={cn(
        "focus-ring flex min-h-12 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 transition-colors active:bg-slate-100",
        p.active ? "" : "opacity-60"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-sm text-brand-dark">{p.code}</span>
          {!p.active ? <InactiveBadge /> : null}
        </div>
        <PriceDisplay price={p.price} />
      </div>
      <p className="truncate text-sm text-slate-600">{p.name}</p>
    </Link>
  );
}
