import type { Metadata } from "next";
import { auth } from "@/auth";
import { getRegionById } from "@/lib/queries/catalog";
import { PageHeader, SectionCard, StatusBadge, STATUS_TONE } from "@/components/ui-kit";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

/**
 * The Account section — email, role, region. Open to every signed-in user
 * (see SettingsNav), unlike every section below it in the nav.
 *
 * No photo control here on purpose: a MANAGER's own avatar is editable
 * where they actually see it, on the dashboard greeting (see AvatarEditor).
 * An ADMIN (or DEVELOPER) changes *other* people's photos from
 * /settings/users/[userId]. One control per audience.
 */
export default async function AccountSettingsPage() {
  // AppLayout (src/app/(app)/layout.tsx) already calls requireSession and
  // redirects unauthenticated requests, so a session is always present here.
  const session = (await auth())!;
  const region = await getRegionById(session.user.regionId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Account" description="Your account details." />

      <SectionCard title="Account">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-slate-500">Email</dt>
            <dd className="text-sm font-medium text-brand-dark">{session.user.email}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-slate-500">Role</dt>
            <dd>
              <StatusBadge tone={STATUS_TONE[session.user.role]}>{session.user.role}</StatusBadge>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-slate-500">Region</dt>
            <dd className="text-sm font-medium text-brand-dark">
              {region ? `${region.name} (${region.code})` : "Not set"}
            </dd>
          </div>
        </dl>
      </SectionCard>
    </div>
  );
}
