import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getOptionDetail, listSeriesWithCounts } from "@/lib/queries/catalog";
import {
  updateOption,
  deleteOption,
  upsertPrice,
  setOptionCompatibility,
  updateOptionImage,
} from "@/lib/actions/catalog";
import { OptionForm } from "@/components/catalog/option-form";
import { PriceEditor } from "@/components/catalog/price-editor";
import { CompatEditor } from "@/components/catalog/compat-editor";
import { ImageUpload } from "@/components/catalog/image-upload";
import { DeleteButton } from "@/components/catalog/delete-button";
import { PageHeader, SectionCard } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

type Params = { optionCode: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { optionCode } = await params;
  const option = await getOptionDetail(optionCode);
  return { title: option ? option.code : "Option" };
}

export default async function OptionEditorPage({ params }: { params: Promise<Params> }) {
  const { optionCode } = await params;
  const [option, series, session] = await Promise.all([
    getOptionDetail(optionCode),
    listSeriesWithCounts(),
    auth(),
  ]);

  if (!option) notFound();

  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref="/catalog/options"
        backLabel="Options"
        title={option.name}
        description={isAdmin ? option.code : "View only — ask an admin to make changes."}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        <SectionCard title="Details" className="lg:col-span-2">
          <OptionForm
            action={updateOption.bind(null, option.id)}
            defaultValues={{
              code: option.code,
              name: option.name,
              shortDescription: option.shortDescription ?? "",
              attributeSchema: option.attributeSchema
                ? JSON.stringify(option.attributeSchema, null, 2)
                : "",
              active: option.active,
              sortOrder: option.sortOrder,
            }}
            submitLabel="Save changes"
            readOnly={!isAdmin}
          />
        </SectionCard>

        <div className="flex flex-col gap-6">
          <SectionCard title="Image">
            <ImageUpload
              currentUrl={option.imageUrl}
              alt={option.name}
              onSave={updateOptionImage.bind(null, option.id)}
              readOnly={!isAdmin}
            />
          </SectionCard>

          <SectionCard title="Prices by region">
            <PriceEditor
              target={{ optionId: option.id }}
              rows={option.prices}
              action={upsertPrice}
              readOnly={!isAdmin}
            />
          </SectionCard>

          <SectionCard
            title="Compatible series"
            description="Series this option is available on. Product-level overrides aren't supported yet."
          >
            <CompatEditor
              optionId={option.id}
              series={series.map((s) => ({ id: s.id, code: s.code, name: s.name }))}
              initialSelected={option.compatSeriesCodes}
              action={setOptionCompatibility}
              readOnly={!isAdmin}
            />
          </SectionCard>
        </div>
      </div>

      {isAdmin && (
        <SectionCard
          tone="danger"
          title="Danger zone"
          description="Deleting an option removes its prices and compatibility too. Options used on a document can't be deleted."
        >
          <DeleteButton
            action={deleteOption.bind(null, option.id)}
            confirmTitle={`Delete ${option.code} — ${option.name}?`}
            confirmDescription="This removes its prices and compatibility too. This can't be undone."
            label="Delete option"
          />
        </SectionCard>
      )}
    </div>
  );
}
