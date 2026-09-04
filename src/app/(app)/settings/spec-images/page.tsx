import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/roles";
import { listSpecImages } from "@/lib/queries/spec-images";
import { setSpecImage } from "@/lib/actions/spec-images";
import { SPEC_IMAGE_FIELDS } from "@/lib/production-forms/spec-images";
import { PageHeader, SectionCard } from "@/components/ui-kit";
import { CatalogueSubnav } from "@/components/settings/catalogue-subnav";
import { ImageUpload } from "@/components/catalog/image-upload";
import { DIAGRAM_SIZE_PX } from "@/components/builder/spec-diagram";

export const metadata: Metadata = { title: "Spec diagrams" };
export const dynamic = "force-dynamic";

/**
 * Settings → Catalogue → Spec diagrams: one upload slot per (field, value)
 * pair in `SPEC_IMAGE_FIELDS` (today just "screenSide" — the owner asked for
 * that one; see that module's own doc comment for how another discrete spec
 * choice would extend the same treatment). Uploading here is exactly the
 * two-step flow every other catalogue image already uses — POST to
 * /api/uploads (purpose `spec-image`), then `setSpecImage` persists the
 * returned URL — so a placeholder in the builder becomes real artwork
 * without a code change or a deploy, same as the brief asks for.
 *
 * See src/app/(app)/settings/option-conflict-groups/page.tsx for why this is
 * `notFound()` rather than a redirect for a non-admin.
 */
export default async function SpecImagesPage() {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) notFound();

  const fieldsWithImages = await Promise.all(
    SPEC_IMAGE_FIELDS.map(async (config) => ({
      config,
      items: await listSpecImages(config.field, config.values),
    }))
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Spec diagrams"
        description={`Illustrations shown beside a discrete production-spec choice in the builder, instead of a bare code like "+Y"/"-Y". Draw each one to a ${DIAGRAM_SIZE_PX}×${DIAGRAM_SIZE_PX}px box — that's the exact space it renders in.`}
      />

      <CatalogueSubnav active="spec-images" />

      {fieldsWithImages.map(({ config, items }) => (
        <SectionCard key={config.field} title={config.label}>
          <div className="flex flex-wrap gap-6">
            {items.map((item) => (
              <div key={item.value} className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-700">{item.value}</span>
                <ImageUpload
                  currentUrl={item.imageUrl}
                  alt={`${config.label}: ${item.value}`}
                  onSave={setSpecImage.bind(null, config.field, item.value)}
                  purpose="spec-image"
                  previewHeightPx={DIAGRAM_SIZE_PX}
                  removeLabel="Remove diagram"
                />
              </div>
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
