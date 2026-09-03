import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Package, Plus } from "lucide-react";
import { auth } from "@/auth";
import {
  listProductsBySeriesById,
  getSeriesFallbackImageUrl,
  type ProductListItem,
} from "@/lib/queries/catalog";
import { catalogVisibilityRegionId, isSeriesHidden } from "@/lib/catalog-visibility";
import { getHiddenCatalogIds } from "@/lib/queries/catalog-visibility";
import { updateSeriesImage } from "@/lib/actions/catalog";
import { SeriesImageCard } from "@/components/catalog/series-image-card";
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

// Routed by Series.id, not Series.code. Same reasoning as
// `/catalog/options/[optionId]` (see the doc comment there): a code is free
// text an admin can edit, and a `/` in it encodes to `%2F`, which Node/Next
// normalise back into a path separator before route matching, so the
// dynamic segment never matches and the page 404s. No series code contains
// a slash today, but nothing stops one being renamed into one, and an id
// never changes either way. Don't "simplify" this back to the code.
type Params = { seriesId: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { seriesId } = await params;
  // Metadata runs before the page body — re-check hidden-ness here too
  // (same reasoning the document builder's own generateMetadata gives) so a
  // manager browsing to a hidden series' URL never even sees its name in
  // the tab title.
  const [result, session] = await Promise.all([listProductsBySeriesById(seriesId), auth()]);
  if (!result) return { title: "Series" };
  const hiddenCatalogIds = await getHiddenCatalogIds(catalogVisibilityRegionId(session?.user));
  if (isSeriesHidden(result.series.id, hiddenCatalogIds)) return { title: "Series" };
  return { title: result.series.name };
}

export default async function SeriesProductsPage({ params }: { params: Promise<Params> }) {
  const { seriesId } = await params;
  const [result, session] = await Promise.all([listProductsBySeriesById(seriesId), auth()]);

  if (!result) notFound();

  const { series } = result;
  const isAdmin = session?.user?.role === "ADMIN";
  const hiddenCatalogIds = await getHiddenCatalogIds(catalogVisibilityRegionId(session?.user));
  // A hidden series is absent, full stop — a MANAGER hitting its URL
  // directly (bookmark, typed URL) gets the same 404 as a nonexistent
  // series, same "never distinguish the two" rule `documentWhereForUser`
  // callers already follow for a foreign document.
  if (!isAdmin && isSeriesHidden(series.id, hiddenCatalogIds)) notFound();
  // A visible series can still have individually-hidden products under it.
  const products = isAdmin
    ? result.products
    : result.products.filter((p) => !hiddenCatalogIds.productIds.has(p.id));
  // Only needed for the admin "Series image" panel below -- skip the extra
  // query entirely for a MANAGER, who never sees that panel.
  const fallbackImageUrl = isAdmin ? await getSeriesFallbackImageUrl(series.id) : null;

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
              href={`/catalog/${series.id}/new`}
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
                  <ProductRow key={p.id} seriesId={series.id} product={p} />
                ))}
              </tbody>
            </table>
          }
          cards={products.map((p) => (
            <ProductCard key={p.id} seriesId={series.id} product={p} />
          ))}
        />
      )}

      {isAdmin ? (
        <SeriesImageCard
          currentUrl={series.imageUrl}
          fallbackImageUrl={fallbackImageUrl}
          alt={series.name}
          onSave={updateSeriesImage.bind(null, series.id)}
        />
      ) : null}
    </div>
  );
}

function ProductRow({
  seriesId,
  product: p,
}: {
  seriesId: string;
  product: ProductListItem;
}) {
  const href = `/catalog/${seriesId}/${p.id}`;
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
  seriesId,
  product: p,
}: {
  seriesId: string;
  product: ProductListItem;
}) {
  return (
    <Link
      href={`/catalog/${seriesId}/${p.id}`}
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
