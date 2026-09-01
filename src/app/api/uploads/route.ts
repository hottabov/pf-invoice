import { auth } from "@/auth";
import { CATALOG_TYPES, DOCUMENT_LINE_TYPES, saveUpload, UploadValidationError } from "@/lib/uploads";

// Needs real filesystem access (fs/promises) — not available on the edge
// runtime.
export const runtime = "nodejs";

/**
 * Accepts a single-file multipart upload and writes it under UPLOADS_DIR,
 * returning the `/api/files/<name>` URL the client should then save onto
 * whatever it's attached to — a product/option via
 * `updateProductImage`/`updateOptionImage` (purpose `catalog`, ADMIN-only),
 * or a document's custom extra line via `addCustomLine` (purpose
 * `document-line`, any authenticated user — a MANAGER may only attach it to
 * a line on a document they can already edit, which the existing document
 * authorization on that action covers). A missing or unrecognised `purpose`
 * defaults to `catalog` — the stricter permission path — rather than
 * silently granting the looser one.
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

  const purpose = formData.get("purpose") === "document-line" ? "document-line" : "catalog";

  if (purpose === "catalog" && session.user.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowed = purpose === "catalog" ? CATALOG_TYPES : DOCUMENT_LINE_TYPES;

  try {
    const name = await saveUpload(file, allowed);
    return Response.json({ url: `/api/files/${name}` });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
