import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Users, Package, Settings, LogOut } from "lucide-react";
import { auth } from "@/auth";
import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    href: "#",
    label: "Documents",
    description: "Quotes and invoices",
    icon: FileText,
  },
  {
    href: "#",
    label: "Clients",
    description: "Manage your customers",
    icon: Users,
  },
  {
    href: "#",
    label: "Catalog",
    description: "Products and pricing",
    icon: Package,
  },
  {
    href: "#",
    label: "Settings",
    description: "Account and preferences",
    icon: Settings,
  },
] as const;

export default async function Home() {
  const session = await auth();
  // The proxy guarantees an authenticated request reaches this route, but
  // handle a null session defensively (e.g. a revoked token that hasn't
  // hit the proxy's revalidation window yet) rather than rendering with
  // undefined user data.
  if (!session?.user) {
    redirect("/login");
  }

  const { email, role } = session.user;
  const isAdmin = role === "ADMIN";

  return (
    <div className="flex min-h-full flex-col bg-zinc-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-4 py-3">
        <span className="text-lg font-semibold text-brand">PathQuote</span>
        <div className="flex items-center gap-3">
          <span className="hidden max-w-[12rem] truncate text-sm text-muted-foreground sm:inline">
            {email}
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              isAdmin
                ? "bg-brand text-white"
                : "border border-brand text-brand"
            )}
          >
            {role}
          </span>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="icon" aria-label="Log out">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 pb-24 md:pb-6">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          {NAV_ITEMS.map(({ href, label, description, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className="flex min-h-24 flex-col justify-center gap-1 rounded-xl border border-border bg-white p-4 text-brand-dark transition-colors hover:border-brand-accent hover:bg-muted active:bg-muted"
            >
              <span className="flex items-center gap-2 font-medium">
                <Icon className="size-5 text-brand" />
                {label}
              </span>
              <span className="text-sm text-muted-foreground">{description}</span>
            </Link>
          ))}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-border bg-white md:hidden">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            className="flex flex-col items-center justify-center gap-1 py-2 text-xs text-brand-dark active:bg-muted"
          >
            <Icon className="size-5 text-brand" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
