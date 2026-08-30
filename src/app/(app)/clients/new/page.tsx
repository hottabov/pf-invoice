import type { Metadata } from "next";
import { listActiveRegions } from "@/lib/queries/catalog";
import { createCompany } from "@/lib/actions/clients";
import { CompanyForm } from "@/components/clients/company-form";

export const metadata: Metadata = { title: "New company" };
export const dynamic = "force-dynamic";

export default async function NewCompanyPage() {
  const regions = await listActiveRegions();

  return (
    <div className="mx-auto w-full max-w-lg">
      <h1 className="text-xl font-semibold text-brand-dark">New company</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Add a client company. You can add contacts once it&apos;s created.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-white p-4 sm:p-6">
        <CompanyForm
          action={createCompany}
          defaultValues={{
            name: "",
            street: "",
            city: "",
            state: "",
            postcode: "",
            country: "",
            website: "",
            taxId: "",
            notes: "",
            regionCode: regions[0]?.code ?? "",
          }}
          regions={regions.map((r) => ({ code: r.code, name: r.name }))}
          submitLabel="Create company"
        />
      </div>
    </div>
  );
}
