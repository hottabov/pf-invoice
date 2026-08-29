import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

/** Accepted upload content types, mapped to the extension we store them
 * under. Anything else is rejected. */
export const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Maximum accepted upload size, in bytes. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

/** A validation failure `saveUpload` can throw — wrong type or too large.
 * Callers (the /api/uploads route) turn this into a 400 with `.message`. */
export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

/**
 * Sniffs the first few bytes of a buffer against the known magic numbers for
 * the three formats we accept, returning the matching `ALLOWED` extension
 * (`"jpg"` / `"png"` / `"webp"`) or `null` if none match. This is a defense
 * against a caller sending a file whose declared `Content-Type` doesn't
 * match its actual bytes (e.g. an HTML/SVG/script payload relabeled as
 * `image/png` to get past the MIME check and later be served back with a
 * browser-guessed content type) — `saveUpload` calls this after the
 * declared-type check and rejects on mismatch. Pure and dependency-free so
 * it's trivially unit-testable with small constructed buffers.
 */
export function sniffImageType(buf: Buffer): "jpg" | "png" | "webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/** Filenames we write and serve look like `<uuid>.<ext>` — this is also
 * the shape `resolveUploadPath` requires before touching the filesystem, so
 * a path-traversal attempt (`../x`, `a/b.jpg`) or an unexpected extension
 * never reaches `path.join`. */
const UPLOAD_FILENAME_PATTERN = /^[a-f0-9-]{36}\.(jpg|png|webp)$/;

/** The `/api/files/<name>` URL shape stored on `Product.imageUrl` /
 * `Option.imageUrl`. Exported so the catalog server actions and this
 * module's tests validate against the exact same pattern. */
export const IMAGE_URL_PATTERN = /^\/api\/files\/[a-f0-9-]{36}\.(jpg|png|webp)$/;

/** Directory uploads are written to and served from. */
export function uploadsDir(): string {
  return process.env.UPLOADS_DIR ?? path.join(process.cwd(), "data/uploads");
}

/**
 * Validates and persists an uploaded file to `uploadsDir()` under a fresh
 * random name, returning just the filename (not a full URL — callers build
 * the `/api/files/<name>` URL themselves).
 */
export async function saveUpload(file: File): Promise<string> {
  const ext = ALLOWED[file.type];
  if (!ext) {
    throw new UploadValidationError(
      `Unsupported file type "${file.type || "unknown"}". Allowed types: JPEG, PNG, WebP.`
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError("File is too large. Maximum size is 5MB.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // The declared Content-Type is client-supplied and trivially spoofable —
  // confirm the bytes actually are what they claim to be before writing
  // anything to disk or letting the extension (and therefore the
  // Content-Type this file is later served back with) be decided by it.
  const sniffed = sniffImageType(buffer);
  if (sniffed !== ext) {
    throw new UploadValidationError(
      "File content doesn't match its declared type. Upload a genuine JPEG, PNG, or WebP image."
    );
  }

  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  // `dir` comes from UPLOADS_DIR (an external volume, e.g. /data/uploads on
  // the VPS) rather than a path under the project — tell Turbopack not to
  // trace it, or the whole project (including public/) gets bundled into
  // the server output. See the build warning this silences.
  await writeFile(path.join(/* turbopackIgnore: true */ dir, filename), buffer);

  return filename;
}

/**
 * Resolves an untrusted `name` (e.g. the `[name]` route param) to an
 * absolute path under `uploadsDir()`, or `null` if it doesn't look like a
 * name `saveUpload` could have produced — this is the only guard against
 * path traversal, so it must run before any filesystem call.
 */
export function resolveUploadPath(name: string): string | null {
  if (!UPLOAD_FILENAME_PATTERN.test(name)) return null;
  return path.resolve(uploadsDir(), name);
}
