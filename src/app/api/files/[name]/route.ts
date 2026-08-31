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
  svg: "image/svg+xml",
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

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Length": String(size),
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  };
  // SVG is XML that can carry <script>/event-handler content -- sandbox it
  // so a direct navigation to this URL can't execute anything, even though
  // nosniff already stops a browser from reinterpreting it as another type.
  // Embedding via <img> (how icons/logos are actually used) is unaffected:
  // the sandboxed-document restriction only applies to top-level navigation
  // and non-image embeds (e.g. <iframe>/<object>).
  if (ext === "svg") {
    headers["Content-Security-Policy"] = "sandbox";
  }

  return new Response(body, { headers });
}
