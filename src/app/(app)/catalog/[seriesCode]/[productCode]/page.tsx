import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getProductDetail } from "@/lib/queries/catalog";
import { updateProduct, deleteProduct, upsertPrice, updateProductImage } from "@/lib/actions/catalog";
import { ProductForm } from "@/components/catalog/product-form";
import { PriceEditor } from "@/components/catalog/price-editor";
import { ImageUpload } from "@/components/catalog/image-upload";
import { DeleteButton } from "@/components/catalog/delete-button";
import { PageHeader, SectionCard } from "@/components/ui-kit";

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
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref={`/catalog/${encodeURIComponent(product.series.code)}`}
        backLabel={product.series.name}
        title={product.name}
        description={
          isAdmin ? product.code : "View only — ask an admin to make changes."
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        <SectionCard title="Details" className="lg:col-span-2">
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
        </SectionCard>

        <div className="flex flex-col gap-6">
          <SectionCard title="Image">
            <ImageUpload
              currentUrl={product.imageUrl}
              alt={product.name}
              onSave={updateProductImage.bind(null, product.id)}
              readOnly={!isAdmin}
            />
          </SectionCard>

          <SectionCard title="Prices by region">
            <PriceEditor
              target={{ productId: product.id }}
              rows={product.prices}
              action={upsertPrice}
              readOnly={!isAdmin}
            />
          </SectionCard>
        </div>
      </div>

      {isAdmin && (
        <SectionCard
          tone="danger"
          title="Danger zone"
          description="Deleting a product removes its prices too. Products used on a document can't be deleted."
        >
          <DeleteButton
            action={deleteProduct.bind(null, product.id)}
            confirmTitle={`Delete ${product.code} — ${product.name}?`}
            confirmDescription="This removes its prices too. This can't be undone."
            label="Delete product"
          />
        </SectionCard>
      )}
    </div>
  );
}
