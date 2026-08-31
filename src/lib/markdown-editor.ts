// Pure, DOM-free toolbar logic for the content-block markdown editor
// (src/components/content/content-block-form.tsx). Each function takes the
// textarea's current `value` plus its selection (`start`/`end`, exactly what
// `HTMLTextAreaElement.selectionStart`/`selectionEnd` report) and returns a
// `MarkdownEdit` describing what to replace and where the caret should land
// afterwards — no `document`/`window` access, so this is trivially unit
// testable (see tests/markdown-editor.test.ts) without jsdom. The component
// is responsible for actually applying the edit to the real textarea (via
// `document.execCommand("insertText", ...)` where available, so the browser
// keeps a single undo step, falling back to a manual value splice).
//
// Every function returns caret positions expressed in the NEW value (after
// the edit is applied), matching what `HTMLTextAreaElement.setSelectionRange`
// expects post-update.

export type MarkdownEdit = {
  /** Start of the `[start, end)` region of the original value being replaced. */
  start: number;
  /** End of the `[start, end)` region of the original value being replaced. */
  end: number;
  /** Text that replaces `value.slice(start, end)`. */
  insertText: string;
  /** Desired `selectionStart` in the resulting value. */
  caretStart: number;
  /** Desired `selectionEnd` in the resulting value. */
  caretEnd: number;
};

/** Applies a `MarkdownEdit` to `value`, purely — used by both the component
 * (for the manual-splice fallback path) and tests (to assert the resulting
 * text, not just the edit region). */
export function applyMarkdownEdit(value: string, edit: MarkdownEdit): string {
  return value.slice(0, edit.start) + edit.insertText + value.slice(edit.end);
}

function collapsedCaretAfter(editStart: number, insertText: string): { caretStart: number; caretEnd: number } {
  const pos = editStart + insertText.length;
  return { caretStart: pos, caretEnd: pos };
}

function lineStartAt(value: string, pos: number): number {
  return value.lastIndexOf("\n", Math.max(pos - 1, 0)) + 1;
}

function lineEndAt(value: string, pos: number): number {
  const idx = value.indexOf("\n", pos);
  return idx === -1 ? value.length : idx;
}

/**
 * Bold/italic: wraps the selection in `marker` (`**`/`*`) on both sides. An
 * empty (collapsed) selection instead inserts an empty pair and places the
 * caret between the two markers so the admin can type straight into it; a
 * non-empty selection collapses the caret to just after the closing marker.
 */
export function wrapSelection(value: string, start: number, end: number, marker: string): MarkdownEdit {
  const selected = value.slice(start, end);
  const insertText = `${marker}${selected}${marker}`;
  if (selected.length === 0) {
    const pos = start + marker.length;
    return { start, end, insertText, caretStart: pos, caretEnd: pos };
  }
  return { start, end, insertText, ...collapsedCaretAfter(start, insertText) };
}

const HEADING_PREFIX_PATTERN = /^(#{1,3})\s+/;

/**
 * H1/H2/H3: prefixes the line the caret (or selection start) is on with
 * `"# "`/`"## "`/`"### "`, replacing any existing heading prefix on that
 * line. Clicking the same level again toggles it off (removes the prefix)
 * rather than doubling it up.
 */
export function insertHeading(value: string, start: number, end: number, level: 1 | 2 | 3): MarkdownEdit {
  const lineStart = lineStartAt(value, start);
  const restOfLine = value.slice(lineStart);
  const match = HEADING_PREFIX_PATTERN.exec(restOfLine);
  const marker = `${"#".repeat(level)} `;
  const isSameLevel = Boolean(match && match[0] === marker);
  const editEnd = lineStart + (match ? match[0].length : 0);
  const insertText = isSameLevel ? "" : marker;
  return { start: lineStart, end: editEnd, insertText, ...collapsedCaretAfter(lineStart, insertText) };
}

const LIST_ITEM_PATTERN = /^\s*-\s+/;

/**
 * Bullet list: prefixes every line touched by the current selection (just
 * the caret's own line for a collapsed selection) with `"- "`. If every
 * touched line already has a bullet, toggles them all off instead (mirrors
 * `insertHeading`'s toggle behavior).
 */
export function insertBulletList(value: string, start: number, end: number): MarkdownEdit {
  const editStart = lineStartAt(value, start);
  const editEnd = lineEndAt(value, end);
  const block = value.slice(editStart, editEnd);
  const lines = block.split("\n");
  const alreadyAllBulleted = lines.every((line) => LIST_ITEM_PATTERN.test(line) || line.trim() === "");

  const insertText = lines
    .map((line) => {
      if (LIST_ITEM_PATTERN.test(line)) {
        return alreadyAllBulleted ? line.replace(LIST_ITEM_PATTERN, "") : line;
      }
      return line.length > 0 ? `- ${line}` : "- ";
    })
    .join("\n");

  return { start: editStart, end: editEnd, insertText, ...collapsedCaretAfter(editStart, insertText) };
}

/** Placeholder chip: inserts `{{token}}` at the current selection (replacing
 * it, same as typing would), caret landing right after the inserted token. */
export function insertPlaceholderToken(value: string, start: number, end: number, token: string): MarkdownEdit {
  const insertText = `{{${token}}}`;
  return { start, end, insertText, ...collapsedCaretAfter(start, insertText) };
}
