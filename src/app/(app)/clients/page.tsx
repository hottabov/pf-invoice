import type { Metadata } from "next";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-xl font-semibold text-brand-dark">Clients</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming in a later phase.</p>
    </div>
  );
}
