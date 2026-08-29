import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { AppNav } from "@/components/app-nav";
import { cn } from "@/lib/utils";

type AppShellProps = {
  user: {
    email?: string | null;
    role: string;
  };
  children: ReactNode;
};

// Server component: top bar (wordmark, email, role badge, logout) plus a
// responsive nav — a left sidebar on md+ and a fixed bottom bar on mobile,
// both rendered by the client AppNav component so it can highlight the
// active route via usePathname().
export function AppShell({ user, children }: AppShellProps) {
  const isAdmin = user.role === "ADMIN";

  return (
    <div className="flex min-h-full flex-col bg-zinc-50">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-white px-4 py-3">
        <span className="text-lg font-semibold text-brand">PathQuote</span>
        <div className="flex items-center gap-3">
          <span className="hidden max-w-[12rem] truncate text-sm text-muted-foreground sm:inline">
            {user.email}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              isAdmin ? "bg-brand text-white" : "border border-brand text-brand"
            )}
          >
            {user.role}
          </span>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="icon" aria-label="Log out">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-56 shrink-0 border-r border-border bg-white md:block">
          <AppNav variant="sidebar" />
        </aside>

        <main className="flex-1 px-4 py-6 pb-24 md:pb-6">{children}</main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-white md:hidden">
        <AppNav variant="bottom" />
      </div>
    </div>
  );
}
