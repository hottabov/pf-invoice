import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { createOption } from "@/lib/actions/catalog";
import { OptionForm } from "@/components/catalog/option-form";

export const metadata: Metadata = { title: "New option" };
export const dynamic = "force-dynamic";

export default async function NewOptionPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/catalog/options");

  return (
    <div className="mx-auto w-full max-w-lg">
      <h1 className="text-xl font-semibold text-brand-dark">New option</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        A global option, available across product series.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-white p-4 sm:p-6">
        <OptionForm
          action={createOption}
          defaultValues={{
            code: "",
            name: "",
            shortDescription: "",
            attributeSchema: "",
            active: true,
            sortOrder: 0,
          }}
          submitLabel="Create option"
        />
      </div>
    </div>
  );
}
