import type { ReactNode } from "react";
import { auth } from "@/auth";
import { SettingsNav } from "@/components/settings/settings-nav";

/**
 * Wraps every /settings/* route with the section's own persistent nav (see
 * SettingsNav) so clicking a section shows it immediately, with no
 * intermediate "Settings" hub card to click through first — the point of
 * "feat: settings gets its own navigation". `role` is passed down rather
 * than re-read by the nav itself so there's exactly one place (this layout)
 * doing the session lookup for the whole area.
 *
 * AppLayout (src/app/(app)/layout.tsx) already calls requireSession and
 * redirects unauthenticated requests, so a session is always present here.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = (await auth())!;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <SettingsNav role={session.user.role} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
