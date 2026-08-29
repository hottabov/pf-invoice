import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getOptionDetail, listSeriesWithCounts } from "@/lib/queries/catalog";
import { updateOption, deleteOption, upsertPrice, setOptionCompatibility } from "@/lib/actions/catalog";
import { OptionForm } from "@/components/catalog/option-form";
import { PriceEditor } from "@/components/catalog/price-editor";
import { CompatEditor } from "@/components/catalog/compat-editor";
import { DeleteButton } from "@/components/catalog/delete-button";

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
    <div className="mx-auto w-full max-w-lg">
      <div>
        <p className="text-sm text-muted-foreground">Option</p>
        <h1 className="text-xl font-semibold text-brand-dark">{option.name}</h1>
        {!isAdmin && (
          <p className="mt-1 text-xs text-muted-foreground">
            View only — ask an admin to make changes.
          </p>
        )}
      </div>

      <section className="mt-6 rounded-xl border border-border bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-brand-dark">Details</h2>
        <div className="mt-4">
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
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-brand-dark">Compatible series</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Series this option is available on. Product-level overrides aren&apos;t supported yet.
        </p>
        <div className="mt-3">
          <CompatEditor
            optionId={option.id}
            series={series.map((s) => ({ id: s.id, code: s.code, name: s.name }))}
            initialSelected={option.compatSeriesCodes}
            action={setOptionCompatibility}
            readOnly={!isAdmin}
          />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-brand-dark">Prices by region</h2>
        <div className="mt-3">
          <PriceEditor
            target={{ optionId: option.id }}
            rows={option.prices}
            action={upsertPrice}
            readOnly={!isAdmin}
          />
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-brand-dark">Image</h2>
        <div className="mt-3">
          {option.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={option.imageUrl}
              alt={option.name}
              className="h-40 w-40 rounded-lg border border-border object-cover"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No image yet. Image upload is coming in a later phase.
            </p>
          )}
        </div>
      </section>

      {isAdmin && (
        <section className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deleting an option removes its prices and compatibility too. Options used on a
            document can&apos;t be deleted.
          </p>
          <div className="mt-3">
            <DeleteButton
              action={deleteOption.bind(null, option.id)}
              confirmMessage={`Delete ${option.code} — ${option.name}? This can't be undone.`}
            />
          </div>
        </section>
      )}
    </div>
  );
}
