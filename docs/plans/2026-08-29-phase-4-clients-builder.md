# PathQuote Phase 4: Clients & Document Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** Managers create companies/contacts and build quote/invoice DRAFTS on a phone: pick client, add N configurable items (machine + its options), extra lines, discounts; totals computed live. Finalize/number/PDF land in Phase 5.

**Architecture:** Draft-first builder: "New quote/invoice" immediately creates a DRAFT Document, then every edit is a server action that mutates it and recomputes totals via a pure pricing engine (single source of truth, unit-tested). Manager scoping: managers see only their own documents and companies (spec §6); admins see all.

**Current state:** Phases 1-3 live. Schema note: `Company` has no owner column yet — Task A adds one by migration. Existing helpers: requireSession/requireAdmin, formatMoney, catalog queries, zod patterns in src/lib/validation, actions patterns in src/lib/actions/catalog.ts (encodeURIComponent on code URLs!), Region rows AU/US/UK.

---

### Task A: Company ownership migration + clients CRUD

**Files:** migration `prisma/migrations/1_company_owner/migration.sql` + schema change; `src/lib/validation/clients.ts`; `src/lib/actions/clients.ts`; `src/lib/queries/clients.ts`; pages `src/app/(app)/clients/{page.tsx,new/page.tsx,[companyId]/page.tsx}`; `tests/clients-validation.test.ts`.

- [ ] Schema: add to Company: `ownerId String?` + relation `owner User? @relation("CompanyOwner", fields: [ownerId], references: [id])` (+ backrelation `companiesOwned Company[] @relation("CompanyOwner")` on User), `@@index([ownerId])`. Generate migration via `prisma migrate diff --from-schema-datasource... ` — no DB in sandbox: create migration dir `1_company_owner` with hand-written ALTER TABLE + CREATE INDEX + FK matching Prisma naming conventions; verify with `prisma migrate diff --from-schema=<schema without change> --to-schema=<with>` trick or just `migrate diff --from-empty` comparison of the delta. `prisma validate` + `generate` + typecheck must pass.
- [ ] Zod: companySchema {name 2..200, street/city/state/postcode/country optional ≤120 (postcode ≤20), taxId ≤50, notes ≤2000, regionCode required /^[A-Z]{2,3}$/}; contactSchema {firstName 1..80, lastName ≤80 opt, email optional valid, phone ≤40 opt, position ≤80 opt, isPrimary bool}.
- [ ] Scoping helper `src/lib/authz.ts`: `companyWhereForUser(session)` → ADMIN: {}, MANAGER: {ownerId: session.user.id}. Same idea reused later for documents (`documentWhereForUser`). Unit-testable pure functions (session→where object) — put in `src/lib/scope.ts` instead, imported by queries.
- [ ] Actions (requireSession; managers allowed): createCompany (ownerId = current user; admin keeps own id too), updateCompany/deleteCompany (must pass scope check: load with where+id, 404-style error if no access; delete blocked when documents exist), createContact/updateContact/deleteContact (scope via parent company; enforce single isPrimary per company: setting primary clears others in transaction).
- [ ] Pages: /clients — search (?q on name), list (name, city/country, contacts count, region badge), "+ Add company"; /clients/new — company form; /clients/[companyId] — edit form + contacts section (inline list; add/edit in place via small client components; primary star toggle; delete with confirm) + danger zone. Manager sees only own; direct URL to foreign company → notFound().
- [ ] Tests: schemas valid/invalid; scope functions (admin/manager).
- [ ] Gates (typegen+typecheck, lint, build, test) → commit `feat: clients — companies and contacts CRUD with owner scoping`.

### Task B: Pricing engine (pure)

**Files:** `src/lib/pricing.ts`, `tests/pricing.test.ts`.

- [ ] Types: `EngineItem {unitPrice: number; discountPct?: number|null; maxDiscountPct?: number|null; lines: {qty: number; unitPrice: number}[]}`, `EngineInput {items: EngineItem[]; extraLines: {qty:number; unitPrice:number}[]; documentDiscountPct?: number|null; taxRate: number}`.
- [ ] `computeTotals(input)` → `{itemTotals: number[]; subtotal; discountAmount; taxableBase; taxAmount; total; violations: {itemIndex:number; allowedPct:number}[]}`. Rules: item total = (unitPrice + Σ line qty*price) * (1 - itemDiscount/100); itemDiscount capped by maxDiscountPct → cap silently NOT applied, instead reported in violations (UI blocks save); document discount applies to subtotal after item discounts; tax = taxableBase * taxRate/100; all money math in integer cents (convert in/out; helper `toCents/fromCents`) to avoid float drift; round half-up at each money step.
- [ ] Tests: no discounts; item discount; cap violation (L-Series 10 vs 15 → violation reported); document discount; combined; tax 10%; rounding cases (e.g. 33.335); zero-line items; qty>1.
- [ ] Gates → commit `feat: pure pricing engine with discount caps`.

