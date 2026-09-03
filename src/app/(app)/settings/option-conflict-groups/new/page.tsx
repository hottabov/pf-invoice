import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/roles";
import { createConflictGroup } from "@/lib/actions/catalog";
import { ConflictGroupForm } from "@/components/settings/conflict-group-form";
import { PageHeader, SectionCard } from "@/components/ui-kit";

export const metadata: Metadata = { title: "New conflict group" };
export const dynamic = "force-dynamic";

export default async function NewConflictGroupPage() {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref="/settings/option-conflict-groups"
        backLabel="Option conflict groups"
        title="New conflict group"
        description="Created with no members — add them from the group's own page once it exists."
      />

      <SectionCard>
        <ConflictGroupForm action={createConflictGroup} defaultValue="" submitLabel="Create group" />
      </SectionCard>
    </div>
  );
}
