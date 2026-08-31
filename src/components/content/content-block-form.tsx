"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { Bold, Italic, Heading1, Heading2, Heading3, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldRow, fieldInputClass, useToast } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { renderMarkdown } from "@/lib/markdown";
import {
  applyMarkdownEdit,
  wrapSelection,
  insertHeading,
  insertBulletList,
  insertPlaceholderToken,
  type MarkdownEdit,
} from "@/lib/markdown-editor";
import type { ActionResult } from "@/lib/actions/content";

const PLACEHOLDER_TOKEN_REGEX = /\{\{(\w+)\}\}/g;

/** Every distinct `{{token}}` name found in `body`, in first-seen order. */
function extractPlaceholderTokens(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(PLACEHOLDER_TOKEN_REGEX)) {
    seen.add(match[1]);
  }
  return Array.from(seen);
}

export type ContentBlockFormValues = {
  title: string;
  body: string;
  sortOrder: number;
};

type ToolbarButtonProps = {
  label: string;
  icon: typeof Bold;
  onAction: () => void;
  disabled?: boolean;
};

/**
 * One toolbar icon button. `onMouseDown` calls `preventDefault()` so
 * clicking it never steals focus (and thus the live selection) away from the
 * textarea — the standard trick for a "format the selected text" toolbar,
 * used instead of tracking the last-known selection in a ref.
 */
function ToolbarButton({ label, icon: Icon, onAction, disabled }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onAction}
      className="focus-ring flex size-11 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white hover:text-brand-dark disabled:pointer-events-none disabled:opacity-50"
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

/** Tailwind arbitrary-variant styling for the rendered-markdown preview pane,
 * targeting exactly the tags `renderMarkdown` can produce (h1-h3, p, ul/li,
 * strong, em) — there's no @tailwindcss/typography plugin in this project,
 * so this is a small hand-rolled "prose" ruleset instead of a `prose` class. */
const PREVIEW_PROSE_CLASS =
  "[&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-brand-dark [&_h1:first-child]:mt-0 " +
  "[&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-brand-dark [&_h2:first-child]:mt-0 " +
  "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-brand-dark [&_h3:first-child]:mt-0 " +
  "[&_p]:mb-2 [&_p:last-child]:mb-0 " +
  "[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul:last-child]:mb-0 [&_ul_ul]:mt-1 [&_ul_ul]:mb-0 " +
  "[&_li]:mb-0.5 [&_strong]:font-semibold [&_strong]:text-brand-dark [&_em]:italic";

/**
 * Title/body/sortOrder form shared by the default block and every region
 * override pane. Doesn't use `useActionState` (unlike the catalog editors)
 * because this save never navigates away — the admin stays on the same
 * tab — so success needs an explicit signal; that's a plain `useTransition`
 * + toast, calling `action` directly from a manual submit handler, the same
 * pattern `CompatEditor` uses in src/components/catalog/compat-editor.tsx.
 *
 * The body field is a toolbar + textarea + live preview, but the textarea
 * stays the single source of truth: every toolbar action (bold/italic/
 * heading/bullet-list/placeholder chip) computes a `MarkdownEdit` (pure
 * logic in src/lib/markdown-editor.ts, unit tested there without a DOM) and
 * applies it via `document.execCommand("insertText", ...)` when available
 * — the browser then keeps a single native undo step and fires the 'input'
 * event React's controlled `onChange` already listens to — falling back to
 * a manual value splice (+ restoring the caret once React re-renders) for a
 * browser without `execCommand`. The stored `body` is plain, unmodified
 * markdown either way; nothing here changes what gets submitted.
 */
