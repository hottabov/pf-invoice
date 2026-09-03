import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getOptionDetailById, listSeriesWithCounts, listOtherOptions } from "@/lib/queries/catalog";
import { catalogVisibilityRegionId, filterHiddenSeries } from "@/lib/catalog-visibility";
import { getHiddenCatalogIds } from "@/lib/queries/catalog-visibility";
import {
  updateOption,
  deleteOption,
  upsertPrice,
  setOptionCompatibility,
  setOptionConflicts,
  updateOptionImage,
} from "@/lib/actions/catalog";
import { OptionForm } from "@/components/catalog/option-form";
import { PriceEditor } from "@/components/catalog/price-editor";
import { CompatEditor } from "@/components/catalog/compat-editor";
import { ConflictEditor } from "@/components/catalog/conflict-editor";
import { ImageUpload } from "@/components/catalog/image-upload";
import { DeleteButton } from "@/components/catalog/delete-button";
import { PageHeader, SectionCard } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

// Routed by Option.id, not Option.code. A code is free text an admin can
// edit at any time, and `encodeURIComponent` can't make it a safe single
// path segment either way — a `/` in the code encodes to `%2F`, which
// Node/Next normalise back into a path separator before route matching, so
// the dynamic segment never matches and the page 404s (two options in this
// catalogue already have a `/` in their code). The id never changes, so
// this also means renaming an option's code no longer breaks its URL. The
// trade-off is a less readable URL (a cuid instead of a code) — accepted
// deliberately: an opaque URL that always works beats a readable one that
// 404s on real data. Don't "simplify" this back to the code.
type Params = { optionId: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { optionId } = await params;
  const option = await getOptionDetailById(optionId);
  return { title: option ? option.code : "Option" };
}

export default async function OptionEditorPage({ params }: { params: Promise<Params> }) {
  const { optionId } = await params;
  const [option, series, otherOptions, session] = await Promise.all([
    getOptionDetailById(optionId),
    listSeriesWithCounts(),
    listOtherOptions(optionId),
    auth(),
  ]);

  if (!option) notFound();

  const isAdmin = session?.user?.role === "ADMIN";
  // Same reasoning as the options list's filter chips: the compatibility
  // editor names every series (as a checkbox row) even though this page
  // isn't the product catalogue itself — an ADMIN needs the full list to
  // actually manage compatibility (resolves to no hidden ids, see
  // `catalogVisibilityRegionId`), a read-only MANAGER doesn't need to see a
  // series their region can't sell.
  const hiddenCatalogIds = await getHiddenCatalogIds(catalogVisibilityRegionId(session?.user));
  const visibleSeries = filterHiddenSeries(series, hiddenCatalogIds);

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
              series={visibleSeries.map((s) => ({ id: s.id, code: s.code, name: s.name }))}
              initialSelected={option.compatSeriesCodes}
              action={setOptionCompatibility}
              readOnly={!isAdmin}
            />
          </SectionCard>

          <SectionCard
            title="Conflicts with"
            description="Options that can't be selected together with this one on the same item — e.g. a knife too long for a machine's cut height. Adding a conflict from either option's editor applies to both."
          >
            <ConflictEditor
              optionId={option.id}
              options={otherOptions}
              initialSelected={option.conflicts.map((c) => c.id)}
              action={setOptionConflicts}
              readOnly={!isAdmin}
            />
          </SectionCard>
        </div>
      </div>

      {isAdmin && (
        <SectionCard
          tone="danger"
          title="Danger zone"
          description="Deleting an option removes its prices, compatibility and conflicts too. Options used on a document can't be deleted."
        >
          <DeleteButton
            action={deleteOption.bind(null, option.id)}
            confirmTitle={`Delete ${option.code} — ${option.name}?`}
            confirmDescription="This removes its prices, compatibility and conflicts too. This can't be undone."
            label="Delete option"
          />
        </SectionCard>
      )}
    </div>
  );
}
