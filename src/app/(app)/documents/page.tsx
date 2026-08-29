import type { Metadata } from "next";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-xl font-semibold text-brand-dark">Documents</h1>
      <p className="mt-2 text-sm text-muted-foreground">Coming in a later phase.</p>
    </div>
  );
}
