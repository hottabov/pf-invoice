import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getSeriesByCode } from "@/lib/queries/catalog";
import { createProduct } from "@/lib/actions/catalog";
import { ProductForm } from "@/components/catalog/product-form";

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
    <div className="mx-auto w-full max-w-lg">
      <h1 className="text-xl font-semibold text-brand-dark">New product</h1>
      <p className="mt-1 text-sm text-muted-foreground">In {series.name}.</p>

      <div className="mt-6 rounded-xl border border-border bg-white p-4 sm:p-6">
        <ProductForm
          action={createProduct.bind(null, series.code)}
          defaultValues={{ code: "", name: "", description: "", active: true, sortOrder: 0 }}
          submitLabel="Create product"
        />
      </div>
    </div>
  );
}
