import { formatMoney } from "@/lib/format";
import type { QuotationData } from "@/lib/quotation-data";
import type { DocSheetLine } from "@/lib/sheet-data";

/**
 * The extended quotation sheet (Phase 6): a single, self-contained render of
 * a QUOTE's full content-block-driven detail — cover header, one section per
 * machine/equipment item with its admin-authored description and selected
 * options rendered from markdown, an investment summary table, terms,
 * general conditions, the RSP agreement + coverage table, and signatures.
 * Used by both the `/documents/[documentId]/quotation` preview route and,
 * via src/lib/pdf.ts's `renderQuotationHtml`, the quotation PDF pipeline —
 * see src/components/sheet/document-sheet.tsx's header comment for why that
 * split (no Tailwind, no data fetching, one embedded `<style>` block) is
 * mandatory for anything Gotenberg's headless Chromium renders.
 *
 * It receives an already-fully-assembled `QuotationData` — see
 * `buildQuotationData` in src/lib/quotation-data.ts, the pure assembler that
 * resolves content blocks, substitutes `{{placeholders}}`, and renders
 * markdown to HTML — and does no further data work of its own, just JSX.
 * Every block body reaches this component as trusted, already-escaped HTML
 * (renderMarkdown HTML-escapes its input before any markdown transform
 * runs), so `dangerouslySetInnerHTML` here is safe by construction.
 */
