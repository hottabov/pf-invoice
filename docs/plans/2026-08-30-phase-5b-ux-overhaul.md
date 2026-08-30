# PathQuote Phase 5b: UI/UX Overhaul

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Every implementer MUST consult the vendored design-intelligence skill before building: read `.claude/skills/ui-ux-pro-max/SKILL.md` and run `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <ux|style|typography|color|icons>` for the concerns of its task. Brand palette and this design direction override skill palette suggestions.

**Goal:** Production-quality interface: full desktop experience (primary work environment) + genuinely touch-friendly mobile. No functional changes — same actions/queries; presentation layer only (plus tiny helpers).

## Design direction (locked)

- **Style:** clean modern enterprise, flat, white content surfaces, 8px spacing grid, `rounded-xl` cards, hairline borders (`border-slate-200`), subtle shadows only on overlays. NO glassmorphism/gradients.
- **Brand roles:** `#243478` (brand) = primary buttons, links, active nav, focus rings; `#00B8E2` (brand-accent) = active indicators, highlights, selected states — sparingly; `#2B304F` (brand-dark) = desktop sidebar & login background, dark text headings.
- **Layout:**
  - **Desktop (lg+):** persistent left sidebar 240px, bg brand-dark, white text, icons + labels, active item = accent left bar + lighter bg; content area `max-w-6xl mx-auto px-8 py-6`; lists = real tables; forms = two-column grid (`lg:grid-cols-2`), full-width fields where long.
  - **Tablet (md):** same sidebar collapsed to icons-only 64px (labels as title attr).
  - **Mobile (<md):** bottom nav (existing) + safe-area-inset padding; content px-4; all rows/cards min-h 48px; primary actions as full-width buttons or sticky bars.
- **Typography:** base 16px (inputs ≥16px — prevents iOS zoom), tables 14px, page titles 22px/600, section titles 16px/600, muted `text-slate-500`.
- **Interaction:** visible focus rings (`focus-visible:ring-2 ring-brand`), hover states desktop-only (`hover:` md+), active/pressed feedback everywhere, transitions 150ms, `motion-reduce:transition-none`. Touch targets ≥44×44px, ≥8px gaps.
- **Feedback:** replace `window.confirm` with shared `<ConfirmDialog>`; action results via inline alert + lightweight toast (`<Toaster>` minimal custom, no new deps).

## Shared components (Task A builds; B-D consume)

`src/components/ui-kit/`: `PageHeader` (title, description?, actions slot, back link?), `SectionCard` (titled bordered card), `DataTable` primitives (`<TableShell>` overflow wrapper: md+ real table, sm stacked cards via children render props — keep simple: two explicit slots `table` and `cards`), `StatusBadge` (DRAFT amber, FINAL green, roles, price-required), `EmptyState` (icon, text, action), `ConfirmDialog` (client, promise-based confirm(fn) pattern), `Toast` (context + `useToast()`, bottom-center mobile / bottom-right desktop, auto-dismiss 4s), `FieldRow` (label+input+error consistent form row).

---

### Task A: Tokens, ui-kit, AppShell v2, login

**Files:** `src/components/ui-kit/*` (new), `src/components/app-shell.tsx`, `src/components/app-nav.tsx`, `src/app/globals.css`, `src/app/login/*`, `src/app/(app)/page.tsx` (dashboard).

- [ ] globals.css: focus-ring defaults, safe-area utilities (`pb-safe` using env(safe-area-inset-bottom)), smooth scroll off, selection color brand.
- [ ] Build all ui-kit components above (self-contained, typed, no new deps; icons lucide).
- [ ] AppShell v2: desktop sidebar per direction (brand-dark, logo wordmark top, nav, user block bottom with role badge + logout); md icons-only; mobile top bar simplified (wordmark + user menu) + bottom nav with safe-area, active accent; content container widths per direction.
- [ ] Login: brand-dark full-screen background, centered white card, wordmark, spacing per 8px grid, inputs 16px, button 48px, magic-link toggle styled.
- [ ] Dashboard: quick actions row (New quote / New invoice — primary buttons), nav cards grid with counts (documents/clients — pass counts via queries; add tiny `countsForDashboard()` query), recent documents list (5, reuse listDocuments).
- [ ] Consult skill: `"sidebar navigation active state" --domain ux`, `"login form" --domain ux`, `"dashboard cards" --domain style`.
- [ ] Gates (typegen+typecheck, lint, build, test) → commit `feat(ui): design kit, app shell v2, login and dashboard`.

