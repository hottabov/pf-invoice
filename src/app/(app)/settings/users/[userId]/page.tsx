import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getUser } from "@/lib/queries/users";
import { listActiveRegions } from "@/lib/queries/catalog";
import { countActiveAdmins } from "@/lib/queries/users";
import { updateUser, setUserPassword } from "@/lib/actions/users";
import { EditUserForm } from "@/components/users/edit-user-form";
import { SetPasswordForm } from "@/components/users/set-password-form";
import { PageHeader, SectionCard, StatusBadge, STATUS_TONE } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

type Params = { userId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { userId } = await params;
  const user = await getUser(userId);
  return { title: user ? user.email : "User" };
}

export default async function EditUserPage({ params }: { params: Promise<Params> }) {
  const { userId } = await params;
  // AppLayout (src/app/(app)/layout.tsx) already calls requireSession and
  // redirects unauthenticated requests, so a session is always present here.
  const session = (await auth())!;
  if (session.user.role !== "ADMIN") notFound();

  const [user, regions, activeAdminCount] = await Promise.all([
    getUser(userId),
    listActiveRegions(),
    countActiveAdmins(),
  ]);
  if (!user) notFound();

  const isSelf = session.user.id === user.id;
  const isLastActiveAdmin = user.role === "ADMIN" && user.active && activeAdminCount <= 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref="/settings/users"
        backLabel="Users"
        title={user.email}
        description={user.name ?? undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={STATUS_TONE[user.role]}>{user.role}</StatusBadge>
        <StatusBadge tone={user.active ? "green" : "slate"}>{user.active ? "Active" : "Inactive"}</StatusBadge>
        {user.magicLinkOnly ? <StatusBadge tone="brand-outline">Magic link only</StatusBadge> : null}
        {isSelf ? <StatusBadge tone="slate">This is you</StatusBadge> : null}
      </div>

      <SectionCard title="Details">
        <EditUserForm
          action={updateUser.bind(null, user.id)}
          defaultValues={{
            name: user.name ?? "",
            role: user.role,
            regionCode: user.regionCode ?? "",
            active: user.active,
          }}
          regions={regions.map((r) => ({ code: r.code, name: r.name }))}
          isSelf={isSelf}
          isLastActiveAdmin={isLastActiveAdmin}
        />
      </SectionCard>

      <SectionCard
        title="Password"
        description={
          user.magicLinkOnly
            ? "This user currently signs in via magic link only. Setting a password also lets them sign in with it."
            : "Replaces the user's current password."
        }
      >
        <SetPasswordForm action={setUserPassword.bind(null, user.id)} />
      </SectionCard>
    </div>
  );
}
