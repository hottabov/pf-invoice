import { formatMoney, isNegativeAmount } from "@/lib/format";
import { renderStoredRichText } from "@/lib/rich-text";
import type { DocSheetData } from "@/lib/sheet-data";
import { ItemBreakdownRows } from "@/components/sheet/item-breakdown";

/**
 * The document sheet: a single, self-contained render of a quote used by
 * BOTH the in-app preview route (src/app/(app)/documents/
 * [documentId]/preview/page.tsx) and, in a later task, the Gotenberg PDF
 * pipeline (src/lib/pdf.ts wraps this same markup in a full HTML document
 * and posts it to Gotenberg's headless Chromium).
 *
 * That second consumer is why this file is deliberately NOT a normal app
 * component: no Tailwind classes (Gotenberg's Chromium never sees this
 * app's compiled Tailwind stylesheet — only whatever HTML string is
 * actually posted to it), no data fetching, no `async`, nothing from
 * `@/lib/db` (the one exception, `renderStoredRichText` for `data.notes`
 * below, is a pure `@/lib/rich-text` helper with the same no-db/no-next
 * discipline as `renderMarkdown` always had) — every style needed to
 * render correctly standalone lives in
 * the one embedded `<style>` block below (plus a handful of inline `style`
 * attributes for values that come from data, e.g. the watermark rotation
 * anchor). It receives an already-fully-resolved `DocSheetData` — see
 * `toSheetData` in src/lib/sheet-data.ts, the pure mapper that produces one
 * from a loaded document (FINAL uses its frozen entitySnapshot, DRAFT falls
 * back to live region values) — and does no further data work of its own,
 * just JSX.
 */
