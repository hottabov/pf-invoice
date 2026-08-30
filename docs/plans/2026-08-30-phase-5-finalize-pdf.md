# PathQuote Phase 5: Finalize, Numbering, Invoice PDF

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** A draft becomes a numbered, immutable FINAL document (Q-AU-2026-001 / INV-AU-2026-001) with frozen snapshots, rendered as a branded HTML invoice and downloadable as PDF via Gotenberg. (Extended multi-page quotation template = Phase 6; this phase ships the commercial invoice/quote-summary PDF for BOTH types.)

**Architecture:** `finalizeDocument` server action: validation (client set, ≥1 item/line, no price-required items, no discount-cap violations from recalc) → atomic numbering via NumberSequence upsert+increment in a transaction → freeze entity/tax snapshots onto the document → status FINAL. Rendering: a pure server component `DocumentSheet` renders the document HTML (used by both the in-app preview route and the PDF route); PDF route posts that same HTML (inlined CSS, embedded logo/images as base64 data URIs) to Gotenberg and streams the result back.

**Key existing pieces:** recalcDocument returns violations (MUST be checked here — see NOTE in src/lib/actions/documents.ts), Region has entityName/entityLegalId/entityAddress/bankDetails/taxName/taxRate/logoUrl/footerText, Document has entitySnapshot Json + number unique + NumberSequence model, GOTENBERG_URL env (compose: http://gotenberg:3000; local dev: http://localhost:3001), uploads served at /api/files/[name] (auth-gated — PDF pipeline must read files from disk directly via resolveUploadPath, not HTTP).

---

### Task A: Numbering + finalize action

**Files:** `src/lib/numbering.ts`, `src/lib/actions/finalize.ts`, `tests/numbering.test.ts`; small additions to `src/lib/queries/documents.ts`.

- [ ] `numbering.ts`: `formatDocNumber(type, regionCode, year, counter)` → `Q-AU-2026-001` / `INV-AU-2026-001` (prefix Q/INV, zero-pad 3, counter can exceed 999 → natural width). Pure + tested.
- [ ] `allocateNumber(tx, regionCode, type, year)`: inside a Prisma interactive transaction: upsert NumberSequence on @@unique([regionCode, docType, year]) then `update { counter: { increment: 1 } }` returning new counter (or use single `upsert` + `update` pattern; must be race-safe under concurrent finalize — increment is atomic).
- [ ] `finalizeDocument(documentId)` server action (requireSession, scope, DRAFT only):
  1. Load full document (items+lines+company+contact+region).
  2. Validations → return {error}: no company; no items AND no document lines; any item/line with unitPrice from a needsReview price is already impossible (blocked at add), but re-verify every item has unitPrice ≥ 0; recalc violations non-empty → error naming items/caps; company region mismatch allowed (document region is authoritative).
  3. Interactive transaction: allocate number; update document: {status: FINAL, number, entitySnapshot: {entityName, entityLegalId, entityAddress, bankDetails, logoUrl, footerText, regionCode, currency, taxName, taxRate}, issueDate: now, validityDays: settings default for quotes (Setting key "quote.validityDays", fallback 7)}.
  4. revalidatePath /documents + builder page; return {ok, number}.
- [ ] `unfinalizeDocument(documentId)` — ADMIN only escape hatch: FINAL → DRAFT, keeps number (re-finalize reuses existing number if present instead of allocating a new one — implement that branch in finalizeDocument).
- [ ] Tests: formatDocNumber cases; validation logic extracted pure (validateFinalizable(doc, violations) → error|null) and tested.
- [ ] Gates (typegen+typecheck, lint, build, test) → commit `feat: document finalization with atomic numbering`.

### Task B: Document HTML sheet (shared preview/PDF renderer)

**Files:** `src/components/sheet/document-sheet.tsx` (+ small helpers), `src/app/(app)/documents/[documentId]/preview/page.tsx`.

- [ ] `DocumentSheet({doc, mode})` — server component, self-contained inline-styled (style attributes or a single <style> block, NO Tailwind classes — must render standalone inside Gotenberg): A4-proportioned sheet: header (logo left — img src passed in as data URI or url prop; entity block right: name, legal id, address), document title + number + date (+ validity for quotes), client block (company + contact + address + website), items table (each item: name/code, its option sub-rows indented with qty×price, item discount line if set, item total), extra lines, totals block (subtotal, document discount, taxName rate, total, currency), bank details + footerText (from snapshot for FINAL, live region for DRAFT preview), signature area for quotes. Show images (item imageUrl) only when showImage flag set — small thumbnails.
- [ ] Money via formatMoney with document currency. Dates via en-AU format (DD/MM/YYYY).
- [ ] For FINAL docs read entitySnapshot; for DRAFT fall back to live region values (banner "DRAFT — not yet numbered" watermark diagonal).
- [ ] Preview route `/documents/[id]/preview`: renders DocumentSheet inside minimal chrome with "Back to editor" + "Download PDF" buttons; scope-checked.
- [ ] Builder page gets: Finalize button (client component calling finalizeDocument, confirm dialog listing what happens; on success show number + link to preview), Preview link, and for FINAL: prominent number + Download PDF + (admin) Unfinalize.
- [ ] Gates → commit `feat: document sheet renderer and preview`.

### Task C: PDF generation via Gotenberg

**Files:** `src/lib/pdf.ts`, `src/app/api/documents/[documentId]/pdf/route.ts`.

- [ ] `pdf.ts`: `renderDocumentHtml(doc)` — wraps DocumentSheet in full HTML document (doctype, meta charset, embedded @page CSS: A4, margins 15mm; `react-dom/server` renderToStaticMarkup — verify import works in route handler runtime; if RSC constraints bite, restructure DocumentSheet as a plain function returning JSX consumable by renderToStaticMarkup in a route handler); `htmlToPdf(html)` — POST multipart to `${GOTENBERG_URL}/forms/chromium/convert/html` with file `index.html`, options (paperWidth 8.27 paperHeight 11.69, margins 0 — CSS @page handles), 30s timeout, throw descriptive error on non-200.
- [ ] Images inside PDF HTML: item/logo images referenced as `/api/files/x` are auth-gated — inline them: read via resolveUploadPath + fs, base64 data URI, correct mime. Missing file → skip image.
- [ ] Route GET /api/documents/[id]/pdf: session + scope; load doc; render; convert; return application/pdf with `Content-Disposition: attachment; filename="<number|draft-id>.pdf"`. DRAFT allowed (watermarked preview PDF).
- [ ] Wire Download PDF buttons (preview page + builder) to this route.
- [ ] Gates (build must pass; live Gotenberg untestable in sandbox — code-verified; add graceful 502 {error} when Gotenberg unreachable) → commit `feat: PDF download via Gotenberg`.

### Task D: Final review + fixes + roadmap

- [ ] Integration review: finalize atomicity/races, number uniqueness (unique constraint backstop), snapshot completeness (rendering FINAL must not query Region), violations check enforced, PDF route scope, DocumentSheet standalone-ness (no Tailwind/app CSS deps), draft watermark, en-AU dates. Fix findings.
- [ ] Roadmap: phase 5 ✅. Commit.

**Out of scope:** extended quotation content blocks (Phase 6), emailing, RSP table, per-page headers/footers beyond CSS defaults.
