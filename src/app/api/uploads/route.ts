import { auth } from "@/auth";
import {
  AVATAR_TYPES,
  CATALOG_TYPES,
  DOCUMENT_HERO_TYPES,
  DOCUMENT_LINE_TYPES,
  saveUpload,
  UploadValidationError,
  type UploadPurpose,
} from "@/lib/uploads";
import { isAdminRole } from "@/lib/roles";

// Needs real filesystem access (fs/promises) — not available on the edge
// runtime.
export const runtime = "nodejs";

/** Every recognised `purpose` value, mapped to its allow-list and whether it
 * requires ADMIN/DEVELOPER (`isAdminRole`). A missing or unrecognised
 * `purpose` in the request falls back to `"catalog"` below — the strictest
 * permission path — rather than silently granting a looser one. */
const PURPOSE_CONFIG: Record<UploadPurpose, { allowed: readonly string[]; adminOnly: boolean }> = {
  // Product/option/series images via `updateProductImage`/`updateOptionImage`
  // (src/lib/actions/catalog.ts).
  catalog: { allowed: CATALOG_TYPES, adminOnly: true },
  // A document's custom extra line via `addCustomLine` — any authenticated
  // user; a MANAGER may only attach it to a line on a document they can
  // already edit, which that action's own document authorization covers.
  "document-line": { allowed: DOCUMENT_LINE_TYPES, adminOnly: false },
  // A user's avatar via `setUserAvatar` (src/lib/actions/users.ts) — any
  // authenticated user; this route only validates and stores the file, the
  // *whose avatar* rule lives in that action since it needs the target user
  // id this route never sees.
  avatar: { allowed: AVATAR_TYPES, adminOnly: false },
  // A quotation's setup image via `setDocumentHeroImage`
  // (src/lib/actions/documents.ts) — any authenticated user, same reasoning
  // as `document-line`: the document-scoped authorization lives in that
  // action, not here.
  "document-hero": { allowed: DOCUMENT_HERO_TYPES, adminOnly: false },
};

function parsePurpose(raw: FormDataEntryValue | null): UploadPurpose {
  return raw !== null && typeof raw === "string" && raw in PURPOSE_CONFIG ? (raw as UploadPurpose) : "catalog";
}

/**
 * Accepts a single-file multipart upload and writes it under UPLOADS_DIR,
 * returning the `/api/files/<name>` URL the client should then save onto
 * whatever it's attached to — see `PURPOSE_CONFIG` above for what each
 * `purpose` value is for and who may use it.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 });
  }

  const purpose = parsePurpose(formData.get("purpose"));
  const config = PURPOSE_CONFIG[purpose];

  if (config.adminOnly && !isAdminRole(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const name = await saveUpload(file, config.allowed);
    return Response.json({ url: `/api/files/${name}` });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
