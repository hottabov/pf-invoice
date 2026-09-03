import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/roles";
import { listActiveRegions } from "@/lib/queries/catalog";
import { createUser } from "@/lib/actions/users";
import { UserForm } from "@/components/users/user-form";
import { PageHeader, SectionCard } from "@/components/ui-kit";

export const metadata: Metadata = { title: "New user" };
export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) notFound();

  const regions = await listActiveRegions();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref="/settings/users"
        backLabel="Users"
        title="New user"
        description="Created active. They can sign in as soon as they have a password or use a magic link."
      />

      <SectionCard>
        <UserForm action={createUser} regions={regions.map((r) => ({ code: r.code, name: r.name }))} />
      </SectionCard>
    </div>
  );
}
