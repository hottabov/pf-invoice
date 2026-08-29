import { auth } from "@/auth";
import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-brand">PathQuote</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-brand-dark">{session?.user?.email}</span>
        </p>
        <form action={logout}>
          <Button type="submit" variant="outline">
            Log out
          </Button>
        </form>
      </div>
    </div>
  );
}
