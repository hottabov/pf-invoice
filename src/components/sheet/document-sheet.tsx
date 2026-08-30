import { formatMoney } from "@/lib/format";
import type { DocSheetData, DocSheetLine } from "@/lib/sheet-data";

/**
 * The document sheet: a single, self-contained render of a quote/invoice
 * used by BOTH the in-app preview route (src/app/(app)/documents/
 * [documentId]/preview/page.tsx) and, in a later task, the Gotenberg PDF
 * pipeline (src/lib/pdf.ts wraps this same markup in a full HTML document
 * and posts it to Gotenberg's headless Chromium).
 *
 * That second consumer is why this file is deliberately NOT a normal app
 * component: no Tailwind classes (Gotenberg's Chromium never sees this
 * app's compiled Tailwind stylesheet — only whatever HTML string is
 * actually posted to it), no data fetching, no `async`, nothing from
 * `@/lib/db` — every style needed to render correctly standalone lives in
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
            {data.entity.address ? <div className="pq-entity-line">{data.entity.address}</div> : null}
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
                <span className="pq-meta-label">Valid until</span> {data.validityDate}
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

        <table className="pq-items">
          <colgroup>
            <col className="pq-col-item" />
            <col className="pq-col-qty" />
            <col className="pq-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th className="pq-col-item">Item</th>
              <th className="pq-col-qty">Qty × Price</th>
              <th className="pq-col-amount">Total</th>
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
                <td className="pq-col-amount pq-amount">{formatMoney(item.total, totals.currency)}</td>
              </tr>
              {item.lines.map((line) => (
                <OptionRow key={line.id} line={line} currency={totals.currency} />
              ))}
              {item.discountPct !== null ? (
                <tr className="pq-discount-row">
                  <td className="pq-col-item pq-option-indent">Item discount</td>
                  <td className="pq-col-qty" />
                  <td className="pq-col-amount pq-amount">-{item.discountPct}%</td>
                </tr>
              ) : null}
            </tbody>
          ))}

          {data.extraLines.length > 0 ? (
            <tbody className="pq-item-group">
              {data.extraLines.map((line) => (
                <tr className="pq-item-row" key={line.id}>
                  <td className="pq-col-item">
                    <div className="pq-item-name">{line.name}</div>
                    {line.description ? <div className="pq-item-desc">{line.description}</div> : null}
                  </td>
                  <td className="pq-col-qty">
                    {line.qty} × {formatMoney(line.unitPrice, totals.currency)}
                  </td>
                  <td className="pq-col-amount pq-amount">{formatMoney(line.lineTotal, totals.currency)}</td>
                </tr>
              ))}
            </tbody>
          ) : null}
        </table>

        <div className="pq-totals">
          <div className="pq-totals-row">
            <span>Subtotal</span>
            <span>{formatMoney(totals.subtotal, totals.currency)}</span>
          </div>
          {totals.discountPct !== null ? (
            <div className="pq-totals-row">
              <span>Discount {totals.discountPct}%</span>
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
        </div>

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

function OptionRow({ line, currency }: { line: DocSheetLine; currency: string }) {
  return (
    <tr className="pq-option-row">
      <td className="pq-col-item pq-option-indent">
        <div className="pq-option-name">{line.code ? `${line.code} — ${line.name}` : line.name}</div>
        {line.description ? <div className="pq-option-desc">{line.description}</div> : null}
      </td>
      <td className="pq-col-qty">
        {line.qty} × {formatMoney(line.unitPrice, currency)}
      </td>
      <td className="pq-col-amount pq-amount">{formatMoney(line.lineTotal, currency)}</td>
    </tr>
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
  .pq-amount {
    text-align: right;
    white-space: nowrap;
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
