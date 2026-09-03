// Pure helpers for the WYSIWYG rich-text editor (RichTextEditor, Tiptap) and
// its HTML-content-storage story. `ContentBlock.body` and `Document.notes`
// used to be markdown, hand-typed into a textarea (see src/lib/markdown.ts /
// src/lib/markdown-editor.ts, still kept around — see their own doc
// comments). Rows written by the WYSIWYG editor store Tiptap's HTML output
// instead, so every reader of stored content now has to handle BOTH shapes:
// old rows are still markdown, new rows (and any row an admin re-saves) are
// HTML. This module is that seam: `isHtmlContent` tells the two shapes
// apart, `toEditorHtml` normalizes either shape to HTML for loading INTO the
// editor, `sanitizeRichText` allowlist-sanitizes untrusted-ish editor HTML
// before it's ever stored or rendered, and `renderStoredRichText` is the one
// function every sheet/renderer should call on a stored body/notes value
// instead of `renderMarkdown` directly.
//
// No `@/lib/db` or `next/*` imports — same discipline as markdown.ts — so a
// plain `vitest run` of this file never needs `DATABASE_URL` set.
import DOMPurify from "isomorphic-dompurify";
import { renderMarkdown } from "./markdown";

/**
 * Tags `renderMarkdown` can ever produce, plus the extra inline/structural
 * tags the Tiptap editor's toolbar can produce (underline, strikethrough,
 * blockquote, links) — this is both `sanitizeRichText`'s allowlist AND (via
 * `HTML_TAG_PATTERN` below) the set `isHtmlContent` sniffs for. Deliberately
 * excludes `h1` (see `RichTextEditor`'s StarterKit config — the editor only
 * ever produces h2/h3) and anything script-like.
 */
const ALLOWED_TAGS = ["p", "strong", "b", "em", "i", "u", "s", "h2", "h3", "ul", "ol", "li", "br", "a", "blockquote"];

/** Only `href` survives sanitization — no `style`, no `on*` handlers, no
 * `target`/`class`/anything else an editor or a hand-crafted HTML payload
 * might carry. */
const ALLOWED_ATTR = ["href"];

/** Restricts `href` to `http:`/`https:`/`mailto:` — DOMPurify's own default
 * `ALLOWED_URI_REGEXP` is far more permissive (it also allows relative URLs,
 * `tel:`, `cid:`, etc.), which is more latitude than a quotation's rich-text
 * link ever needs. Anything else (`javascript:`, `data:`, a bare relative
 * path, an unrecognised scheme) gets its `href` attribute dropped entirely —
 * DOMPurify still keeps the `<a>` tag and its text content, just without a
 * live link. */
const SAFE_HREF_PATTERN = /^(?:https?:|mailto:)/i;

/** Matches an opening or closing tag for any tag in `ALLOWED_TAGS` — used by
 * `isHtmlContent` to recognise HTML content that doesn't happen to start
 * with `<` (defensive; in practice every Tiptap-produced body does start
 * with a block tag) without misclassifying a stray literal `<`/`>` in
 * markdown prose as HTML. */
const HTML_TAG_PATTERN = new RegExp(`</?(?:${ALLOWED_TAGS.join("|")})\\b[^>]*>`, "i");

/**
 * True when `value` is HTML (Tiptap's saved output, or anything else that
 * looks like markup) rather than legacy markdown. Two checks, either
 * sufficient on its own:
 *  - the trimmed value starts with a tag (`<p>...`, `<h2>...`) — true for
 *    every row the new editor has ever saved, since Tiptap never emits a
 *    document that doesn't open with a block element;
 *  - failing that, the value contains a recognised tag anywhere (defensive
 *    fallback for content whose HTML doesn't happen to start at position 0).
 * A blank/whitespace-only value is never "HTML" (there's nothing to
 * distinguish it from empty markdown, and `toEditorHtml`/`renderStoredRichText`
 * both handle "" identically either way).
 */
export function isHtmlContent(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (/^</.test(trimmed)) return true;
  return HTML_TAG_PATTERN.test(trimmed);
}

/**
 * Normalizes a stored body/notes value to HTML for loading into the
 * `RichTextEditor` — already-HTML content passes through unchanged, legacy
 * markdown is rendered once via `renderMarkdown` (the same renderer the old
 * preview pane used, so a pre-migration row opens in the new editor looking
 * exactly like its old preview did). The editor's own `onChange` then saves
 * back through `sanitizeRichText`, so once a row round-trips through the
 * editor once it's HTML from then on.
 */
export function toEditorHtml(stored: string): string {
  return isHtmlContent(stored) ? stored : renderMarkdown(stored);
}

/**
 * Allowlist-sanitizes editor-produced (or otherwise untrusted-ish) HTML down
 * to exactly the tags/attributes this app's sheets know how to style:
 * `ALLOWED_TAGS`/`ALLOWED_ATTR` above, `href` further restricted to
 * `SAFE_HREF_PATTERN`. Everything else — `<script>`, `<iframe>`, `style=`,
 * `on*=` handlers, a `javascript:`/`data:` href, any tag/attribute not on
 * the allowlist — is stripped; DOMPurify keeps the *text content* of a
 * stripped tag (so a rejected wrapper never silently deletes the admin's
 * words), except for tags it always drops entirely regardless of allowlist
 * (`<script>`/`<style>` and the like never leak their contents as text).
 *
 * Called from two places: server actions writing `ContentBlock.body` /
 * `Document.notes` (defense at the write boundary — see setDocumentNotes/
 * updateContentBlock/createRegionOverride), and `renderStoredRichText` below
 * (defense at the read boundary too, so a row written before this
 * allowlist existed, or written by any future direct-DB path, still renders
 * safely).
 */
export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: SAFE_HREF_PATTERN,
  });
}

/**
 * The one function every sheet/renderer (quotation-data.ts, quotation-sheet)
 * should call on a stored body/notes value: sanitizes already-HTML content,
 * or runs legacy markdown through `renderMarkdown` exactly as before —
 * `renderMarkdown` HTML-escapes its input up front, so that branch is safe
 * by construction the same way it always was, this function just adds the
 * HTML branch on top.
 */
export function renderStoredRichText(stored: string): string {
  return isHtmlContent(stored) ? sanitizeRichText(stored) : renderMarkdown(stored);
}

/**
 * The write-boundary counterpart to `renderStoredRichText`: sanitizes `value`
 * if it's HTML, otherwise returns it unchanged (legacy markdown/plain text
 * is stored as-is, exactly as it always was — sanitization only ever applies
 * to markup a `RichTextEditor` could actually have produced). Used by every
 * server action that persists a `RichTextEditor`-backed column
 * (`ContentBlock.body`/`Document.notes` via updateContentBlock/
 * setDocumentNotes, `Product.description` via createProduct/updateProduct)
 * so the allowlist is enforced once, the same way, everywhere a stored value
 * is untrusted-ish editor output rather than assumed clean.
 */
export function sanitizeIfHtml(value: string): string {
  return isHtmlContent(value) ? sanitizeRichText(value) : value;
}
