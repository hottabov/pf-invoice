import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getRegionAdmin } from "@/lib/queries/regions";
import { getCatalogVisibilityTree } from "@/lib/queries/catalog-visibility-admin";
import { setCatalogVisibility } from "@/lib/actions/catalog-visibility";
import { CatalogVisibilityEditor } from "@/components/settings/catalog-visibility-editor";
import { PageHeader, SectionCard, StatusBadge } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

type Params = { regionId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { regionId } = await params;
  const region = await getRegionAdmin(regionId);
  return { title: region ? `${region.name} catalog visibility` : "Catalog visibility" };
}

export default async function CatalogVisibilityRegionPage({ params }: { params: Promise<Params> }) {
  const { regionId } = await params;
  const session = await auth();
  if (session?.user?.role !== "ADMIN") notFound();

  const region = await getRegionAdmin(regionId);
  if (!region) notFound();

  const series = await getCatalogVisibilityTree(region.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref="/settings/catalog-visibility"
        backLabel="Catalog visibility"
        title={region.name}
        description={region.code}
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={region.active ? "green" : "slate"}>{region.active ? "Active" : "Inactive"}</StatusBadge>
      </div>

      <p className="rounded-lg border border-brand-accent-ink/30 bg-brand-accent-ink/5 px-3 py-2 text-sm text-brand-accent-ink">
        Checking hides a series or product from this region&apos;s salespeople everywhere they&apos;d meet it — the
        item picker, catalogue browsing, and adding it to a quote. A quote that already has a now-hidden item keeps
        it, unchanged.
      </p>

      <SectionCard title="Series and products">
        <CatalogVisibilityEditor regionId={region.id} series={series} action={setCatalogVisibility} />
      </SectionCard>
    </div>
  );
}
