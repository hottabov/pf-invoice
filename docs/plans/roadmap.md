# PathQuote Roadmap

Spec: `docs/specs/2026-08-29-pathquote-design.md`. Detailed plans live in `docs/plans/`, one per phase, written just-in-time before each phase starts (so they reflect the real state of the code).

| Phase | Deliverable | Plan |
|---|---|---|
| 1. Foundation ✅ | Next.js + Prisma + Auth (credentials + magic link) + Docker Compose + Nginx conf + CI deploy. Login works on q.pathfindercut.com. | `2026-08-29-phase-1-2-foundation.md` |
| 2. Schema & seed ✅ | Full DB schema, migrations, Excel → JSON → DB seed (M/X-Calibre/L/Punchline/Software/LNS/EasyLoader/EasyFeeder/FabricPro, options, AUD prices, compatibility). Done 2026-08-29 (code complete; VPS bring-up pending per docs/runbook.md). | same plan |
| 3. Catalog admin ✅ | CRUD: series/products/options, image upload, per-region prices, compatibility matrix editor. Done 2026-08-29. | `2026-08-29-phase-3-catalog-admin.md` |
| 4. Clients & builder | Companies + contacts CRUD; document wizard: multi-item, options, discounts with series caps, totals, autosave drafts. | TBD |
| 5. Invoice PDF | Invoice HTML template (brand, entity legal block, tax), Gotenberg PDF, numbering sequences, finalize + snapshots. | TBD |
| 6. Quotation | Extended quotation template, content_blocks admin (T&C, General Conditions, RSP, option descriptions), RSP coverage table. | TBD |
| 7. Admin & polish | Users/regions/entities admin, settings, backups (pg_dump cron), e2e suite, mobile polish. | TBD |

Out of scope v1: client emailing, payment tracking, FX conversion, client portal.

## Key decisions (locked)

- Gotenberg sidecar for PDF; same HTML for preview and PDF
- One manual price per item per region (no tiers); each region = own currency, tax rules, price list, legal entity
- Quotes and invoices independent; no conversion
- `document_items` = configurable product instances (N per document, each with own options)
- Companies have many contacts; document → company + contact
- Roles: admin / manager (manager sees own documents/clients only)
- No self-signup; config in DB; only secrets in `.env`
- Language: English everywhere in the project — code, comments, UI, docs, commits
- Dev sandbox has no Docker/Postgres: migrations generated via `prisma migrate diff`; seed/migration verification runs in CI (postgres service) and on the VPS