### Task C: Documents list + draft creation + builder skeleton (client step, items step)

**Files:** `src/lib/actions/documents.ts`, `src/lib/queries/documents.ts`, `src/lib/validation/documents.ts`, pages `src/app/(app)/documents/{page.tsx,[documentId]/page.tsx}`, components `src/components/builder/*`.

- [ ] Queries: `listDocuments(session, {type?, q?})` scope-aware (documentWhereForUser: MANAGER → authorId), include company name, totals, status, updatedAt desc; `getDocumentForBuilder(session, id)` full include (company+contact, items+lines, region).
- [ ] Actions: `createDraft(type)` — region/currency/taxName/taxRate from author's region (fallback AU); redirect to `/documents/{id}`; `deleteDraft(id)` (only DRAFT, scope-checked); `setDocumentClient(id, companyId, contactId?)` (company must be in scope; contact must belong to company; also snapshots nothing yet — drafts read live); `addItem(id, productCode)` — loads product + price for document's region (missing/needsReview price → {error:"price required"}), creates DocumentItem with code/name/description/unitPrice/imageUrl snapshot, sortOrder max+1; `removeItem(itemId)`; every mutating action ends with `recalcDocument(id)` helper: loads items+lines, maps to EngineInput (maxDiscountPct from product's series), computeTotals, writes subtotal/taxAmount/total (violations → returned to caller, not saved).
- [ ] /documents page: type filter tabs (All/Quotes/Invoices), search by company name, status chips (Draft/Final), "+ New quote" / "+ New invoice" buttons (POST createDraft via form action). Rows → builder.
- [ ] Builder page /documents/[documentId]: mobile step-ish single page with collapsible sections: 1) Client (company picker with search + inline "new company" link to /clients/new?return=...; contact select) 2) Items (list of item cards: product name, options count, item total; "+ Add item" → series→product two-level picker client component fetching via server actions or preloaded catalog tree) 3) placeholder sections for Options/Lines/Discounts (Task D) 4) sticky footer: subtotal/tax/total + status badge. DRAFT only editable; FINAL read-only view (not reachable yet).
- [ ] Zod: minimal (ids are cuids — validate shape).
- [ ] Gates → commit `feat: documents list, draft creation, builder client+items steps`.

### Task D: Item options editor, custom lines, discounts

**Files:** extend `src/lib/actions/documents.ts`, `src/components/builder/*`.

- [ ] `setItemOptions(itemId, selections: {optionCode, qty, attributes?}[])`: validates each option compatible with the item's product series (series-level compat), has price in document region (else error listing missing codes); replaces item's OPTION lines (delete+create in transaction, preserving sortOrder by selection order); recalc.
- [ ] Options picker UI per item: opens sheet/section listing compatible options (code, name, price, needsReview disabled with "price required"), checkbox + qty stepper (default 1), attributes: if option.attributeSchema present render inputs per {key,label,type} array (number/text), stored into line.attributes JSON.
- [ ] `addCustomLine(documentId, {name, qty, unitPrice, description?})` + `removeLine(lineId)` — document-level CUSTOM lines (freeform, e.g. delivery); zod: name 1..200, qty int 1..999, unitPrice decimal ≥0.
- [ ] `setItemDiscount(itemId, pct|null)` + `setDocumentDiscount(documentId, pct|null)`: zod 0..100 ≤2dp; recalc returns violations → surface "L-Series max discount 10%" style error and DON'T persist a violating pct (reject).
- [ ] Builder sections: per-item expandable card now shows option chips + "Edit options"; "Extra lines" section with add form; "Discounts" section (per item inline field + document-level field, admin AND manager allowed).
- [ ] Gates → commit `feat: builder options, custom lines, discounts with cap enforcement`.

### Task E: Final integration review + fixes + roadmap

- [ ] Reviewer pass: scoping bypass attempts (foreign companyId/documentId/itemId/lineId in every action — each action must re-verify chain of ownership: line→document→author), recalc correctness vs engine tests, price-required flows, mobile layout, dead links, build/test gates.
- [ ] Fix findings; roadmap phase 4 ✅; commit.

**Out of scope:** finalize/numbering/snapshots/PDF (Phase 5), quotation content blocks (Phase 6), email, payments.
