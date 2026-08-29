import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getCompanyDetail } from "@/lib/queries/clients";
import { listActiveRegions } from "@/lib/queries/catalog";
import { updateCompany, deleteCompany, createContact, updateContact, deleteContact } from "@/lib/actions/clients";
import { CompanyForm } from "@/components/clients/company-form";
import { ContactsSection } from "@/components/clients/contacts-section";
import { DeleteButton } from "@/components/catalog/delete-button";

export const dynamic = "force-dynamic";

type Params = { companyId: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { companyId } = await params;
  // Metadata runs before the page body — re-check scope here too so a
  // manager browsing to a foreign company never even sees its name in the
  // tab title.
  const session = (await auth())!;
  const company = await getCompanyDetail(session.user, companyId);
  return { title: company ? company.name : "Company" };
}

export default async function CompanyEditorPage({ params }: { params: Promise<Params> }) {
  const { companyId } = await params;
  // AppLayout (src/app/(app)/layout.tsx) already calls requireSession and
  // redirects unauthenticated requests, so a session is always present here.
  const session = (await auth())!;

  const [company, regions] = await Promise.all([
    getCompanyDetail(session.user, companyId),
    listActiveRegions(),
  ]);

  // A foreign company (belongs to another manager) resolves to the same
  // `null` as a nonexistent one — never leak which case it was.
  if (!company) notFound();

  return (
    <div className="mx-auto w-full max-w-lg">
      <div>
        <p className="text-sm text-muted-foreground">Company</p>
        <h1 className="text-xl font-semibold text-brand-dark">{company.name}</h1>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-brand-dark">Details</h2>
        <div className="mt-4">
          <CompanyForm
            action={updateCompany.bind(null, company.id)}
            defaultValues={{
              name: company.name,
              street: company.street ?? "",
              city: company.city ?? "",
              state: company.state ?? "",
              postcode: company.postcode ?? "",
              country: company.country ?? "",
              taxId: company.taxId ?? "",
              notes: company.notes ?? "",
              regionCode: company.regionCode,
            }}
            regions={regions.map((r) => ({ code: r.code, name: r.name }))}
            submitLabel="Save changes"
          />
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-brand-dark">Contacts</h2>
        <div className="mt-4">
          <ContactsSection
            companyId={company.id}
            contacts={company.contacts}
            actions={{ createContact, updateContact, deleteContact }}
          />
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Deleting a company removes its contacts too. Companies with quotes or invoices
          can&apos;t be deleted.
        </p>
        <div className="mt-3">
          <DeleteButton
            action={deleteCompany.bind(null, company.id)}
            confirmMessage={`Delete ${company.name}? This can't be undone.`}
          />
        </div>
      </section>
    </div>
  );
}
