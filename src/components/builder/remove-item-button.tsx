"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions/documents";

/**
 * Removes an item (or, later, a line) from the builder. Unlike
 * src/components/catalog/delete-button.tsx this never redirects — the
 * server action's `revalidatePath` refetches the builder page's own data,
 * so the row just disappears from the list on the next render. No confirm
 * dialog: removing an item from a draft is easily undone by adding it back,
 * unlike deleting a company or a whole document.
 */
export function RemoveItemButton({
  action,
  label = "Remove",
}: {
  action: () => Promise<ActionResult>;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleClick}
        disabled={pending}
        aria-label={label}
      >
        <X className="size-4" />
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
