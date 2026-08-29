import { auth } from "@/auth";
import { saveUpload, UploadValidationError } from "@/lib/uploads";

// Needs real filesystem access (fs/promises) — not available on the edge
// runtime.
export const runtime = "nodejs";

/**
 * Accepts a single-file multipart upload from an admin and writes it under
 * UPLOADS_DIR, returning the `/api/files/<name>` URL the client should then
 * save onto the product/option via `updateProductImage`/`updateOptionImage`.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
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

  try {
    const name = await saveUpload(file);
    return Response.json({ url: `/api/files/${name}` });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
