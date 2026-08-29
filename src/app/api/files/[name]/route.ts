import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { auth } from "@/auth";
import { resolveUploadPath } from "@/lib/uploads";

// Needs real filesystem access (fs/promises, fs streams) — not available on
// the edge runtime.
export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Streams a previously-uploaded image back to any authenticated user
 * (managers need to see catalog images too, not just admins). The proxy's
 * matcher excludes image-extension paths from its own auth check, so this
 * route re-checks the session itself rather than relying on the proxy.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name } = await params;
  const filePath = resolveUploadPath(name);
  if (!filePath) {
    return new Response("Not found", { status: 404 });
  }

  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const ext = name.slice(name.lastIndexOf(".") + 1);
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
  const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(size),
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
