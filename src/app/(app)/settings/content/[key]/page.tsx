import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getContentBlock } from "@/lib/queries/content";
import { PLACEHOLDER_HINTS } from "@/lib/content-placeholders";
import { ContentBlockEditor } from "@/components/content/content-block-editor";
import { PageHeader } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

type Params = { key: string };

// Next.js decodes a dynamic route segment before handing it to `params` —
// same as [optionCode]/[productCode] elsewhere in the app — so `key` here
// is already the raw content-block key (e.g. "software.pathworks-i"), not
// its URL-encoded form.
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { key } = await params;
  const block = await getContentBlock(key);
  return { title: block?.default?.title ? `${block.default.title} — ${key}` : key };
}

export default async function ContentBlockEditorPage({ params }: { params: Promise<Params> }) {
  const { key } = await params;
  const [session, block] = await Promise.all([auth(), getContentBlock(key)]);

  // See src/app/(app)/settings/content/page.tsx for why this is notFound()
  // rather than a redirect.
  if (session?.user?.role !== "ADMIN") notFound();
  if (!block || !block.default) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        backHref="/settings/content"
        backLabel="Content blocks"
        title={block.default.title || key}
        description={key}
      />

      <ContentBlockEditor
        blockKey={block.key}
        defaultBlock={block.default}
        overrides={block.overrides}
        activeRegions={block.activeRegions}
        placeholders={PLACEHOLDER_HINTS}
      />
    </div>
  );
}
