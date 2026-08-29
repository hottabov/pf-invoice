# PathQuote Phase 3: Catalog Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Admins manage the full catalog from the app: series, products, options, per-region prices, images, option↔series compatibility. Managers get read access (needed by the Phase 4 wizard).

**Architecture:** App-router pages under an authenticated shell layout; mutations via server actions guarded by role checks (`requireAdmin`); zod validation; images on the VPS volume served through an auth route. Mobile-first lists, tap-friendly editing.

**Tech:** existing stack (Next 16, Prisma 7, Tailwind 4, shadcn, lucide-react, zod, vitest).

**Current state (verified):** Phases 1-2 deployed to q.pathfindercut.com, login works, DB seeded. Dashboard shell in `src/app/page.tsx` with placeholder cards + bottom nav (href="#"). Auth: `auth()` from `@/auth`, session.user has `id/role/regionId`. `db` from `@/lib/db`. `.env` has `UPLOADS_DIR=/data/uploads` (volume `uploads:` mounted in compose).

---

### Task A: App shell + routing skeleton + metadata

**Files:** Create `src/app/(app)/layout.tsx`, `src/components/app-shell.tsx`; move dashboard into `src/app/(app)/page.tsx`; create placeholder pages `src/app/(app)/{documents,clients,catalog,settings}/page.tsx`; modify `src/app/layout.tsx` (metadata), delete old `src/app/page.tsx`.

- [ ] Root layout metadata: `title: { default: "PathQuote", template: "%s · PathQuote" }`, description "Pathfinder quotation and invoicing". (Removes "Create Next App".)
- [ ] Route group `(app)` with `layout.tsx`: awaits `auth()`, redirect("/login") if no session; renders `<AppShell user={...}>{children}</AppShell>`.
- [ ] `AppShell` (client or server + small client nav): top bar (wordmark, email, role badge, logout) + bottom nav (mobile) / sidebar (md+) with active-state highlighting via `usePathname()`. Items: Documents `/documents`, Clients `/clients`, Catalog `/catalog`, Settings `/settings`. Reuse the visual style already in page.tsx.
- [ ] Move dashboard content to `(app)/page.tsx`; cards link to the four real routes. Placeholder pages: heading + "coming in a later phase" body (Documents/Clients/Settings). Catalog page gets real content in Task B.
- [ ] `src/lib/authz.ts`: `requireSession()` and `requireAdmin()` helpers for server actions/pages: read `auth()`, throw/redirect appropriately. Manager may VIEW catalog; only ADMIN mutates.
- [ ] Gates: typecheck, lint, build. Commit `feat: app shell, routing skeleton, metadata`.

### Task B: Catalog browse pages (read for all roles)

**Files:** `src/app/(app)/catalog/page.tsx` (series + options entry), `src/app/(app)/catalog/[seriesCode]/page.tsx` (products of series), `src/app/(app)/catalog/options/page.tsx` (global options list), `src/lib/queries/catalog.ts`.

- [ ] `catalog.ts` query helpers: `listSeriesWithCounts()`, `listProductsBySeries(code)` incl. AU price + needsReview flag, `listOptions({ series? , search? })` incl. compatibility series codes and price.
- [ ] Series page: card list (name, product count, maxDiscountPct badge if set) → link to series products; separate card "Options" → /catalog/options.
- [ ] Products page: table-like responsive list: code, name, price (formatted with region currency), needsReview amber badge, active toggle indicator; each row links to product editor (Task C). Admin sees "+ Add product".
- [ ] Options page: search input (URL param), series filter chips; rows: code, name, price, compat badges, needsReview badge; links to option editor. Admin "+ Add option".
- [ ] Price formatting util `src/lib/format.ts`: `formatMoney(amount, currency)` (Intl.NumberFormat, e.g. A$175,000). Unit test.
- [ ] Gates + commit `feat: catalog browse pages`.

### Task C: Product & option editors + CRUD server actions

**Files:** `src/app/(app)/catalog/[seriesCode]/[productCode]/page.tsx`, `src/app/(app)/catalog/options/[optionCode]/page.tsx`, `src/lib/actions/catalog.ts`, `src/lib/validation/catalog.ts` (zod), `tests/catalog-actions.test.ts`.

- [ ] Zod schemas: product {code (uppercase, /^[A-Z0-9-]{2,20}$/), name min 2, description optional, active bool, sortOrder int}, option {same + shortDescription}, price {regionCode, amount decimal string ≥0 or empty}, compat {optionCode, seriesCodes: string[]}.
- [ ] Server actions (all `requireAdmin`, revalidatePath): createProduct(seriesCode, form), updateProduct, deleteProduct (block if referenced by DocumentItem — count check, return error), createOption, updateOption, deleteOption (block if referenced by DocumentLine or compat cleanup cascade fine), upsertPrice (empty amount → delete Price row; saving a number sets needsReview=false), setOptionCompatibility (diff-and-write compat rows, series-level only).
- [ ] Product editor page: form fields, per-region price section (all active regions listed; input per region; needsReview badge with "price required" hint), image block (Task D placeholder), delete button (confirm). New-product mode via `/catalog/[seriesCode]/new`.
- [ ] Option editor: same + compatibility checkboxes (series list) + attribute schema textarea (raw JSON, validated parseable, optional). New via `/catalog/options/new`.
- [ ] Unit tests (pure zod schemas + a mapping helper for compat diff): valid/invalid inputs, price empty→delete signal, compat diff add/remove sets.
- [ ] Gates + commit `feat: catalog CRUD editors with per-region prices and compatibility`.

### Task D: Image upload & serving

**Files:** `src/app/api/uploads/route.ts` (POST), `src/app/api/files/[...path]/route.ts` (GET), `src/lib/uploads.ts`, wire into both editors.

- [ ] `uploads.ts`: `saveUpload(file: File): Promise<string>` — validate type (jpeg/png/webp) + size ≤ 5MB, name `${crypto.randomUUID()}.${ext}`, write to `process.env.UPLOADS_DIR ?? "./data/uploads"` (mkdir -p), return `/api/files/${name}`.
- [ ] POST /api/uploads: requireAdmin; multipart form field "file"; returns {url}. GET /api/files/...: requireSession; stream file with correct content-type, immutable cache headers; 404 if traversal (`path.normalize` guard) or missing.
- [ ] Editors: image `<img>` preview + file input (client component posting to /api/uploads, then saving url via update action field imageUrl; "remove image" sets null).
- [ ] Add `/api/files` to proxy public-exempt? NO — keep authenticated. Verify proxy doesn't block (it allows any authenticated route).
- [ ] Gates + commit `feat: image upload and authenticated file serving`.

### Task E: Final review + polish

- [ ] Cross-review whole phase (integration reviewer): role checks on every mutation, revalidatePath coverage, mobile layout sanity, no dead links.
- [ ] Update roadmap (phase 3 ✅). Commit.

**Out of scope:** product-level compatibility (series-level only for now), image resizing, drag-sort ordering, options attribute UI beyond raw JSON.
