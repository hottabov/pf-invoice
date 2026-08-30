import type { Metadata } from "next";
import { listActiveRegions } from "@/lib/queries/catalog";
import { createCompany } from "@/lib/actions/clients";
import { CompanyForm } from "@/components/clients/company-form";
import { PageHeader, SectionCard } from "@/components/ui-kit";

export const metadata: Metadata = { title: "New company" };
export const dynamic = "force-dynamic";

export default async function NewCompanyPage() {
  const regions = await listActiveRegions();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref="/clients"
        backLabel="Clients"
        title="New company"
        description="Add a client company. You can add contacts once it's created."
      />

      <SectionCard>
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
      </SectionCard>
    </div>
  );
}
