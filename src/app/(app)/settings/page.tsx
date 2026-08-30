import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Settings2, Users } from "lucide-react";
import { auth } from "@/auth";
import { getRegionById } from "@/lib/queries/catalog";
import { PageHeader, SectionCard, StatusBadge, STATUS_TONE, EmptyState } from "@/components/ui-kit";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // AppLayout (src/app/(app)/layout.tsx) already calls requireSession and
  // redirects unauthenticated requests, so a session is always present here.
  const session = (await auth())!;
  const region = await getRegionById(session.user.regionId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title="Settings" description="Your account details." />

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

      {session.user.role === "ADMIN" ? (
        <SectionCard
          title="Content blocks"
          description="Manage reusable quote text — machine descriptions, options, terms, and conditions."
        >
          <Link
            href="/settings/content"
            className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full sm:w-auto")}
          >
            <FileText className="size-4" data-icon="inline-start" aria-hidden="true" />
            Manage content blocks
          </Link>
        </SectionCard>
      ) : null}

      {session.user.role === "ADMIN" ? (
        <SectionCard title="Users" description="Add teammates, set roles and regions, and manage sign-in access.">
          <Link
            href="/settings/users"
            className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full sm:w-auto")}
          >
            <Users className="size-4" data-icon="inline-start" aria-hidden="true" />
            Manage users
          </Link>
        </SectionCard>
      ) : null}

      <EmptyState
        icon={Settings2}
        title="More settings coming soon"
        description="Preferences and notifications will land in a later phase."
      />
    </div>
  );
}
