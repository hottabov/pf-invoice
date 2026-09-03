import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/roles";
import { getContentBlock } from "@/lib/queries/content";
import { PLACEHOLDER_HINTS } from "@/lib/content-placeholders";
import { ContentBlockEditor } from "@/components/content/content-block-editor";
import { PageHeader } from "@/components/ui-kit";

export const dynamic = "force-dynamic";

type Params = { key: string };

// Next.js decodes a dynamic route segment before handing it to `params` —
// same as every dynamic segment elsewhere in the app — so `key` here is
// already the raw content-block key (e.g. "software.pathworks-i"), not its
// URL-encoded form. (The catalogue's own dynamic segments -- [optionId],
// [seriesId], [productId] -- are routed by opaque id rather than by a
// human-readable code specifically to sidestep this decoding trap for a
// value that can contain a `/`; `key` here doesn't need that because
// content-block keys are developer-defined constants, never free text an
// admin edits.)
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
  if (!isAdminRole(session?.user?.role)) notFound();
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
