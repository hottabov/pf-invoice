import type { Metadata } from "next";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/roles";
import { getQuoteValidityDays, getShowOptionIcons } from "@/lib/queries/settings";
import { updateSetting } from "@/lib/actions/settings";
import { QuoteValidityForm } from "@/components/settings/quote-validity-form";
import { ShowOptionIconsForm } from "@/components/settings/show-option-icons-form";
import { PageHeader, SectionCard } from "@/components/ui-kit";

export const metadata: Metadata = { title: "Preferences" };
export const dynamic = "force-dynamic";

/**
 * The Preferences section — defaults applied across the app (quote
 * validity, whether option icons show). Where small settings collect as the
 * app grows. Open to every signed-in user (see SettingsNav): an ADMIN/
 * DEVELOPER can edit, a MANAGER sees the current values read-only.
 */
export default async function PreferencesSettingsPage() {
  // AppLayout (src/app/(app)/layout.tsx) already calls requireSession and
  // redirects unauthenticated requests, so a session is always present here.
  const session = (await auth())!;
  const isAdmin = isAdminRole(session.user.role);
  const [quoteValidityDays, showOptionIcons] = await Promise.all([
    getQuoteValidityDays(),
    getShowOptionIcons(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Preferences" description="Defaults applied across the app." />

      <SectionCard title="Preferences">
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
    </div>
  );
}
