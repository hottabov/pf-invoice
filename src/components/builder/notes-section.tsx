"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui-kit";
import { RichTextEditor, RICH_TEXT_PROSE_CLASS } from "@/components/ui-kit/rich-text-editor";
import { cn } from "@/lib/utils";
import { toEditorHtml, renderStoredRichText } from "@/lib/rich-text";
import type { ActionResult } from "@/lib/actions/documents";

/**
 * The builder's "Notes" section (owner: freeform remarks on a document,
 * carried through to both renderers — the quotation sheet and the plain
 * document/invoice sheet, both via `renderStoredRichText`) — a smaller
 * sibling of `ContentBlockForm`'s `RichTextEditor` (WYSIWYG, formatted text
 * shows immediately, no separate preview pane) but without a title field or
 * a placeholder sidebar: just the editor + one Save button, calling
 * `setDocumentNotes` directly (DRAFT-only — see that action). Rendered for
 * both QUOTE and INVOICE documents (see the builder page).
 *
 * `notes` may still be a legacy markdown row (`toEditorHtml` normalizes it
 * to HTML for the editor on first load — see src/lib/rich-text.ts); once
 * saved, it's always HTML from then on. `setDocumentNotes` sanitizes on
 * write, so this component doesn't need to.
 *
 * Read-only (a FINAL document, or the caller otherwise passing
 * `readOnly`) renders the last-saved notes via `renderStoredRichText`, or
 * nothing at all when there aren't any — the caller decides whether an
 * empty `SectionCard` is worth showing in that case.
 */
export function NotesSection({
  documentId,
  notes,
  setNotesAction,
  readOnly = false,
}: {
  documentId: string;
  notes: string | null;
  setNotesAction: (documentId: string, formData: FormData) => Promise<ActionResult>;
  readOnly?: boolean;
}) {
  const toast = useToast();
  const [body, setBody] = useState(() => toEditorHtml(notes ?? ""));
  const [pending, startTransition] = useTransition();

  function handleSave() {
    const formData = new FormData();
    formData.set("notes", body);
    startTransition(async () => {
      const result = await setNotesAction(documentId, formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Saved");
    });
  }

  if (readOnly) {
    if (!notes) return <p className="text-sm text-slate-500">No notes.</p>;
    return (
      <div className={cn("text-sm text-slate-700", RICH_TEXT_PROSE_CLASS)}>
        <div dangerouslySetInnerHTML={{ __html: renderStoredRichText(notes) }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium text-brand-dark">Body</span>
      <RichTextEditor
        value={body}
        onChange={setBody}
        disabled={pending}
        placeholder="Freeform remarks for this document…"
      />
      <Button
        type="button"
        onClick={handleSave}
        disabled={pending}
        className="h-11 w-full bg-brand text-white hover:bg-brand/90 sm:w-auto sm:self-start"
      >
        {pending ? "Saving…" : "Save notes"}
      </Button>
    </div>
  );
}
