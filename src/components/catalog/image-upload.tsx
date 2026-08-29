"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions/catalog";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

/**
 * Image preview + upload/remove controls for a product or option. Uploading
 * is a two-step flow: the file is first POSTed to /api/uploads (which
 * validates type/size and writes it under UPLOADS_DIR, returning a
 * `/api/files/<name>` URL), then the bound `onSave` server action
 * (`updateProductImage`/`updateOptionImage`) persists that URL onto the
 * product/option row. "Remove image" calls the same action with `null`.
 */
export function ImageUpload({
  currentUrl,
  alt,
  onSave,
  readOnly = false,
}: {
  currentUrl: string | null;
  alt: string;
  onSave: (url: string | null) => Promise<ActionResult>;
  /** MANAGER view: show the image (if any) with no upload/remove controls. */
  readOnly?: boolean;
}) {
  const [url, setUrl] = useState(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
        setError(body?.error ?? "Upload failed.");
        return;
      }
      uploadedUrl = body.url;
    } catch {
      setError("Upload failed. Check your connection and try again.");
      return;
    } finally {
      setUploading(false);
    }

    startTransition(async () => {
      const result = await onSave(uploadedUrl);
      if (result.error) {
        setError(result.error);
        return;
      }
      setUrl(uploadedUrl);
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await onSave(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setUrl(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          className="h-32 w-auto rounded-lg border border-border object-contain"
        />
      ) : (
        <p className="text-sm text-muted-foreground">No image yet.</p>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept={ACCEPTED_TYPES}
            onChange={handleFileChange}
            disabled={busy}
            aria-label="Upload image"
            className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
          />
          {url ? (
            <Button type="button" variant="outline" onClick={handleRemove} disabled={busy}>
              Remove image
            </Button>
          ) : null}
          {busy ? <span className="text-sm text-muted-foreground">Saving…</span> : null}
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
