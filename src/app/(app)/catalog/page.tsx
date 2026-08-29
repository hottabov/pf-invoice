import type { Metadata } from "next";

export const metadata: Metadata = { title: "Catalog" };

export default function CatalogPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-xl font-semibold text-brand-dark">Catalog</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Series, products, options, and pricing will land here in the next task.
      </p>
    </div>
  );
}
