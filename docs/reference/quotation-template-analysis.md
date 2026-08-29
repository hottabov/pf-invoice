# Quotation Template Analysis (AAAM Series Australian Sale Template02.doc)

Source: `RAW/AAAM Series Australian Sale Template02 (1).doc`. Red text in the document marks variables that must be auto-filled by PathQuote.

## Document structure (in order)

1. Header: quotation number, date, "Prepared for" (client block), "Prepared by" (salesperson block)
2. Pathfinder M-XXX Cutting System — main machine with included accessories and bundled software (Windows 10, PathCut v12.x)
3. Options (included) — per-option description blocks
4. PathWorks (I) — integrated software + 4 sub-options
5. PathWorks (S) — standalone software + 4 sub-options
6. Fabric Master (FM-XXX) — semi-automatic spreader
7. Fabric Pro (FP-XXX) — fully automatic spreader
8. Spreading Table – Modular
9. Easy-Loader #1
10. Punchline P-180/P-220
11. Terms & Conditions (7 sections: Delivery 14 wks / Installation ~2 days / Training ~3 days / Customer responsibilities / 12-mo warranty / RSP / Payment 30-70, GST excluded, EFT details)
12. TOTAL (AUD) + signature block
13. General Conditions of Sale — 14 numbered clauses
14. Remote Support Program (RSP) agreement + coverage table (Product | Serial Number | RSP cost p/year | Covered) + RSP signature

## Template variables (red text)

### Client / header
| Variable | Meaning |
|---|---|
| XXXXXX | Quotation number |
| DD-MM-YYYY | Quote date |
| NAME (x2) | Client contact name; salesperson name |
| COMPANY NAME | Client company |
| # STREET, CITY | Client address |
| STATE, POSTCODE, COUNTRY | Client location |
| E: EMAILADDRESS@PATH.COM | Salesperson email |

### Machine
| Variable | Meaning |
|---|---|
| XXX / X-XXX | Machine model/series code |
| $XXX,XXX.X | Base machine price |
| Xcm | Max compressed cutting height |
| XXXcm | Max material width |

### Option blocks (each has a code + full description paragraph)
OFD, OFP, MTS (with X metres / X tables), IKA, DRG, PM, APM, HDC, PRM, PRA, BCR, MRK, ABR, DR2, HFV, RSP, AFP

### Software
PathWorks (I), PathWorks (S); sub-options: WPN (Panel Wizard), WPN (Pool Wizard), PDG (PhotoDigitizer), ANT (Automatic Nesting)

### Spreading / other equipment
FM-XXX, FP-XXX, Spreading Table quantity (X) and total length (XX m), Easy-Loader width (X mtr), width options 2020mm/2420mm, Punchline P-180/P-220 with paper width 1880mm/2280mm

### Pricing / misc
- `$ ???` (x2) — Year-2 RSP cost fields
- Company name in signature authority block
- Editorial note found in template: "1 x moving fabric catcher REMOVE THIS"

## Static company data (in template)

- Pathfinder Australia Pty Ltd, 12 Did Ct, Tullamarine Vic. 3043, ABN 64 072 458 667
- Bank: ANZ Westfield, Account: Pathfinder Australia Pty Ltd, SWIFT ANZBAU3M, BSB 013 442, Acc 4405 63886
- Support: support@pathfindercut.com, AEST 8:30–17:00 Mon–Fri

## Implications for PathQuote

- Extended quotation = header + machine spec block + description blocks for each selected option + software blocks + T&C + General Conditions + RSP section. All description blocks live in DB (`content_blocks`) and are editable per region.
- Some option blocks contain their own inner variables (MTS metres/tables, spreader widths) → option lines need optional attribute fields.
- RSP coverage table needs product + serial number + per-year cost fields on the document.
