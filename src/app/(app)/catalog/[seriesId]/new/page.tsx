import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/roles";
import { getSeriesById } from "@/lib/queries/catalog";
import { createProduct } from "@/lib/actions/catalog";
import { ProductForm } from "@/components/catalog/product-form";
import { PageHeader, SectionCard } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

// Routed by Series.id -- see the doc comment on `Params` in
// `src/app/(app)/catalog/[seriesId]/page.tsx`, the sibling route this one
// nests under.
type Params = { seriesId: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { seriesId } = await params;
  const series = await getSeriesById(seriesId);
  return { title: series ? `New product · ${series.name}` : "New product" };
}

export default async function NewProductPage({ params }: { params: Promise<Params> }) {
  const { seriesId } = await params;
  const [series, session] = await Promise.all([getSeriesById(seriesId), auth()]);

  if (!series) notFound();
  if (!isAdminRole(session?.user?.role)) redirect("/catalog");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        backHref={`/catalog/${series.id}`}
        backLabel={series.name}
        title="New product"
        description={`In ${series.name}.`}
      />

      <SectionCard>
        <ProductForm
          action={createProduct.bind(null, series.id)}
          defaultValues={{ code: "", name: "", description: "", active: true, sortOrder: 0 }}
          submitLabel="Create product"
        />
      </SectionCard>
    </div>
  );
}
