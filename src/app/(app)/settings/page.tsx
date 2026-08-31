import type { Metadata } from "next";
import Link from "next/link";
import { FileText, MapPin, Users } from "lucide-react";
import { auth } from "@/auth";
import { getRegionById } from "@/lib/queries/catalog";
import { getQuoteValidityDays, getShowOptionIcons } from "@/lib/queries/settings";
import { updateSetting } from "@/lib/actions/settings";
import { QuoteValidityForm } from "@/components/settings/quote-validity-form";
import { ShowOptionIconsForm } from "@/components/settings/show-option-icons-form";
import { PageHeader, SectionCard, StatusBadge, STATUS_TONE } from "@/components/ui-kit";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // AppLayout (src/app/(app)/layout.tsx) already calls requireSession and
  // redirects unauthenticated requests, so a session is always present here.
  const session = (await auth())!;
  const isAdmin = session.user.role === "ADMIN";
  const [region, quoteValidityDays, showOptionIcons] = await Promise.all([
    getRegionById(session.user.regionId),
    getQuoteValidityDays(),
    getShowOptionIcons(),
  ]);

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

      <SectionCard
        title="Preferences"
        description="Defaults applied across the app."
      >
        {isAdmin ? (
          <div className="flex flex-col gap-4">
            <QuoteValidityForm
              action={updateSetting.bind(null, "quote.validityDays")}
              defaultValue={quoteValidityDays}
            />
            <div className="border-t border-slate-100 pt-4">
              <ShowOptionIconsForm
                action={updateSetting.bind(null, "ui.showOptionIcons")}
                defaultValue={showOptionIcons}
              />
            </div>
          </div>
        ) : (
          <dl className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-slate-500">Quote validity (days)</dt>
              <dd className="text-sm font-medium text-brand-dark">{quoteValidityDays}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-slate-500">Show option icons</dt>
              <dd className="text-sm font-medium text-brand-dark">{showOptionIcons ? "On" : "Off"}</dd>
            </div>
          </dl>
        )}
      </SectionCard>

      {isAdmin ? (
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

      {isAdmin ? (
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

      {isAdmin ? (
        <SectionCard
          title="Regions"
          description="Currency, tax, and legal-entity details used to build documents."
        >
          <Link
            href="/settings/regions"
            className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full sm:w-auto")}
          >
            <MapPin className="size-4" data-icon="inline-start" aria-hidden="true" />
            Manage regions
          </Link>
        </SectionCard>
      ) : null}
    </div>
  );
}