export function DocumentSheet({ data }: { data: DocSheetData }) {
  const { totals } = data;
  // Same rule `QuotationSheet` already applies (see its own
  // `itemPriceVisible`) — `showOptionPrices` implies item totals are
  // visible too, since an option's price only makes sense next to the item
  // it's attached to. This sheet used to ignore both display flags
  // entirely and always print every price; it now honours them so a
  // salesperson who hides pricing sees that reflected here too.
  const itemPriceVisible = data.showItemPrices || data.showOptionPrices;

  return (
    <div className="pq-sheet">
      <style>{SHEET_CSS}</style>

      {data.isDraft ? (
        <div className="pq-watermark" aria-hidden="true">
          DRAFT
        </div>
      ) : null}

      <div className="pq-content">
        <header className="pq-header">
          <div className="pq-header-logo">
            {data.logo ? (
              // Plain <img>, not next/image: this markup is also posted to
              // Gotenberg as a raw HTML string, which next/image's
              // client-runtime optimization has no part in.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.logo} alt={data.entity.name} className="pq-logo-img" />
            ) : null}
          </div>
          <div className="pq-header-entity">
            <div className="pq-entity-name">{data.entity.name}</div>
            {data.entity.legalId ? <div className="pq-entity-line">{data.entity.legalId}</div> : null}
            {data.entity.address
              ? data.entity.address.split("\n").map((line, i) => (
                  // entityAddress is a single free-text Region field that may
                  // carry embedded newlines (street / city+postcode / phone /
                  // email / web, one per line) -- split rather than a single
                  // <div> so each line actually breaks instead of the "\n"
                  // rendering as a literal character inside one block.
                  <div className="pq-entity-line" key={i}>
                    {line}
                  </div>
                ))
              : null}
          </div>
        </header>

        <div className="pq-title-row">
          <div className="pq-title">{data.title}</div>
          <div className="pq-meta">
            {data.number ? (
              <div className="pq-meta-row">
                <span className="pq-meta-label">No.</span> {data.number}
              </div>
            ) : null}
            <div className="pq-meta-row">
              <span className="pq-meta-label">Date</span> {data.issueDate}
            </div>
            {data.validityDate ? (
              <div className="pq-meta-row">
                <span className="pq-meta-label">Price valid until</span> {data.validityDate}
              </div>
            ) : null}
          </div>
        </div>

        {data.client ? (
          <div className="pq-client">
            <div className="pq-client-label">Bill To</div>
            <div className="pq-client-name">{data.client.companyName}</div>
            {data.client.addressLines.map((line, i) => (
              <div className="pq-client-line" key={i}>
                {line}
              </div>
            ))}
            {data.client.website ? <div className="pq-client-line">{data.client.website}</div> : null}
            {data.client.contactName ? (
              <div className="pq-client-line pq-client-contact">Attn: {data.client.contactName}</div>
            ) : null}
            {data.client.contactEmail ? <div className="pq-client-line">{data.client.contactEmail}</div> : null}
            {data.client.contactPhone ? <div className="pq-client-line">{data.client.contactPhone}</div> : null}
          </div>
        ) : null}

        {/* Delivery address — only rendered when the company actually has
            one distinct from the main "Bill To" address above (owner:
            "client office is not always the manufacturing site"). Reuses
            the `.pq-client*` styling for visual consistency. */}
        {data.delivery ? (
          <div className="pq-client">
            <div className="pq-client-label">Delivery Address</div>
            {data.delivery.addressLines.map((line, i) => (
              <div className="pq-client-line" key={i}>
                {line}
              </div>
            ))}
            {data.delivery.contactName || data.delivery.phone ? (
              <div className="pq-client-line pq-client-contact">
                {[
                  data.delivery.contactName ? `Attn: ${data.delivery.contactName}` : null,
                  data.delivery.phone,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Compact "Prepared by" line (owner reference doc) — minimal on
            the plain summary sheet, unlike the quotation sheet's full
            two-column header (see quotation-sheet.tsx): just a name/
            email under BILL TO, no phone, no separate box. */}
        <div className="pq-prepared-by">
          {data.preparedBy.avatar ? (
            // Plain <img>, not next/image — same reasoning as the logo
            // above. No initials fallback (unlike the in-app `Avatar`
            // component) — a customer-facing quote either shows the real
            // photo or none at all, never a placeholder.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.preparedBy.avatar} alt="" className="pq-prepared-by-avatar" />
          ) : null}
          <span>
            Prepared by: {data.preparedBy.name ?? data.preparedBy.email}
            {data.preparedBy.name ? ` · ${data.preparedBy.email}` : ""}
          </span>
        </div>

        <table className="pq-items">
          <colgroup>
            <col className="pq-col-item" />
            <col className="pq-col-qty" />
            <col className="pq-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th className="pq-col-item">Item</th>
              <th className="pq-col-qty">Qty</th>
              <th className="pq-col-amount">Price</th>
            </tr>
          </thead>
          {data.items.map((item) => (
            // Each item's own <tbody> (its header row + option lines +
            // discount row) is the page-break-avoidance unit — see
            // .pq-item-group's `break-inside: avoid` below — so a single
            // item never gets split across a page boundary.
            <tbody className="pq-item-group" key={item.id}>
              <tr className="pq-item-row">
                <td className="pq-col-item">
                  <div className="pq-item-head">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt={item.name} className="pq-thumb" />
                    ) : null}
                    <div>
                      <div className="pq-item-name">
                        {item.name} <span className="pq-item-code">{item.code}</span>
                      </div>
                      {item.description ? <div className="pq-item-desc">{item.description}</div> : null}
                    </div>
                  </div>
                </td>
                <td className="pq-col-qty" />
                <td className="pq-col-amount pq-amount" />
              </tr>
              {/* Base price, options, item discount, per-item subtotal — see
                  item-breakdown.tsx. This sheet used to print `item.total`
                  only, leaving the base machine price invisible; the shared
                  presenter is the same one quotation-sheet.tsx uses, so the
                  two sheets can never drift on how they show a line's
                  money again. */}
              <ItemBreakdownRows
                breakdown={item.breakdown}
                code={item.code}
                currency={totals.currency}
                showPrices={itemPriceVisible}
                variant="sheet"
              />
            </tbody>
          ))}

          {data.extraLines.length > 0 ? (
            <tbody className="pq-item-group">
              {data.extraLines.map((line) => {
                const isNegative = isNegativeAmount(line.unitPrice);
                return (
                  <tr className="pq-item-row" key={line.id}>
                    <td className="pq-col-item">
                      <div className="pq-item-head">
                        {line.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={line.image} alt={line.name} className="pq-thumb" />
                        ) : null}
                        <div>
                          <div className="pq-item-name">{line.name}</div>
                          {line.description ? <div className="pq-item-desc">{line.description}</div> : null}
                        </div>
                      </div>
                    </td>
                    <td className={isNegative && itemPriceVisible ? "pq-col-qty pq-negative" : "pq-col-qty"}>
                      {itemPriceVisible ? (
                        <>
                          {line.qty} × {formatMoney(line.unitPrice, totals.currency)}
                        </>
                      ) : (
                        line.qty
                      )}
                    </td>
                    <td
                      className={
                        isNegative && itemPriceVisible
                          ? "pq-col-amount pq-amount pq-negative"
                          : "pq-col-amount pq-amount"
                      }
                    >
                      {itemPriceVisible ? formatMoney(line.lineTotal, totals.currency) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ) : null}
        </table>

        <div className="pq-totals">
          <div className="pq-totals-row">
            <span>Subtotal</span>
            <span>{formatMoney(totals.subtotal, totals.currency)}</span>
          </div>
          {totals.discountValue !== null ? (
            <div className="pq-totals-row">
              <span>
                Discount {totals.discountMode === "PERCENT" ? `${totals.discountValue}%` : formatMoney(totals.discountValue, totals.currency)}
              </span>
              <span>-{formatMoney(totals.discountAmount, totals.currency)}</span>
            </div>
          ) : null}
          <div className="pq-totals-row">
            <span>
              {totals.taxName} {totals.taxRate}%
            </span>
            <span>{formatMoney(totals.taxAmount, totals.currency)}</span>
          </div>
          <div className="pq-totals-row pq-totals-final">
            <span>TOTAL</span>
            <span>
              {formatMoney(totals.total, totals.currency)} {totals.currency}
            </span>
          </div>
          {/* Repeats the header's expiry right next to the price it applies
              to (owner: "put the valid-to in this total investment line, so
              it's obvious"). Carries the deadline, so it is set solid and
              dark rather than as a muted footnote — the quotation sheet's
              banner does the same in white on its dark background. */}
          {data.validityDate ? (
            <div className="pq-totals-row pq-totals-validity">
              <span>Price valid until</span>
              <span>{data.validityDate}</span>
            </div>
          ) : null}
        </div>

        {/* Free-text notes (Document.notes, rich text from the builder's
            Notes section — HTML from the WYSIWYG editor, or legacy markdown
            for a pre-migration row, either way rendered through
            `renderStoredRichText`, same as the quotation sheet's own notes
            section) — small, before bank details; never shown at all when
            the author left it blank. Content is admin-authored and
            sanitized on write (see setDocumentNotes), and sanitized again
            here defensively, same treatment `QuotationSheet` gives every
            other rich-text field — so `dangerouslySetInnerHTML` is safe by
            construction. */}
        {data.notes ? (
          <div className="pq-notes">
            <div className="pq-notes-title">Notes</div>
            <div
              className="pq-notes-text"
              dangerouslySetInnerHTML={{ __html: renderStoredRichText(data.notes) }}
            />
          </div>
        ) : null}

        {data.entity.bankDetails.length > 0 || data.entity.footerText ? (
          <div className="pq-footer">
            {data.entity.bankDetails.length > 0 ? (
              <div className="pq-bank">
                <div className="pq-bank-title">Bank Details</div>
                {data.entity.bankDetails.map((row) => (
                  <div className="pq-bank-row" key={row.label}>
                    <span className="pq-bank-label">{row.label}:</span> {row.value}
                  </div>
                ))}
              </div>
            ) : null}
            {data.entity.footerText ? <div className="pq-footer-text">{data.entity.footerText}</div> : null}
          </div>
        ) : null}

        {data.showSignature ? (
          <div className="pq-signatures">
            <div className="pq-sig-block">
              <div className="pq-sig-line" />
              <div className="pq-sig-label">Purchaser</div>
            </div>
            <div className="pq-sig-block">
              <div className="pq-sig-line" />
              <div className="pq-sig-label">Pathfinder</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}


// Brand colors per the PathQuote style guide: #243478 (primary/header rule),
// #00B8E2 (accent), #2B304F (dark text/headings) — matching
// --color-brand/--color-brand-accent/--color-brand-dark in
// src/app/globals.css, but hardcoded here since this markup never has that
// stylesheet available (see the component doc comment above).
const SHEET_CSS = `
  .pq-sheet {
    position: relative;
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    background: #ffffff;
    color: #1a1a1a;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    line-height: 1.4;
    box-sizing: border-box;
  }
  .pq-sheet * {
    box-sizing: border-box;
  }
  .pq-content {
    position: relative;
    z-index: 1;
    padding: 15mm;
  }
  .pq-watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 90px;
    font-weight: 700;
    letter-spacing: 10px;
    color: rgba(43, 48, 79, 0.08);
    white-space: nowrap;
    z-index: 0;
    pointer-events: none;
  }
  .pq-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 12px;
    border-bottom: 3px solid #243478;
  }
  .pq-logo-img {
    max-width: 180px;
    max-height: 64px;
    object-fit: contain;
  }
  .pq-header-entity {
    text-align: right;
  }
  .pq-entity-name {
    font-size: 14px;
    font-weight: 700;
    color: #2b304f;
  }
  .pq-entity-line {
    color: #444444;
  }
  .pq-title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-top: 18px;
  }
  .pq-title {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 2px;
    color: #243478;
  }
  .pq-meta {
    text-align: right;
  }
  .pq-meta-row {
    color: #333333;
  }
  .pq-meta-label {
    color: #777777;
  }
  .pq-client {
    margin-top: 18px;
    padding: 10px 12px;
    border-left: 3px solid #00b8e2;
    background: #f7fbfd;
  }
  .pq-client-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #00b8e2;
  }
  .pq-client-name {
    font-size: 13px;
    font-weight: 700;
    color: #2b304f;
    margin-top: 2px;
  }
  .pq-client-line {
    color: #444444;
  }
  .pq-client-contact {
    margin-top: 4px;
  }
  /* Compact "Prepared by" line (owner reference doc) — minimal, unlike the
     quotation sheet's own full two-column header. */
  .pq-prepared-by {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    color: #777777;
    font-size: 10px;
  }
  .pq-prepared-by-avatar {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }
  .pq-notes {
    margin-top: 24px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .pq-notes-title {
    font-weight: 700;
    color: #2b304f;
    margin-bottom: 3px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .pq-notes-text {
    color: #555555;
    font-size: 10px;
  }
  .pq-notes-text p {
    margin: 0 0 6px 0;
  }
  .pq-notes-text p:last-child {
    margin-bottom: 0;
  }
  .pq-notes-text ul,
  .pq-notes-text ol {
    margin: 0 0 6px 0;
    padding-left: 16px;
  }
  .pq-notes-text ul:last-child,
  .pq-notes-text ol:last-child {
    margin-bottom: 0;
  }
  .pq-notes-text strong {
    color: #333333;
  }
  .pq-notes-text a {
    color: #243478;
  }
  .pq-items {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    margin-top: 20px;
  }
  .pq-items thead th {
    text-align: left;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #2b304f;
    border-bottom: 2px solid #243478;
    padding: 6px 4px;
  }
  /* Higher specificity than ".pq-items thead th" above, so the header cells
     line up with the same right/left alignment as their <td> counterparts
     instead of every header defaulting to left-aligned text. */
  .pq-items thead th.pq-col-qty,
  .pq-items thead th.pq-col-amount {
    text-align: right;
  }
  .pq-col-item {
    width: 60%;
  }
  .pq-col-qty {
    width: 22%;
    text-align: right;
  }
  .pq-col-amount {
    width: 18%;
    text-align: right;
  }
  .pq-items td {
    padding: 6px 4px;
    vertical-align: top;
    border-bottom: 1px solid #e4e4e4;
  }
  .pq-item-row td {
    padding-top: 10px;
  }
  /* Keeps each item's full row group (name + option lines + discount row)
     together across a page boundary in the printed/PDF output, instead of
     letting Chromium split it mid-item. */
  .pq-item-group {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .pq-item-head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .pq-thumb {
    width: 60px;
    height: 60px;
    object-fit: contain;
    border: 1px solid #e4e4e4;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .pq-item-name {
    font-weight: 700;
    color: #2b304f;
  }
  .pq-item-code {
    font-weight: 400;
    color: #888888;
    font-size: 10px;
  }
  .pq-item-desc {
    color: #666666;
    font-size: 10px;
    margin-top: 2px;
  }
  .pq-option-row td {
    border-bottom: none;
    padding-top: 3px;
    padding-bottom: 3px;
  }
  .pq-option-indent {
    padding-left: 18px !important;
  }
  .pq-option-name {
    color: #333333;
  }
  .pq-option-desc {
    color: #888888;
    font-size: 9.5px;
  }
  .pq-discount-row td {
    border-bottom: none;
    padding-top: 0;
    padding-bottom: 8px;
    color: #b45309;
    font-style: italic;
    font-size: 10px;
  }
  /* Per-item subtotal row (base + options, less the item discount — see
     item-breakdown.tsx) — same treatment quotation-sheet.tsx's own copy of
     this rule gets, small and muted, distinct from the plain option rows
     above it and the document-level totals block below the table. */
  .pq-item-subtotal-row td {
    border-bottom: none;
    padding-top: 2px;
    padding-bottom: 8px;
    color: #555555;
    font-weight: 700;
    font-size: 10px;
  }
  .pq-amount {
    text-align: right;
    white-space: nowrap;
  }
  /* A negative extra line (trade-in) — muted and italic so its amount
     reads distinctly from an ordinary charge, never mistaken for one. */
  .pq-negative {
    color: #64748b;
    font-style: italic;
  }
  .pq-totals {
    width: 60%;
    margin-left: auto;
    margin-top: 12px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .pq-totals-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    color: #333333;
    border-bottom: 1px solid #eeeeee;
  }
  .pq-totals-final {
    margin-top: 4px;
    border-bottom: none;
    border-top: 2px solid #243478;
    font-size: 14px;
    font-weight: 700;
    color: #243478;
  }
  /* The expiry, repeated right under TOTAL (see the JSX comment above).
     This sheet has no dark banner to sit on, so it earns attention through
     weight and a solid colour instead of white — still clearly subordinate
     to the total above it, but no longer a footnote a reader skims past. */
  .pq-totals-validity {
    border-bottom: none;
    font-size: 12px;
    font-weight: 700;
    color: #243478;
  }
  .pq-footer {
    margin-top: 28px;
    padding-top: 12px;
    border-top: 1px solid #e4e4e4;
    display: flex;
    justify-content: space-between;
    gap: 24px;
    font-size: 10px;
    color: #555555;
  }
  .pq-bank {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .pq-bank-title {
    font-weight: 700;
    color: #2b304f;
    margin-bottom: 3px;
  }
  .pq-bank-label {
    color: #888888;
  }
  .pq-footer-text {
    max-width: 60%;
    color: #777777;
    white-space: pre-line;
  }
  .pq-signatures {
    margin-top: 40px;
    display: flex;
    gap: 60px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .pq-sig-block {
    flex: 1;
  }
  .pq-sig-line {
    border-top: 1px solid #333333;
    height: 32px;
  }
  .pq-sig-label {
    margin-top: 4px;
    font-size: 10px;
    color: #555555;
  }
`;
