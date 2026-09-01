"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { ImageIcon, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/catalog";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

/**
 * Image preview + upload/remove controls for a product or option. Uploading
 * is a two-step flow: the file is first POSTed to /api/uploads (which
 * validates type/size and writes it under UPLOADS_DIR, returning a
 * `/api/files/<name>` URL), then the bound `onSave` server action
 * (`updateProductImage`/`updateOptionImage`) persists that URL onto the
 * product/option row. "Remove image" calls the same action with `null`.
 * The dashed border reads as a dropzone even though the only interaction
 * is the file picker button below it (no drag-and-drop wiring — presentation
 * only, per phase 5b scope).
 */
export function ImageUpload({
  currentUrl,
  alt,
  onSave,
  readOnly = false,
  previewHeightPx,
  removeLabel = "Remove image",
}: {
  currentUrl: string | null;
  alt: string;
  onSave: (url: string | null) => Promise<ActionResult>;
  /** MANAGER view: show the image (if any) with no upload/remove controls. */
  readOnly?: boolean;
  /** Fixed preview height in pixels, e.g. 120 for a region logo. Defaults to
   * the catalog product/option preview size (~112px via `h-28`) when
   * omitted. */
  previewHeightPx?: number;
  /** Label for the button that calls `onSave(null)`. Defaults to "Remove
   * image"; the series editor overrides this to "Reset to product image"
   * since a series' `null` isn't "no image" -- it falls back to a product
   * photo (see updateSeriesImage in src/lib/actions/catalog.ts). */
  removeLabel?: string;
}) {
  const [url, setUrl] = useState(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const busy = uploading || pending;

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so selecting the same file again still fires onChange.
    event.target.value = "";
    if (!file) return;

    setError(null);
    setUploading(true);
    let uploadedUrl: string;
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/uploads", { method: "POST", body: formData });
      const body = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (!response.ok || !body?.url) {
        const message = body?.error ?? "Upload failed.";
        setError(message);
        toast.error(message);
        return;
      }
      uploadedUrl = body.url;
    } catch {
      const message = "Upload failed. Check your connection and try again.";
      setError(message);
      toast.error(message);
      return;
    } finally {
      setUploading(false);
    }

    startTransition(async () => {
      const result = await onSave(uploadedUrl);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setUrl(uploadedUrl);
      toast.success("Image saved");
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await onSave(null);
      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setUrl(null);
      toast.success("Image removed");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-center",
          url ? "py-3" : "py-6"
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={alt}
            style={previewHeightPx ? { height: previewHeightPx } : undefined}
            className={cn(
              "w-auto max-w-full rounded-lg border border-slate-200 bg-white object-contain",
              previewHeightPx ? undefined : "h-28"
            )}
          />
        ) : (
          <>
            <div className="flex size-10 items-center justify-center rounded-full bg-slate-100">
              <ImageIcon className="size-5 text-slate-400" aria-hidden="true" />
            </div>
            <p className="text-sm text-slate-500">No image yet.</p>
          </>
        )}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={busy} className="relative h-11 overflow-hidden">
            <Upload className="size-4" data-icon="inline-start" aria-hidden="true" />
            {url ? "Replace image" : "Upload image"}
            <input
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleFileChange}
              disabled={busy}
              aria-label="Upload image"
              className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
          </Button>
          {url ? (
            <Button type="button" variant="outline" onClick={handleRemove} disabled={busy} className="h-11">
              {removeLabel}
            </Button>
          ) : null}
          {busy ? <span className="text-sm text-slate-500">Saving…</span> : null}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