export function ContentBlockForm({
  action,
  idPrefix,
  defaultValues,
  placeholders,
  submitLabel = "Save changes",
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  idPrefix: string;
  defaultValues: ContentBlockFormValues;
  placeholders: Record<string, string>;
  submitLabel?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState(defaultValues.body);
  const [mobileTab, setMobileTab] = useState<"write" | "preview">("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelectionRef = useRef<[number, number] | null>(null);
  const toast = useToast();

  // Once React re-renders with a fallback-path splice (see `applyEdit`
  // below), restore the caret to where the edit intended it — setting
  // `selectionRange` synchronously in the click handler wouldn't stick,
  // since the textarea's DOM value hasn't caught up to the new `body` yet.
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

  const presentPlaceholders = extractPlaceholderTokens(body).filter((token) => token in placeholders);
  const allPlaceholderTokens = useMemo(() => Object.keys(placeholders), [placeholders]);
  const previewHtml = useMemo(() => renderMarkdown(body), [body]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Saved");
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 lg:col-span-2">
        <FieldRow label="Title" htmlFor={`${idPrefix}-title`}>
          <input
            id={`${idPrefix}-title`}
            name="title"
            defaultValue={defaultValues.title}
            maxLength={200}
            disabled={pending}
            className={fieldInputClass}
          />
        </FieldRow>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`${idPrefix}-body`} className="text-sm font-medium text-brand-dark">
              Body (Markdown)
              <span className="ml-0.5 text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <div
              role="tablist"
              aria-label="Editor view"
              className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 lg:hidden"
            >
              {(["write", "preview"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === tab}
                  onClick={() => setMobileTab(tab)}
                  className={cn(
                    "focus-ring rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    mobileTab === tab ? "bg-brand text-white" : "text-slate-500 hover:text-brand-dark"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className={cn("flex min-w-0 flex-col", mobileTab === "preview" && "hidden lg:flex")}>
              <div
                role="toolbar"
                aria-label="Formatting"
                aria-controls={`${idPrefix}-body`}
                className="flex flex-wrap gap-0.5 rounded-t-lg border border-b-0 border-slate-200 bg-slate-50 p-1"
              >
                <ToolbarButton
                  label="Bold"
                  icon={Bold}
                  disabled={pending}
                  onAction={() => withSelection((value, start, end) => wrapSelection(value, start, end, "**"))}
                />
                <ToolbarButton
                  label="Italic"
                  icon={Italic}
                  disabled={pending}
                  onAction={() => withSelection((value, start, end) => wrapSelection(value, start, end, "*"))}
                />
                <ToolbarButton
                  label="Heading 1"
                  icon={Heading1}
                  disabled={pending}
                  onAction={() => withSelection((value, start, end) => insertHeading(value, start, end, 1))}
                />
                <ToolbarButton
                  label="Heading 2"
                  icon={Heading2}
                  disabled={pending}
                  onAction={() => withSelection((value, start, end) => insertHeading(value, start, end, 2))}
                />
                <ToolbarButton
                  label="Heading 3"
                  icon={Heading3}
                  disabled={pending}
                  onAction={() => withSelection((value, start, end) => insertHeading(value, start, end, 3))}
                />
                <ToolbarButton
                  label="Bullet list"
                  icon={List}
                  disabled={pending}
                  onAction={() => withSelection(insertBulletList)}
                />
              </div>
              <textarea
                ref={textareaRef}
                id={`${idPrefix}-body`}
                name="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                maxLength={20000}
                rows={20}
                disabled={pending}
                className={cn(fieldInputClass, "h-auto min-h-[28rem] rounded-t-none py-2 font-mono text-sm")}
              />
            </div>

            <div className={cn("flex min-w-0 flex-col", mobileTab === "write" && "hidden lg:flex")}>
              <div className="flex h-11 items-center rounded-t-lg border border-b-0 border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-500 lg:h-auto lg:py-1.5">
                Preview
              </div>
              <div
                className={cn(
                  "min-h-[28rem] flex-1 overflow-y-auto rounded-b-lg border border-slate-200 bg-white p-4 text-sm text-slate-700",
                  PREVIEW_PROSE_CLASS
                )}
              >
                {previewHtml ? (
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                ) : (
                  <p className="text-sm text-slate-400">Nothing to preview yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <FieldRow
          label="Sort order"
          htmlFor={`${idPrefix}-sort-order`}
          hint="Lower numbers list first."
          className="max-w-40"
        >
          <input
            id={`${idPrefix}-sort-order`}
            name="sortOrder"
            type="number"
            min={0}
            step={1}
            defaultValue={defaultValues.sortOrder}
            disabled={pending}
            className={fieldInputClass}
          />
        </FieldRow>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={pending}
          className="h-11 w-full bg-brand text-white hover:bg-brand/90 sm:w-auto sm:self-start"
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>

      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-brand-dark">Insert a placeholder</h3>
          <p className="mt-1 text-xs text-slate-500">Click a token to insert it at the cursor.</p>
          {allPlaceholderTokens.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No placeholders available.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {allPlaceholderTokens.map((token) => {
                const inUse = presentPlaceholders.includes(token);
                return (
                  <button
                    key={token}
                    type="button"
                    title={placeholders[token]}
                    disabled={pending}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => withSelection((value, start, end) => insertPlaceholderToken(value, start, end, token))}
                    className={cn(
                      "focus-ring inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-xs transition-colors disabled:pointer-events-none disabled:opacity-50",
                      inUse
                        ? "border-brand/30 bg-brand/5 text-brand-dark"
                        : "border-slate-200 bg-white text-slate-600 hover:border-brand/30 hover:bg-brand/5"
                    )}
                  >
                    {`{{${token}}}`}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-brand-dark">Placeholders in this body</h3>
          {presentPlaceholders.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No placeholders found.</p>
          ) : (
            <dl className="mt-3 flex flex-col gap-3">
              {presentPlaceholders.map((token) => (
                <div key={token}>
                  <dt className="font-mono text-xs text-brand-dark">{`{{${token}}}`}</dt>
                  <dd className="mt-0.5 text-xs text-slate-500">{placeholders[token]}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
