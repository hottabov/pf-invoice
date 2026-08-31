"use client";

import { Bold, Italic, Heading1, Heading2, Heading3, List } from "lucide-react";
import { wrapSelection, insertHeading, insertBulletList, type MarkdownEdit } from "@/lib/markdown-editor";

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

/**
 * Bold/italic/heading/bullet-list toolbar for a markdown textarea — shared by
 * `ContentBlockForm` (src/components/content/content-block-form.tsx) and the
 * document builder's Notes section (src/components/builder/notes-section.tsx).
 * Purely presentational: every button just computes a `MarkdownEdit` (pure
 * logic in src/lib/markdown-editor.ts, unit tested there without a DOM) and
 * hands it to the caller's `withSelection`, which owns the actual textarea
 * ref and the `document.execCommand`/manual-splice apply logic — this
 * component has no state and no DOM access of its own beyond the buttons
 * themselves.
 */
export function MarkdownToolbar({
  idPrefix,
  disabled,
  withSelection,
}: {
  idPrefix: string;
  disabled?: boolean;
  withSelection: (compute: (value: string, start: number, end: number) => MarkdownEdit) => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-controls={`${idPrefix}-body`}
      className="flex flex-wrap gap-0.5 rounded-t-lg border border-b-0 border-slate-200 bg-slate-50 p-1"
    >
      <ToolbarButton
        label="Bold"
        icon={Bold}
        disabled={disabled}
        onAction={() => withSelection((value, start, end) => wrapSelection(value, start, end, "**"))}
      />
      <ToolbarButton
        label="Italic"
        icon={Italic}
        disabled={disabled}
        onAction={() => withSelection((value, start, end) => wrapSelection(value, start, end, "*"))}
      />
      <ToolbarButton
        label="Heading 1"
        icon={Heading1}
        disabled={disabled}
        onAction={() => withSelection((value, start, end) => insertHeading(value, start, end, 1))}
      />
      <ToolbarButton
        label="Heading 2"
        icon={Heading2}
        disabled={disabled}
        onAction={() => withSelection((value, start, end) => insertHeading(value, start, end, 2))}
      />
      <ToolbarButton
        label="Heading 3"
        icon={Heading3}
        disabled={disabled}
        onAction={() => withSelection((value, start, end) => insertHeading(value, start, end, 3))}
      />
      <ToolbarButton
        label="Bullet list"
        icon={List}
        disabled={disabled}
        onAction={() => withSelection(insertBulletList)}
      />
    </div>
  );
}
