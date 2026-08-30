import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { createOption } from "@/lib/actions/catalog";
import { OptionForm } from "@/components/catalog/option-form";
import { PageHeader, SectionCard } from "@/components/ui-kit";

export const metadata: Metadata = { title: "New option" };
export const dynamic = "force-dynamic";

export default async function NewOptionPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/catalog/options");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        backHref="/catalog/options"
        backLabel="Options"
        title="New option"
        description="A global option, available across product series."
      />

      <SectionCard>
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
      </SectionCard>
    </div>
  );
}
