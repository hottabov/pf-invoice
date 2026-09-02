import type { Metadata } from "next";
import Link from "next/link";
import { FileText, MapPin, Users } from "lucide-react";
import { auth } from "@/auth";
import { getRegionById } from "@/lib/queries/catalog";
import { getUser } from "@/lib/queries/users";
import { getQuoteValidityDays, getShowOptionIcons } from "@/lib/queries/settings";
import { updateSetting } from "@/lib/actions/settings";
import { setUserAvatar } from "@/lib/actions/users";
import { QuoteValidityForm } from "@/components/settings/quote-validity-form";
import { ShowOptionIconsForm } from "@/components/settings/show-option-icons-form";
import { ImageUpload } from "@/components/catalog/image-upload";
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
  const [region, quoteValidityDays, showOptionIcons, me] = await Promise.all([
    getRegionById(session.user.regionId),
    getQuoteValidityDays(),
    getShowOptionIcons(),
    // Own avatar, read fresh from the database rather than off the session
    // — the session JWT only revalidates every few minutes (see
    // src/auth.ts), so this shows a just-uploaded avatar immediately.
    getUser(session.user.id),
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

        {/* Own avatar — shown on the dashboard greeting, the users list (an
            ADMIN sees it too, editable from there instead — see
            /settings/users/[userId]), and on any quote this user prepares.
            `setUserAvatar` itself enforces "only your own" for a MANAGER;
            this card is reachable by both roles since /settings has no
            ADMIN-only guard. */}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-3 text-sm text-slate-500">Photo</p>
          <ImageUpload
            currentUrl={me?.image ?? null}
            alt={session.user.name ?? session.user.email ?? "Your avatar"}
            onSave={setUserAvatar.bind(null, session.user.id)}
            purpose="avatar"
            previewHeightPx={96}
          />
        </div>
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
