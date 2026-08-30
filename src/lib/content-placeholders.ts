import contentBlocksData from "../../prisma/seed-data/content-blocks.json";
import type { ContentBlocksJson } from "../../prisma/seed-lib";

/**
 * Static `{{token}}` -> human-readable description map, sourced directly
 * from prisma/seed-data/content-blocks.json's `placeholders` object. The
 * content-block editor's hint panel filters this down to just the tokens
 * present in whatever body is currently being edited — see
 * src/components/content/content-block-form.tsx.
 */
export const PLACEHOLDER_HINTS: Record<string, string> = (contentBlocksData as ContentBlocksJson).placeholders;
