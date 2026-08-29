import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getProductDetail } from "@/lib/queries/catalog";
import { updateProduct, deleteProduct, upsertPrice } from "@/lib/actions/catalog";
import { ProductForm } from "@/components/catalog/product-form";
import { PriceEditor } from "@/components/catalog/price-editor";
import { DeleteButton } from "@/components/catalog/delete-button";

export const dynamic = "force-dynamic";

type Params = { seriesCode: string; productCode: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { seriesCode, productCode } = await params;
  const product = await getProductDetail(seriesCode, productCode);
  return { title: product ? `${product.code} · ${product.series.name}` : "Product" };
}

export default async function ProductEditorPage({ params }: { params: Promise<Params> }) {
  const { seriesCode, productCode } = await params;
  const [product, session] = await Promise.all([
    getProductDetail(seriesCode, productCode),
    auth(),
  ]);

  if (!product) notFound();

  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="mx-auto w-full max-w-lg">
      <div>
        <p className="text-sm text-muted-foreground">{product.series.name}</p>
        <h1 className="text-xl font-semibold text-brand-dark">{product.name}</h1>
        {!isAdmin && (
          <p className="mt-1 text-xs text-muted-foreground">
            View only — ask an admin to make changes.
          </p>
        )}
      </div>

      <section className="mt-6 rounded-xl border border-border bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-brand-dark">Details</h2>
        <div className="mt-4">
          <ProductForm
            action={updateProduct.bind(null, product.id)}
            defaultValues={{
              code: product.code,
              name: product.name,
              description: product.description ?? "",
              active: product.active,
              sortOrder: product.sortOrder,
            }}
            submitLabel="Save changes"
            readOnly={!isAdmin}
          />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-brand-dark">Prices by region</h2>
        <div className="mt-3">
          <PriceEditor
            target={{ productId: product.id }}
            rows={product.prices}
            action={upsertPrice}
            readOnly={!isAdmin}
          />
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-brand-dark">Image</h2>
        <div className="mt-3">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-40 w-40 rounded-lg border border-border object-cover"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No image yet. Image upload is coming in a later phase.
            </p>
          )}
        </div>
      </section>

      {isAdmin && (
        <section className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deleting a product removes its prices too. Products used on a document can&apos;t be
            deleted.
          </p>
          <div className="mt-3">
            <DeleteButton
              action={deleteProduct.bind(null, product.id)}
              confirmMessage={`Delete ${product.code} — ${product.name}? This can't be undone.`}
            />
          </div>
        </section>
      )}
    </div>
  );
}
