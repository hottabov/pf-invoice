"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { fieldInputClass, useToast } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { renderMarkdown } from "@/lib/markdown";
import { applyMarkdownEdit, type MarkdownEdit } from "@/lib/markdown-editor";
import { MarkdownToolbar } from "@/components/content/markdown-toolbar";
import type { ActionResult } from "@/lib/actions/documents";

/** Same hand-rolled "prose" ruleset `ContentBlockForm`'s preview pane uses
 * (src/components/content/content-block-form.tsx) — targets exactly the tags
 * `renderMarkdown` can produce, no @tailwindcss/typography plugin involved. */
const PREVIEW_PROSE_CLASS =
  "[&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-brand-dark [&_h1:first-child]:mt-0 " +
  "[&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-brand-dark [&_h2:first-child]:mt-0 " +
  "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-brand-dark [&_h3:first-child]:mt-0 " +
  "[&_p]:mb-2 [&_p:last-child]:mb-0 " +
  "[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul:last-child]:mb-0 [&_ul_ul]:mt-1 [&_ul_ul]:mb-0 " +
  "[&_li]:mb-0.5 [&_strong]:font-semibold [&_strong]:text-brand-dark [&_em]:italic";

/**
 * The builder's "Notes" section (owner: freeform remarks on a document,
 * carried through to both renderers — the quotation sheet via
 * `renderMarkdown`, the plain document/invoice sheet as plain text) — a
 * smaller sibling of `ContentBlockForm`'s markdown editor (same toolbar via
 * `MarkdownToolbar`, same `document.execCommand`-first / manual-splice-
 * fallback edit-apply plumbing) but without a title field or a placeholder
 * sidebar: just body + a write/preview tab toggle + one Save button, calling
 * `setDocumentNotes` directly (DRAFT-only — see that action). Rendered for
 * both QUOTE and INVOICE documents (see the builder page).
 *
 * Read-only (a FINAL document, or the caller otherwise passing
 * `readOnly`) renders the last-saved notes as read markdown, or nothing at
 * all when there aren't any — the caller decides whether an empty
 * `SectionCard` is worth showing in that case.
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
  const [body, setBody] = useState(notes ?? "");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelectionRef = useRef<[number, number] | null>(null);

  // Same caret-restore dance as ContentBlockForm's own `applyEdit` — see its
  // doc comment for why this can't just be set synchronously in the click
  // handler.
  useEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending) return;
    pendingSelectionRef.current = null;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(pending[0], pending[1]);
  }, [body]);

  function applyEdit(edit: MarkdownEdit) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus();
    textarea.setSelectionRange(edit.start, edit.end);

    let handledNatively = false;
    if (typeof document.execCommand === "function") {
      try {
        handledNatively = document.execCommand("insertText", false, edit.insertText);
      } catch {
        handledNatively = false;
      }
    }

    if (handledNatively) {
      requestAnimationFrame(() => {
        textarea.setSelectionRange(edit.caretStart, edit.caretEnd);
      });
    } else {
      setBody((current) => applyMarkdownEdit(current, edit));
      pendingSelectionRef.current = [edit.caretStart, edit.caretEnd];
    }
  }

  function withSelection(compute: (value: string, start: number, end: number) => MarkdownEdit) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    applyEdit(compute(textarea.value, textarea.selectionStart, textarea.selectionEnd));
  }

  const previewHtml = useMemo(() => renderMarkdown(body), [body]);

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
      <div className={cn("text-sm text-slate-700", PREVIEW_PROSE_CLASS)}>
        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(notes) }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-brand-dark">Body (Markdown)</span>
        <div role="tablist" aria-label="Editor view" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "focus-ring rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                tab === t ? "bg-brand text-white" : "text-slate-500 hover:text-brand-dark"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "write" ? (
        <div className="flex flex-col">
          <MarkdownToolbar idPrefix="doc-notes" disabled={pending} withSelection={withSelection} />
          <textarea
            ref={textareaRef}
            id="doc-notes-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            rows={8}
            disabled={pending}
            placeholder="Freeform remarks for this document…"
            className={cn(fieldInputClass, "h-auto min-h-[10rem] rounded-t-none py-2 font-mono text-sm")}
          />
        </div>
      ) : (
        <div className={cn("min-h-[10rem] rounded-lg border border-slate-200 bg-white p-4", PREVIEW_PROSE_CLASS)}>
          {previewHtml ? (
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <p className="text-sm text-slate-400">Nothing to preview yet.</p>
          )}
        </div>
      )}

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
