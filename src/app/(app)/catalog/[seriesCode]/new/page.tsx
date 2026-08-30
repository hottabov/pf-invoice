import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getSeriesByCode } from "@/lib/queries/catalog";
import { createProduct } from "@/lib/actions/catalog";
import { ProductForm } from "@/components/catalog/product-form";
import { PageHeader, SectionCard } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

type Params = { seriesCode: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { seriesCode } = await params;
  const series = await getSeriesByCode(seriesCode);
  return { title: series ? `New product · ${series.name}` : "New product" };
}

export default async function NewProductPage({ params }: { params: Promise<Params> }) {
  const { seriesCode } = await params;
  const [series, session] = await Promise.all([getSeriesByCode(seriesCode), auth()]);

  if (!series) notFound();
  if (session?.user?.role !== "ADMIN") redirect("/catalog");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        backHref={`/catalog/${encodeURIComponent(series.code)}`}
        backLabel={series.name}
        title="New product"
        description={`In ${series.name}.`}
      />

      <SectionCard>
        <ProductForm
          action={createProduct.bind(null, series.code)}
          defaultValues={{ code: "", name: "", description: "", active: true, sortOrder: 0 }}
          submitLabel="Create product"
        />
      </SectionCard>
    </div>
  );
}
