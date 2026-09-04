import { formatMoney, isNegativeAmount } from "@/lib/format";
import type { QuotationData } from "@/lib/quotation-data";
import { ItemBreakdownRows } from "@/components/sheet/item-breakdown";

/**
 * The extended quotation sheet (Phase 6): a single, self-contained render of
 * a QUOTE's full content-block-driven detail — cover header, one section per
 * machine/equipment item with its admin-authored description and selected
 * options rendered from markdown, an investment summary table, terms,
 * general conditions, the RSP agreement + coverage table, and signatures.
 * Used by both the `/documents/[documentId]/quotation` preview route and,
 * via src/lib/pdf.ts's `renderQuotationHtml`, the quotation PDF pipeline —
 * that second consumer is why this file is deliberately NOT a normal app
 * component: no Tailwind classes (Gotenberg's headless Chromium never sees
 * this app's compiled stylesheet — only whatever HTML string is actually
 * posted to it), no data fetching, no `async`, everything this markup needs
 * lives in the one embedded `<style>` block below.
 *
 * It receives an already-fully-assembled `QuotationData` — see
 * `buildQuotationData` in src/lib/quotation-data.ts, the pure assembler that
 * resolves content blocks, substitutes `{{placeholders}}`, and renders each
 * body to HTML via `renderStoredRichText` (src/lib/rich-text.ts) — and does
 * no further data work of its own, just JSX. Every block body reaches this
 * component as trusted, already-sanitized HTML (`renderStoredRichText`
 * either sanitizes already-HTML content through an allowlist, or runs
 * legacy markdown through `renderMarkdown`, which HTML-escapes its input
 * before any markdown transform runs), so `dangerouslySetInnerHTML` here is
 * safe by construction.
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
                  // entityAddress is a single free-text Region field that may
                  // carry embedded newlines (street / city+postcode / phone /
                  // email / web, one per line) -- split rather than a single
                  // <div> so each line actually breaks instead of the "\n"
                  // rendering as a literal character.
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
                <span className="pq-meta-label">Price valid until</span> {data.validityDate}
              </div>
            ) : null}
          </div>
        </div>

        {/* Header client block (owner reference doc: "Prepared for: <contact,
            company, address>" / "Prepared by: <manager name / phone>,
            <email>") — two columns, the client's own info relabeled
            "Prepared for" alongside a new "Prepared by" column for the
            document's author. `preparedBy` is always present (every
            document has an author), so the row always renders even for a
            not-yet-client-assigned draft. */}
        <div className="pq-prepared-row">
          {data.client ? (
            <div className="pq-client">
              <div className="pq-client-label">Prepared for</div>
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
          <div className="pq-client pq-prepared-by-client">
            <div>
              <div className="pq-client-label">Prepared by</div>
              <div className="pq-client-name">{data.preparedBy.name ?? data.preparedBy.email}</div>
              {data.preparedBy.phone ? <div className="pq-client-line">{data.preparedBy.phone}</div> : null}
              {data.preparedBy.name ? <div className="pq-client-line">{data.preparedBy.email}</div> : null}
            </div>
            {data.preparedBy.avatar ? (
              // Plain <img>, not next/image — same reasoning as the logo
              // above: this markup is also posted to Gotenberg as a raw
              // HTML string. No initials fallback here (unlike the in-app
              // `Avatar` component) — a customer-facing quote either shows
              // the real photo or none at all, and nothing reserves the
              // space when there's no photo.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.preparedBy.avatar} alt="" className="pq-prepared-by-avatar" />
            ) : null}
          </div>
        </div>

        {/* Delivery address — its own full-width row under "Prepared
            for"/"Prepared by" (owner: "client office is not always the
            manufacturing site"), only when the company actually has one
            distinct from its main address. */}
        {data.delivery ? (
          <div className="pq-delivery-row">
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
            {totals.deliveryTerms === "EX_WORKS"
              ? `(Ex Works — no ${totals.taxName} applicable)`
              : `(incl. ${totals.taxName} ${totals.taxRate}%)`}
          </span>
          {/* Repeats the header's expiry right next to the price it applies
              to (owner: "put the valid-to in this total investment line, so
              it's obvious"). Deliberately larger and full white rather than
              the muted note colour beside it — it is the line that gives the
              reader a reason to decide now, so it has to survive a glance at
              a printed page. */}
          {data.validityDate ? (
            <span className="pq-total-banner-validity">Price valid until {data.validityDate}</span>
          ) : null}
        </div>

        {data.machineSections.length > 0 ? (
          <section className="pq-section">
            <h1 className="pq-section-title">Equipment Detail</h1>
            {data.machineSections.map((section) => (
              <div className="pq-machine-section" key={section.itemId}>
                {/* Title/spec + product photo are one page-break-avoidance
                    unit (owner: images normally run full width right after
                    the product title) — the options table that follows is
                    outside this group since a long options table can
                    legitimately spill onto the next page even when the
                    title+image pair itself must not split (each row still
                    avoids splitting on its own — see .pq-options-table td). */}
                <div className="pq-title-image-group">
                  {/* Section heading — ALWAYS rendered, one consistent tier
                      for every machine/equipment/software item, whether or
                      not a content block matched (see
                      src/lib/quotation-data.ts's `sectionTitle` — this used
                      to be missing entirely for Easy-Loader/Fabric
                      Pro/PathWorks sections, whose content blocks never
                      carried an inline "##" heading the way machine.m-series
                      happened to). Item code always follows as a muted mono
                      suffix, matching the investment summary's item-name
                      styling. */}
                  <h2 className="pq-product-title">
                    {section.sectionTitle} <span className="pq-item-code">{section.lineSummary.code}</span>
                  </h2>
                  {/* Structural section price (owner: EL-2020/PTW(I)/FP-180
                      sections showed no price at all because their content
                      blocks never carried an inline "Price: {{price}}" line
                      the way machine.m-series's did) — printed for EVERY
                      section, blocked or not, EXCEPT one whose matched block
                      already prints its own inline price line
                      (`hasInlinePrice`), which would otherwise double up. */}
                  {section.sectionPrice && !section.hasInlinePrice ? (
                    <div className="pq-section-price">Price: {section.sectionPrice}</div>
                  ) : null}
                  {section.titleBlockHtml ? (
                    <div className="pq-block-body" dangerouslySetInnerHTML={{ __html: section.titleBlockHtml }} />
                  ) : (
                    // No admin-authored content block matched this item's
                    // product (e.g. L-Series has none — see
                    // src/lib/quotation-data.ts's `productBlockKey`) — render
                    // a minimal auto-generated spec line underneath the
                    // heading/price above instead of just leaving the
                    // section bare.
                    <div className="pq-block-missing pq-auto-summary">
                      {section.specSentence ? (
                        <div className="pq-auto-summary-spec">{section.specSentence}</div>
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
                {/* Rendered for every machine, not just one carrying
                    options: the first row is the machine itself, so the
                    table is never empty and the customer reads the product
                    and its base price before what was added to it. */}
                <table className="pq-options-table">
                    <colgroup>
                      <col className="pq-opt-col-icon" />
                      <col className="pq-opt-col-option" />
                      <col className="pq-opt-col-qty" />
                      {optionPriceVisible ? <col className="pq-opt-col-price" /> : null}
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="pq-opt-col-icon" aria-hidden="true" />
                        <th className="pq-opt-col-option">Included options</th>
                        <th className="pq-opt-col-qty">Qty</th>
                        {optionPriceVisible ? <th className="pq-opt-col-price">Price</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="pq-option-row pq-base-row">
                        <td className="pq-opt-col-icon" />
                        <td className="pq-opt-col-option">
                          <div className="pq-option-name">
                            {section.baseRow.code ? (
                              <span className="pq-option-code">{section.baseRow.code} — </span>
                            ) : null}
                            {section.baseRow.name}
                          </div>
                        </td>
                        <td className="pq-opt-col-qty">× {section.baseRow.qty}</td>
                        {optionPriceVisible ? (
                          <td className="pq-opt-col-price">{section.baseRow.price}</td>
                        ) : null}
                      </tr>
                      {section.optionRows.map((option) => (
                        <tr className="pq-option-row" key={option.id}>
                          <td className="pq-opt-col-icon">
                            {option.icon ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={option.icon} alt="" className="pq-option-icon" />
                            ) : null}
                          </td>
                          <td className="pq-opt-col-option">
                            <div className="pq-option-name">
                              {option.code ? <span className="pq-option-code">{option.code} — </span> : null}
                              {option.name}
                            </div>
                            {option.descriptionHtml ? (
                              <div
                                className="pq-option-desc pq-block-body"
                                dangerouslySetInnerHTML={{ __html: option.descriptionHtml }}
                              />
                            ) : null}
                            {option.attributesLine ? (
                              <div className="pq-option-attrs">{option.attributesLine}</div>
                            ) : null}
                          </td>
                          <td className="pq-opt-col-qty">× {option.qty}</td>
                          {optionPriceVisible ? (
                            <td className="pq-opt-col-price">{option.price}</td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
              </div>
            ))}
          </section>
        ) : null}

        {/* Free-text notes (Document.notes, admin-authored markdown — see
            the builder's Notes section / setDocumentNotes) — after the
            equipment write-up, before the Investment Summary, same
            placement the reference template gives freeform quote remarks. */}
        {data.notesHtml ? (
          <section className="pq-section">
            <h1 className="pq-section-title">Notes</h1>
            <div className="pq-flow-block pq-block-body" dangerouslySetInnerHTML={{ __html: data.notesHtml }} />
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
                <th className="pq-col-qty">Qty</th>
                <th className="pq-col-amount">Price</th>
              </tr>
            </thead>
            {data.items.map((item) => (
              <tbody className="pq-item-group" key={item.id}>
                <tr className="pq-item-row">
                  <td className="pq-col-item">
                    <div className="pq-item-name">
                      {item.name} <span className="pq-item-code">{item.code}</span>
                    </div>
                    {item.descriptionHtml ? (
                      <div
                        className="pq-item-desc pq-block-body"
                        dangerouslySetInnerHTML={{ __html: item.descriptionHtml }}
                      />
                    ) : null}
                  </td>
                  <td className="pq-col-qty" />
                  <td className="pq-col-amount pq-amount" />
                </tr>
                {/* Base price, options, item discount, per-item subtotal —
                    the shared presenter (see item-breakdown.tsx) so this
                    three-part idea is expressed once, not per sheet. The
                    old lump-sum total here (base + every option) used to
                    read as one confusing number — the base price now always
                    gets its own row. */}
                <ItemBreakdownRows
                  breakdown={item.breakdown}
                  code={item.code}
                  currency={totals.currency}
                  showPrices={itemPriceVisible}
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
            {/* An explicit `0` discount (as opposed to no discount set at
                all, `discountValue === null`) must print nothing — a "Discount
                0%" line invites the customer to haggle for one (owner: "this
                gives the client room to negotiate"). Checking the numeric
                value (not just non-null) is what catches the explicit-zero
                case, for both PERCENT "0" and AMOUNT "0.00". */}
            {totals.discountValue !== null && Number(totals.discountValue) !== 0 ? (
              <div className="pq-totals-row">
                <span>
                  Discount {totals.discountMode === "PERCENT" ? `${totals.discountValue}%` : formatMoney(totals.discountValue, totals.currency)}
                </span>
                <span>-{formatMoney(totals.discountAmount, totals.currency)}</span>
              </div>
            ) : null}
            {totals.deliveryTerms === "EX_WORKS" ? (
              // Same reasoning as the banner note above — no `{taxName} 0%`
              // line, which would read as a mistake rather than the
              // deliberate export-terms choice it is.
              <div className="pq-totals-row">
                <span>Ex Works — no {totals.taxName} applicable</span>
                <span>{formatMoney(totals.taxAmount, totals.currency)}</span>
              </div>
            ) : (
              <div className="pq-totals-row">
                <span>
                  {totals.taxName} {totals.taxRate}%
                </span>
                <span>{formatMoney(totals.taxAmount, totals.currency)}</span>
              </div>
            )}
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
  /* "Prepared for" / "Prepared by" header row (owner reference doc) — two
     columns sharing the same box styling .pq-client always had; the row
     wrapper now carries the top margin that single box used to. */
  .pq-prepared-row {
    display: flex;
    gap: 16px;
    margin-top: 18px;
  }
  /* Delivery address row (see the JSX comment above) — same box styling as
     .pq-client, just full-width and stacked below the prepared-for/by row
     instead of sharing its two-column flex. */
  .pq-delivery-row {
    margin-top: 12px;
  }
  .pq-client {
    flex: 1;
    min-width: 0;
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
  /* "Prepared by" photo (see the JSX above) — sits at the right edge of the
     block, opposite the name/phone/email text; only rendered when the
     author has one, and nothing reserves its space otherwise (no
     placeholder, no extra gap). */
  .pq-prepared-by-client {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .pq-prepared-by-avatar {
    width: 100px;
    height: 100px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
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
  /* The expiry sits on the dark banner beside the muted "(incl. GST)" note,
     but is not a footnote — it carries the deadline, so it gets full white
     and its own weight. Pushed to the end of the flex row so it reads as a
     statement of its own rather than a continuation of the tax note. */
  .pq-total-banner-validity {
    margin-left: auto;
    font-size: 13px;
    font-weight: 700;
    color: #ffffff;
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
     blocks) is the page-break-avoidance unit, same idea as .pq-item-group
     below for the investment summary table — "where reasonable" per the
     plan, since a very long write-up can still legitimately span a page in
     Chromium's printed output. */
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
  /* Unified options table (owner: "table with small icons — more control
     than a list") — one row per selected OPTION line, whether or not its
     code matched an option.* content block (see QuotationOptionRow), so a
     block-rendered option and an unmatched one finally share one consistent
     look instead of drifting (prose paragraphs vs. bold indented bullets). */
  .pq-options-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    margin-top: 10px;
  }
  .pq-opt-col-icon {
    width: 34px;
  }
  .pq-opt-col-option {
    width: auto;
  }
  .pq-opt-col-qty {
    width: 50px;
    text-align: center;
  }
  .pq-opt-col-price {
    width: 70px;
    text-align: right;
  }
  .pq-options-table thead th {
    text-align: left;
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #888888;
    border-bottom: 1px solid #d8dcec;
    padding: 4px;
  }
  .pq-options-table thead th.pq-opt-col-qty {
    text-align: center;
  }
  .pq-options-table thead th.pq-opt-col-price {
    text-align: right;
  }
  .pq-options-table td {
    padding: 5px 4px;
    vertical-align: top;
    border-bottom: 1px solid #eeeeee;
    /* One option row is a page-break-avoidance unit of its own (a table row
       can't itself declare avoid in all print engines, but Chromium honours
       it on the row) — a short icon+name+description group should never
       split across a page boundary. */
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .pq-options-table tbody tr:last-child td {
    border-bottom: none;
  }
  .pq-option-icon {
    display: block;
    width: 24px;
    height: 24px;
    object-fit: contain;
  }
  .pq-option-name {
    font-weight: 700;
    color: #2b304f;
  }
  .pq-option-code {
    font-family: "Courier New", Courier, monospace;
    font-weight: 400;
    color: #888888;
  }
  /* The machine's own row heads its options table. A heavier rule underneath
     separates the product from what was added to it, so the list reads as
     "this, plus these" rather than as one flat run of options. */
  .pq-base-row td {
    border-bottom: 1px solid #d5d8e4 !important;
  }
  .pq-base-row .pq-opt-col-price {
    font-weight: 700;
  }
  .pq-option-desc {
    margin-top: 2px;
    color: #666666;
    font-size: 9.5px;
  }
  .pq-option-desc.pq-block-body p {
    margin: 0 0 4px 0;
  }
  .pq-option-desc.pq-block-body p:last-child {
    margin-bottom: 0;
  }
  .pq-option-attrs {
    margin-top: 2px;
    color: #888888;
    font-size: 9px;
  }
  .pq-opt-col-qty {
    color: #555555;
  }
  .pq-block-missing {
    color: #333333;
  }
  /* Section heading — one consistent tier for EVERY machine/equipment/
     software/service section (owner: "every item section must have a
     consistent prominent heading"), rendered explicitly outside the
     admin-authored block body rather than relying on that body carrying its
     own markdown heading (fragile — most content blocks never did; see
     src/lib/quotation-data.ts's sectionTitle computation). Same size/weight/color tier
     as .pq-block-body h1/h2 and .pq-section-title, so a product/section name
     is unmistakable at a glance. */
  .pq-product-title {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.3px;
    color: #243478;
    margin: 0 0 6px 0;
    page-break-after: avoid;
    break-after: avoid;
  }
  /* Structural section price row (owner: every item section must show its
     price) — same tier every section gets, right under the heading,
     regardless of whether a content block matched (see
     src/lib/quotation-data.ts's sectionPrice/hasInlinePrice). */
  .pq-section-price {
    margin: 0 0 6px 0;
    color: #243478;
    font-weight: 700;
  }
  .pq-auto-summary-spec {
    margin-top: 4px;
    color: #444444;
    font-weight: 400;
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
  .pq-item-desc.pq-block-body p {
    margin: 0 0 4px 0;
  }
  .pq-item-desc.pq-block-body p:last-child {
    margin-bottom: 0;
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
  /* Per-item subtotal row (base + options, less the item discount — owner:
     "base price per item + options listed, totals at bottom" replacing the
     old lump-sum item-row amount) — small and muted, distinct from both the
     plain option rows above it and the document-level totals block below
     the table. */
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
