"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A danger-zone delete button. Confirms via `window.confirm`, then calls
 * the bound delete server action directly. On success the action redirects
 * away (Next.js turns that into a client-side navigation even when the
 * action was invoked outside a <form>); on failure (e.g. "still referenced
 * by a document") it shows the returned error inline instead.
 */
export function DeleteButton({
  action,
  confirmMessage,
  label = "Delete",
}: {
  action: () => Promise<{ error?: string }>;
  confirmMessage: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!window.confirm(confirmMessage)) return;
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="destructive"
        onClick={handleClick}
        disabled={pending}
        className="w-fit"
      >
        <Trash2 className="size-4" data-icon="inline-start" />
        {pending ? "Deleting…" : label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