export function QuotationSheet({ data }: { data: QuotationData }) {
  const { totals } = data;
  // `showOptionPrices` implies item totals are visible too (see
  // `QuotationData.showItemPrices`'s doc comment) — every per-item amount
  // in this sheet (the auto-summary price, the investment table's item and
  // extra-line amount columns, the item discount row) is gated on this,
  // while `data.showOptionPrices` alone gates only the option rows. The
  // grand total banner and the totals block below the table are never
  // gated by either flag — the owner's rule is the client always sees the
  // bottom line, only the itemized detail is optional.
  const itemPriceVisible = data.showItemPrices || data.showOptionPrices;
  const optionPriceVisible = data.showOptionPrices;

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
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.logo} alt={data.entity.name} className="pq-logo-img" />
            ) : null}
          </div>
          <div className="pq-header-entity">
            <div className="pq-entity-name">{data.entity.name}</div>
            {data.entity.legalId ? <div className="pq-entity-line">{data.entity.legalId}</div> : null}
            {data.entity.address
              ? data.entity.address.split("\n").map((line, i) => (
                  // See document-sheet.tsx's identical block: entityAddress
                  // may carry embedded newlines, so split into one line per
                  // <div> rather than rendering "\n" as a literal character.
                  <div className="pq-entity-line" key={i}>
                    {line}
                  </div>
                ))
              : null}
          </div>
        </header>

        <div className="pq-title-row">
          <div className="pq-title">QUOTATION</div>
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

        {/* Total investment banner (owner: "client must see it immediately"
            — the grand total for everything, always shown up top regardless
            of the price-display toggles below, which only gate the
            itemized per-item/per-option detail further down the page). */}
        <div className="pq-total-banner">
          <span className="pq-total-banner-label">Total investment</span>
          <span className="pq-total-banner-amount">
            {formatMoney(totals.total, totals.currency)} {totals.currency}
          </span>
          <span className="pq-total-banner-note">
            (incl. {totals.taxName} {totals.taxRate}%)
          </span>
        </div>

        {data.machineSections.length > 0 ? (
          <section className="pq-section">
            <h1 className="pq-section-title">Equipment Detail</h1>
            {data.machineSections.map((section) => (
              <div className="pq-machine-section" key={section.itemId}>
                {/* Title/spec + product photo are one page-break-avoidance
                    unit (owner: images normally run full width right after
                    the product title) — the option write-ups that follow
                    are outside this group since a long option list can
                    legitimately spill onto the next page even when the
                    title+image pair itself must not split. */}
                <div className="pq-title-image-group">
                  {section.titleBlockHtml ? (
                    <div className="pq-block-body" dangerouslySetInnerHTML={{ __html: section.titleBlockHtml }} />
                  ) : (
                    // No admin-authored content block matched this item's
                    // product (e.g. L-Series has none — see
                    // src/lib/quotation-data.ts's `productBlockKey`) — render
                    // a minimal auto-generated section from what's already
                    // known about the item instead of just its bare name/code,
                    // so every machine item still gets a real write-up.
                    <div className="pq-block-missing pq-auto-summary">
                      <div className="pq-auto-summary-name">
                        {section.lineSummary.name} <span className="pq-item-code">{section.lineSummary.code}</span>
                      </div>
                      {section.specSentence ? (
                        <div className="pq-auto-summary-spec">{section.specSentence}</div>
                      ) : null}
                      {itemPriceVisible ? (
                        <div className="pq-auto-summary-price">
                          {formatMoney(section.lineSummary.total, totals.currency)}
                        </div>
                      ) : null}
                    </div>
                  )}
                  {section.lineSummary.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={section.lineSummary.image}
                      alt={section.lineSummary.name}
                      className="pq-machine-image"
                    />
                  ) : null}
                </div>
                {section.optionBlocksHtml.length > 0 ? (
                  <div className="pq-options">
                    {section.optionBlocksHtml.map((option) => (
                      <div
                        className="pq-block-body pq-option-block"
                        key={option.key}
                        dangerouslySetInnerHTML={{ __html: option.bodyHtml }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        <section className="pq-section pq-summary-section">
          <h1 className="pq-section-title">Investment Summary</h1>
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
              <tbody className="pq-item-group" key={item.id}>
                <tr className="pq-item-row">
                  <td className="pq-col-item">
                    <div className="pq-item-name">
                      {item.name} <span className="pq-item-code">{item.code}</span>
                    </div>
                    {item.description ? <div className="pq-item-desc">{item.description}</div> : null}
                  </td>
                  <td className="pq-col-qty" />
                  <td className="pq-col-amount pq-amount">
                    {itemPriceVisible ? formatMoney(item.total, totals.currency) : null}
                  </td>
                </tr>
                {item.lines.map((line) => (
                  <OptionRow key={line.id} line={line} currency={totals.currency} visible={optionPriceVisible} />
                ))}
                {item.discountPct !== null && itemPriceVisible ? (
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
                      {itemPriceVisible ? (
                        <>
                          {line.qty} × {formatMoney(line.unitPrice, totals.currency)}
                        </>
                      ) : (
                        line.qty
                      )}
                    </td>
                    <td className="pq-col-amount pq-amount">
                      {itemPriceVisible ? formatMoney(line.lineTotal, totals.currency) : null}
                    </td>
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
        </section>

        {data.termsSections.length > 0 ? (
          <section className="pq-section">
            <h1 className="pq-section-title">Terms</h1>
            {data.termsSections.map((term) => (
              <div className="pq-flow-block" key={term.key}>
                {term.title ? <h2 className="pq-block-title">{term.title}</h2> : null}
                <div className="pq-block-body" dangerouslySetInnerHTML={{ __html: term.bodyHtml }} />
              </div>
            ))}
          </section>
        ) : null}

        {data.conditionsSections.length > 0 ? (
          <section className="pq-section pq-conditions-section">
            <h1 className="pq-section-title">General Conditions of Sale</h1>
            {data.conditionsSections.map((condition, index) => (
              <div className="pq-flow-block" key={condition.key}>
                <h2 className="pq-block-title">
                  {index + 1}. {condition.title}
                </h2>
                <div className="pq-block-body" dangerouslySetInnerHTML={{ __html: condition.bodyHtml }} />
              </div>
            ))}
          </section>
        ) : null}

        {data.rsp.agreementHtml || data.rsp.coverageRows.length > 0 ? (
          <section className="pq-section">
            <h1 className="pq-section-title">Remote Support Program</h1>
            {data.rsp.agreementHtml ? (
              <div className="pq-flow-block pq-block-body" dangerouslySetInnerHTML={{ __html: data.rsp.agreementHtml }} />
            ) : null}
            {data.rsp.coverageRows.length > 0 ? (
              <table className="pq-rsp-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Serial Number</th>
                    <th>RSP unit cost p/year</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rsp.coverageRows.map((row, i) => (
                    <tr key={i}>
                      <td>{row.name}</td>
                      <td>{row.serialNumber || "—"}</td>
                      <td>{row.rspUnitCost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>
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

/** `visible` gates only the qty×price/amount columns (per `showOptionPrices`
 * — see `QuotationSheet`'s `optionPriceVisible`) — the option's name and
 * description always render regardless, same as an item row's name/qty. */
function OptionRow({ line, currency, visible }: { line: DocSheetLine; currency: string; visible: boolean }) {
  return (
    <tr className="pq-option-row">
      <td className="pq-col-item pq-option-indent">
        <div className="pq-option-name">{line.code ? `${line.code} — ${line.name}` : line.name}</div>
        {line.description ? <div className="pq-option-desc">{line.description}</div> : null}
      </td>
      <td className="pq-col-qty">
        {visible ? (
          <>
            {line.qty} × {formatMoney(line.unitPrice, currency)}
          </>
        ) : (
          line.qty
        )}
      </td>
      <td className="pq-col-amount pq-amount">{visible ? formatMoney(line.lineTotal, currency) : null}</td>
    </tr>
  );
}

// Brand colors/typography match src/components/sheet/document-sheet.tsx's
// SHEET_CSS exactly (same hardcoded reasoning: this markup never has the
// app's compiled Tailwind stylesheet available), plus the extra rules this
// sheet's content-block sections/tables need.
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
  .pq-total-banner {
    margin-top: 18px;
    padding: 14px 16px;
    border-radius: 6px;
    background: #243478;
    color: #ffffff;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .pq-total-banner-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: #b9c2e8;
  }
  .pq-total-banner-amount {
    font-size: 18px;
    font-weight: 700;
  }
  .pq-total-banner-note {
    font-size: 10px;
    color: #b9c2e8;
  }
  .pq-section {
    margin-top: 28px;
  }
  .pq-section-title {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #243478;
    border-bottom: 2px solid #243478;
    padding-bottom: 6px;
    margin: 0 0 14px 0;
    /* Never let a section heading render as the last line on a page with
       its own content pushed to the next one. */
    page-break-after: avoid;
    break-after: avoid;
  }
  /* Each machine/equipment item's whole write-up (title block + its option
     blocks) is the page-break-avoidance unit, mirroring .pq-item-group in
     document-sheet.tsx — "where reasonable" per the plan, since a very long
     write-up can still legitimately span a page in Chromium's printed
     output. */
  .pq-machine-section {
    page-break-inside: avoid;
    break-inside: avoid;
    margin-bottom: 20px;
    padding-top: 16px;
    border-top: 1px solid #e0e4f0;
  }
  /* No separator above the very first item — the total banner above it
     already provides the visual break. */
  .pq-machine-section:first-child {
    padding-top: 0;
    border-top: none;
  }
  .pq-machine-section:last-child {
    margin-bottom: 0;
  }
  .pq-title-image-group {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .pq-machine-image {
    display: block;
    width: 100%;
    height: auto;
    max-height: 9cm;
    object-fit: contain;
    margin-top: 10px;
  }
  .pq-options {
    margin-top: 10px;
    padding-left: 14px;
    border-left: 2px solid #e4e4e4;
  }
  .pq-option-block {
    margin-top: 8px;
  }
  .pq-option-block:first-child {
    margin-top: 0;
  }
  .pq-block-missing {
    color: #333333;
  }
  /* Auto-generated item title (no admin-authored content block matched —
     see quotation-data.ts's productBlockKey) — styled to match the
     prominence of a real .pq-block-body heading below, so every machine
     item's name reads as a real heading rather than blending into the
     surrounding text (owner: "product names blend with the text"). */
  .pq-auto-summary-name {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.3px;
    color: #243478;
    page-break-after: avoid;
    break-after: avoid;
  }
  .pq-auto-summary-spec {
    margin-top: 4px;
    color: #444444;
    font-weight: 400;
  }
  .pq-auto-summary-price {
    margin-top: 6px;
    color: #243478;
    font-weight: 700;
  }
  .pq-flow-block {
    margin-bottom: 16px;
  }
  .pq-flow-block:last-child {
    margin-bottom: 0;
  }
  .pq-block-title {
    font-size: 12px;
    font-weight: 700;
    color: #2b304f;
    margin: 0 0 4px 0;
    page-break-after: avoid;
    break-after: avoid;
  }
  .pq-conditions-section .pq-block-body {
    font-size: 10px;
    color: #444444;
  }
  .pq-block-body {
    color: #333333;
  }
  .pq-block-body p {
    margin: 0 0 8px 0;
  }
  .pq-block-body p:last-child {
    margin-bottom: 0;
  }
  /* Top-level block heading (e.g. machine.m-series's "## Pathfinder {{model}}
     Cutting System", rsp.agreement's "## Pathfinder Remote Support Program")
     — same size/weight/color tier as .pq-section-title and
     .pq-auto-summary-name so a product/section name is unmistakable at a
     glance rather than blending into the body text underneath it, and never
     orphaned from the content it introduces across a page break. */
  .pq-block-body h1,
  .pq-block-body h2 {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.3px;
    color: #243478;
    margin: 12px 0 8px 0;
    page-break-after: avoid;
    break-after: avoid;
  }
  .pq-block-body h1:first-child,
  .pq-block-body h2:first-child {
    margin-top: 0;
  }
  /* Sub-heading within a block (e.g. "### Software", "### Accessories") —
     one tier down, matching .pq-block-title's size/color so the hierarchy
     stays consistent across every content-block section. */
  .pq-block-body h3 {
    font-size: 12px;
    font-weight: 700;
    color: #2b304f;
    margin: 10px 0 6px 0;
    page-break-after: avoid;
    break-after: avoid;
  }
  .pq-block-body h3:first-child {
    margin-top: 0;
  }
  .pq-block-body ul {
    margin: 0 0 8px 0;
    padding-left: 18px;
  }
  .pq-block-body ul:last-child {
    margin-bottom: 0;
  }
  .pq-block-body strong {
    color: #2b304f;
  }
  .pq-items {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    margin-top: 12px;
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
  .pq-item-group {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .pq-item-name {
    font-weight: 700;
    color: #2b304f;
  }
  .pq-item-code {
    font-family: "Courier New", Courier, monospace;
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
  .pq-rsp-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 14px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .pq-rsp-table th {
    text-align: left;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #2b304f;
    border-bottom: 2px solid #243478;
    padding: 6px 4px;
  }
  .pq-rsp-table td {
    padding: 6px 4px;
    border-bottom: 1px solid #e4e4e4;
    color: #333333;
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