### Task B: Documents list + builder (flagship screens)

**Files:** `src/app/(app)/documents/**`, `src/components/builder/*`.

- [ ] Documents list: desktop = table (Number, Type, Company, Total, Status, Updated; row click → builder; hover bg); mobile = cards (number+type badge top, company, total right, status). Filter tabs + search styled as segmented control + search input with icon. Create buttons in PageHeader actions.
- [ ] Builder desktop (lg+): two-pane — left column (client, items, extra lines, discounts sections as SectionCards) + right sticky summary panel (totals breakdown, status, Finalize/Preview/PDF actions, violations/errors area). Mobile: current stacked flow + sticky bottom totals bar retained (safe-area), actions in bottom sheet-ish block.
- [ ] Items: item card redesign — header row (name, code mono, total right), options chips wrap, actions row (Edit options / discount field / remove icon-button 44px). Options editor panel: keep logic; restyle rows 48px, sticky Save within panel, qty steppers 44px buttons.
- [ ] Client picker: combobox-style with search (existing logic restyle), selected company card with contact select below.
- [ ] All dialogs → ConfirmDialog; all action feedback → toast + inline error preserved.
- [ ] Consult skill: `"multi step form review summary" --domain ux`, `"sticky summary panel checkout" --domain ux`, `"quantity stepper touch" --domain ux`.
- [ ] Gates → commit `feat(ui): documents list and builder redesign`.

### Task C: Clients screens

**Files:** `src/app/(app)/clients/**`, `src/components/clients/*`.

- [ ] List: desktop table (Name, Location, Region, Contacts, Website link icon); mobile cards; search in PageHeader; EmptyState for none.
- [ ] Company page: two-column form on desktop (FieldRow), contacts as SectionCard with table/cards + inline add/edit forms restyled, primary star 44px, danger zone visually separated (red border card).
- [ ] New company: same form, PageHeader back link.
- [ ] Consult skill: `"form layout two column" --domain ux`, `"inline edit list" --domain ux`.
- [ ] Gates → commit `feat(ui): clients screens redesign`.

### Task D: Catalog screens + preview polish

**Files:** `src/app/(app)/catalog/**`, `src/components/catalog/*`, preview page chrome.

- [ ] Catalog home: series as table on desktop (Name, Code, Products, Max discount) or keep cards but denser grid lg:grid-cols-3; Options entry card distinct (accent border).
- [ ] Products/options lists: desktop tables (Code mono, Name, Price right-aligned tabular-nums, Status badges); mobile cards; admin Add buttons in PageHeader.
- [ ] Editors: two-column layout (main fields left, image + prices + compatibility right on desktop; stacked mobile); price editor as aligned grid (region code, currency, input right-aligned, save); attribute schema textarea mono; delete in danger zone card. Image upload dropzone styled (dashed border, preview).
- [ ] Preview page chrome: toolbar restyle (back, number, actions right), sheet centered with shadow on slate-100 bg, print-safe (sheet styles untouched).
- [ ] Settings placeholder: SectionCard "Coming soon" styled + show current user/region info read-only.
- [ ] Consult skill: `"data table alignment numbers" --domain ux`, `"image upload dropzone" --domain ux`.
- [ ] Gates → commit `feat(ui): catalog, preview, settings polish`.

### Task E: Accessibility + consistency audit, fixes, roadmap

- [ ] Reviewer pass with skill checklists (`references/pro-rules.md` + priority table 1-2-5): contrast ≥4.5 on all badge/button combos (verify amber/green badges), focus ring everywhere interactive, keyboard: dialogs trap+Esc, all icon-buttons aria-label, touch ≥44px audit, no horizontal scroll at 360px width, inputs ≥16px, motion-reduce. Verify no functional regressions: `npm test`, build, grep for removed actions.
- [ ] Fix findings; roadmap 5b ✅; commit.

**Out of scope:** dark mode, sortable tables, command palette, animations beyond micro-transitions, quotation template (Phase 6).
