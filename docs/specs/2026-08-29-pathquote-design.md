# PathQuote — Design Spec

Date: 2026-08-29 · Status: approved pending final review · Repo: https://github.com/hottabov/pf-invoice · Host: q.pathfindercut.com (VPS, Docker, existing Nginx)

## 1. Purpose

Mobile-first web app for Pathfinder admins/managers to build quotations and invoices for cutting machines (M-Series, X-Calibre, L-Series, Punchline, spreaders, software) and export them as PDF. Multi-region (AU/US/UK now; more later), per-region currency, tax, prices, and legal entity.

## 2. Stack

- Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui
- Prisma ORM + PostgreSQL 16
- Auth.js: credentials (email+password, argon2) + magic link (company SMTP). No self-signup — admins create users.
- PDF: Gotenberg sidecar container (HTML → PDF). Same HTML templates used for on-screen preview and PDF.
- Docker Compose on VPS: `app`, `postgres`, `gotenberg`. Existing Nginx terminates TLS and proxies to `app`.
- CI/CD: GitHub Actions → SSH → `docker compose up -d --build`.
- Config: all settings in DB except `.env` (DATABASE_URL, AUTH_SECRET, SMTP_*).

## 3. Data model

### Catalog
- `series` — M-Series, X-Calibre (clone of M-Series pricing initially), L-Series, Punchline, Spreading, Software, Accessories. Optional `max_discount_pct` (L-Series = 10).
- `products` — machines/equipment: code (M5180), series, name, description, specs (cutting height, width), image, active flag, sort order.
- `options` — code (MTS, HFV…), name, short description, long description block (for extended quotation), image, attribute schema (e.g. MTS metres/tables, spreader width), active flag.
- `option_compatibility` — option ↔ series and/or specific product. Strict: builder shows only compatible options.
- `prices` — polymorphic (product|option) × region → amount. Single price per item per region (verified against Excel: "1st/2nd/3rd Machine" columns are order-quantity slots, not price tiers). Manual per-region price lists; missing price = item shown as "price required", cannot be finalized.

### Regions & users
- `regions` — code (AU/US/UK), currency (AUD/USD/GBP), tax name + rate (GST 10% etc.), legal entity (company name, ABN/reg no, address, bank details incl. SWIFT/BSB/account), logo, document footer text. Adding a country = adding a row.
- `users` — email, name, role (`admin` | `manager`), region, active flag. Admin: everything. Manager: create/edit own clients and documents in own region; sees only own documents.

### Clients
- `companies` — company name, street, city, state, postcode, country, region ref, tax id (ABN/VAT, optional), notes.
- `contacts` — belongs to a company; first/last name, email, phone, position, primary flag. A company can have many contacts.
- Documents reference a company + a chosen contact. Both creatable inline from the wizard or from the Clients screen.

### Documents
- `documents` — type (`quote` | `invoice`), number (`Q-AU-2026-001` / `INV-AU-2026-001`, per region+type+year sequence in `number_sequences`), status (`draft` | `final`), company ref, contact ref, author ref, region ref, date, validity days (quotes), currency, tax snapshot, entity snapshot (JSON), totals. Quotes and invoices are fully independent documents with two separate creation actions; no conversion between them.
- `document_items` — item groups within a document. An item = one configurable product instance (a cutter, a conveyor table, a spreader…) with its own option set. A document can contain N items (3, 10…), each configured differently. Fields: product ref, sort position, description + unit price snapshots, manual discount (validated against series `max_discount_pct`, e.g. L-Series 10%), serial number (optional, for RSP table), show image flag.
- `document_lines` — lines belonging either to an item group (options, with attribute values like MTS metres) or directly to the document (software, misc/free-text lines). Fields: ref (option/product/free), qty, description snapshot, unit price snapshot, attributes JSON, show image flag.
- Snapshot rule: on finalize, all prices, descriptions, tax, and entity details are frozen into the document. Catalog changes never mutate finalized documents. Drafts re-read live catalog data.
- Discounts: manual, per item group and/or whole document; series discount cap enforced (L-Series max 10%).

