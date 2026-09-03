import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/roles";
import { getUser } from "@/lib/queries/users";
import { getCatalogVisibilityTree } from "@/lib/queries/catalog-visibility-admin";
import { setCatalogVisibility } from "@/lib/actions/catalog-visibility";
import { CatalogVisibilityEditor } from "@/components/settings/catalog-visibility-editor";
import { PageHeader, SectionCard, StatusBadge } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

type Params = { userId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { userId } = await params;
  const user = await getUser(userId);
  return { title: user ? `${user.name ?? user.email} catalog visibility` : "Catalog visibility" };
}

export default async function CatalogVisibilityUserPage({ params }: { params: Promise<Params> }) {
  const { userId } = await params;
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) notFound();

  const user = await getUser(userId);
  if (!user) notFound();

  const series = await getCatalogVisibilityTree(user.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref="/settings/catalog-visibility"
        backLabel="Catalog visibility"
        title={user.name ?? user.email}
        // Name and email both shown -- two salespeople can share a first
        // name, or have no name set at all, and only the email is unique.
        description={user.name ? user.email : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={user.active ? "green" : "slate"}>{user.active ? "Active" : "Inactive"}</StatusBadge>
      </div>

      <p className="rounded-lg border border-brand-accent-ink/30 bg-brand-accent-ink/5 px-3 py-2 text-sm text-brand-accent-ink">
        Checking hides a series or product from this user&apos;s own catalogue everywhere they&apos;d meet it — the
        item picker, catalogue browsing, and adding it to a quote. Another user, even in the same region, is
        unaffected. A quote that already has a now-hidden item keeps it, unchanged.
      </p>

      <SectionCard title="Series and products">
        <CatalogVisibilityEditor userId={user.id} series={series} action={setCatalogVisibility} />
      </SectionCard>
    </div>
  );
}