### Content
- `content_blocks` — keyed rich-text blocks per region: T&C sections, General Conditions of Sale, RSP agreement, warranty, machine/option long descriptions for the extended quotation. Editable in admin. The extended quotation is assembled: header → machine spec blocks → selected options' description blocks → software blocks → T&C → General Conditions → RSP (+ coverage table from machine serials).
- `settings` — key-value store (default validity days, date format, etc.).
- Images stored on a VPS volume (`/data/uploads`), served through an authenticated route.

## 4. Documents & PDF flow

1. Builder wizard (mobile-first, one step per screen): company/contact → add item (series → model grid) → options for that item (compatible checklist, running total in sticky footer) → "add another item" loop → extra lines (software/misc) → review → finalize.
2. Two entry points: "New quote" and "New invoice" — same wizard, different document type/template.
3. Preview = HTML template rendered in-app. PDF = same HTML posted to Gotenberg. Invoice PDF: compact commercial document (logo, entity legal info per Australian practice, client details, lines, tax, totals, bank details). Quote PDF: extended quotation per the Word template structure.
4. PDF downloadable from the app; emailing to clients deferred (post-v1).
5. Payment tracking deferred (post-v1). Statuses stay `draft`/`final`.

## 5. UI / design

- Brand: primary `#243478` (PMS 287), accent `#00B8E2` (PMS 306), dark surface `#2B304F` (PMS 533). Sans stack approximating Myriad Pro (e.g. system + "PT Sans"/"Source Sans 3"); Century Gothic-like for headings optional.
- Mobile-first; bottom navigation: Documents / Clients / Catalog / Settings. Desktop gets sidebar layout from the same components.
- CRM-style lists: search, filters (type, status, region for admin), recent-first.
- Admin area: users, regions/entities, catalog (products, options, images, prices per region, compatibility matrix), content blocks, settings.

## 6. Security

- No public registration. Middleware guards all routes except `/login`. Sessions via Auth.js; argon2 password hashes; single-use magic links, 15-min TTL; login rate limiting.
- Role checks server-side (server actions/route handlers), not just UI.
- Manager scope: own documents + own clients; admin: all.
- Uploads validated (type/size), stored outside web root, served via auth route.
- Secrets only in `.env`; everything else in DB.

## 7. Seed / import

- Script imports `RAW/11 Price List Australia 2026-05-28.xlsx`: series, machines, options, AUD prices. X-Calibre created as a clone of M-Series (products + prices) with its own codes, prices to be corrected later.
- Known data gaps flagged as "price required": M3390 (TBD), LNS ×1.05 formula rows, LS Convert.
- Option long-description blocks seeded into `content_blocks` from the Word template analysis (`docs/reference/quotation-template-analysis.md`).
- US/UK price lists left empty until real data provided.

## 8. Testing

- Unit (Vitest): pricing engine — tax per region, discount caps per series, totals; numbering sequences.
- E2E (Playwright): login, full wizard quote→PDF smoke, invoice creation smoke.
- CI runs lint + typecheck + unit tests before deploy.

## 9. Error handling

- Finalize blocked with clear message if any line lacks a price for the document's region.
- PDF generation failures surfaced with retry; drafts never lost (autosave per step).
- DB backups: nightly `pg_dump` cron on VPS, rotated.

## 10. Phases

1. Scaffold: Next.js + Tailwind + shadcn, Auth.js, Prisma, Docker Compose, Nginx conf, GitHub Actions deploy.
2. Schema + migrations + Excel/Word seed import.
3. Catalog admin: series/products/options, images, per-region prices, compatibility matrix.
4. Clients (companies + contacts) + document builder wizard (multi-item, options, totals).
5. Invoice HTML template + Gotenberg PDF + numbering + finalize/snapshots.
6. Extended quotation template + content blocks admin.
7. Regions/entities/users admin, settings, backups, polish, e2e.

Out of scope v1: client emailing, payments/deposits tracking, non-manual FX, client portal.
