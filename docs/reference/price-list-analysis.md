# Price List Australia 2026-05-28 - Complete Data Model Analysis

**File:** `11 Price List Australia 2026-05-28.xlsx`  
**Currency:** AUD (Australian Dollars)  
**Analysis Date:** 2026-08-29  
**Total Sheets:** 9 (all visible, no hidden sheets)

---

## Executive Summary: Data Model

The price list is structured as a **multi-product catalog** with:
- **Base machines** organized into product families (M-series, L-series, Punchline, etc.)
- **Options/Add-ons** that can be combined with machines
- **Volume pricing structure** supporting 1st, 2nd, and 3rd machine discounts
- **Cross-sheet formulas** linking component prices to a master Order summary sheet
- **Currency:** All prices in AUD, no currency conversion

### Key Findings
- **Pricing:** End-user list prices (marked "Ex-Works" on L-Series)
- **Discount:** Sheet Order shows 8.97% discount rate in cell J25
- **Formula-driven:** Quantities × Unit Price = Totals; Order sheet aggregates by pulling from each product sheet
- **Merged cells:** Minimal structural use (headers, section labels)
- **Missing price:** M3390 (3cm 390cm machine) has no price in Row 7

---

## Sheet Inventory & Structure

| Sheet Name | Dimensions | Purpose | Data Type |
|---|---|---|---|
| **Order** | B1:L25 | Master order summary, aggregates from all sheets | Formulas + subtotals |
| **M-series** | B2:L68 | Base machines (M-series) + 40 options | Machines + options |
| **L-Series** | B2:L44 | Base machines (L-series) + 20 options | Machines + options |
| **Punchline** | A2:L9 | Punchline perforators + crate | Machines + accessory |
| **Software** | A2:K21 | Standalone software products | Software only |
| **Leather Nesting System** | A2:K13 | Camera-based nesting systems | Machines (formulas for pricing) |
| **EasyLoader** | A2:L32 | Feed system components, 2 widths | Components grouped by size |
| **EasyFeeder** | A3:S20 | Feeder system alternatives, 3 widths | Machines only |
| **FabricPro** | B2:P14 | Automatic fabric spreader + options | Machine + optional components |

---

## Detailed Product Catalog with All Prices

### M-SERIES MACHINES & OPTIONS
**Sheet:** M-series (Rows 5-51)

#### Base Machines (Computer-controlled cutting)
- **M3180** | AUD 175,000 | 3cm compressed lay, 180cm width
- **M3220** | AUD 188,000 | 3cm compressed lay, 227cm width
- **M3390** | *TBD* | 3cm compressed lay, 390cm width ⚠️ *MISSING PRICE*
- **M5180** | AUD 195,000 | 5cm compressed lay, 180cm width
- **M5220** | AUD 208,000 | 5cm compressed lay, 227cm width
- **M5390** | AUD 245,000 | 5cm compressed lay, 390cm width
- **M7180** | AUD 207,500 | 7cm compressed lay, 180cm width
- **M7220** | AUD 220,500 | 7cm compressed lay, 227cm width
- **M7390** | AUD 257,000 | 7cm compressed lay, 390cm width
- **M10180** | AUD 212,500 | 10cm compressed lay, 180cm width
- **M10220** | AUD 225,500 | 10cm compressed lay, 227cm width
- **M10390** | AUD 262,000 | 10cm compressed lay, 390cm width

#### M-Series Options/Add-ons
| Code | Price | Description |
|---|---|---|
| MTS | 15,000 | Machine Transfer System (not for Mx390) |
| MTS (additional) | 585/m | Additional travel per metre |
| VRB-180 | 4,100 | Vacuum Resealing Blind 180cm |
| VRB-200 | 4,200 | Vacuum Resealing Blind 200cm |
| VRB-220 | 4,300 | Vacuum Resealing Blind 220cm |
| EXH | 1,000 | Exhaust option (vertical outlet) |
| APM | 15,000 | Adaptive Pattern Matching (requires HDC) |
| Waste Bin-180 | 963 | For Mx180 only |
| IKA | 3,800 | IceKnife - Air cooling |
| IKP | 4,940 | IceKnife - Liquid cooling (not with Alternating Sharpener) |
| PRM | 5,000 | Production Manager software |
| OFD | 3,200 | Offload Display |
| OFJ | 7,200 | Offload Projector (Mx180 & Mx220 only) |
| OFP | 3,900 | Offload Printer (sync with PathCut & OFD) |
| BED | 10,000 | Bed Projector |
| HDC | 5,000 | HeadCam (cutting head camera) |
| DR2 | 6,200 | Secondary Drill Unit |
| BCR | 2,500 | Barcode Scanner |
| DRG-1 | 2,535 | Drag Knife (Olfa blade #380010, 45°) |
| DRG-2 | 2,496 | Drag Knife (Excellite blade #380011, 21°) |
| DRG-3 | 2,496 | Drag Knife (carbide #380012, 45°) |
| ABR | 1,950 | Air Brush with reservoir |
| MRK | 1,950 | Marking tool (Bic pen) |
| IJP | 6,552 | Ink Jet Printer (standard Black HP45) |
| HFV | 4,400 | High Flow Vacuum system 22KW |
| AFP | 1,560 | Automatic Foot Pressure (2 settings) |
| EDS-500 | 850 | Edge sealer Static 500mm (trimmable) |
| EDS-800 | 950 | Edge sealer Static 800mm (trimmable) |
| PTW | 3,500 | PathWorks integrated software |
| PM | 2,786 | Pattern Match spotlight software |
| FM180 | 16,000 | Fabric Master spreading machine (to 1800mm) |
| DMT | 18,240 | Ductmaster (board up to 30mm, 10 tools) |
| Crate | 3,000 | Wooden crate (shipping) |
| Drills 2301071-7-6 | 350 | Included drills (part #) |
| Drills 2301071-7-10 | 375 | Included drills (part #) |

---

### L-SERIES MACHINES & OPTIONS
**Sheet:** L-Series (Rows 5-42, Note: "Maximum discount allowed is 10%" - Row 2)

#### Base Machines (Conveyorised CNC)
| Code | Price | Description |
|---|---|---|
| L-180 | 135,000 | Single/low ply conveyor, 180cm |
| L-220 | 150,000 | Single/low ply conveyor, 226cm |
| L-320 | 170,000 | Single/low ply conveyor, 320cm |
| L-180F | 130,000 | Single/low ply conveyor, 180cm (F-variant) |
| L-220F | 145,000 | Single/low ply conveyor, 226cm (F-variant) |
| L-320F | 165,000 | Single/low ply conveyor, 320cm (F-variant) |

#### L-Series Options/Add-ons
| Code | Price | Description |
|---|---|---|
| 180-E | 6,000 | Extended length for L-180 |
| 220-E | 8,000 | Extended length for L-220 |
| 320-E | 12,000 | Extended length for L-320 |
| PM | 1,500 | Pattern Match spotlight software |
| APM | 8,000 | Adaptive Pattern Matching (requires HDC) |
| PRM | 2,620 | Production Manager software |
| PRA | 2,200 | Production Analyst (remote manipulation) |
| OFD | 1,400 | Offload Display |
| HDC | 2,000 | HeadCam (cutting head camera) |
| OFP | 2,250 | Offload Printer |
| BCR | 1,050 | Barcode Scanner |
| ABR | 2,100 | Air Brush |
| PTW | 3,500 | PathWorks software |
| HFV | 16,000 | High Flow Vacuum (3-phase power required) |
| JetPen | 7,500 | JetPen Marking Tool |
| Round Knife 28mm | 580 | Quick release (not for Felt) |
| Round Knife 40mm | 630 | Quick release (not available yet) |
| Drag Knife (carbide 1.0×7mm) | 730 | Quick release variant 1 |
| Drag Knife (carbide 1.0×7mm) | 730 | Quick release variant 2 |
| Punch Tool (hollow 1-5mm) | 450 | Quick release |
| Notch Tool (carbide 1.0×7mm) | 950 | Quick release |
| Driven - Octagonal 28mm | 6,400 | Electrically driven |
| Punch 1.0mm | 100 | Individual tool |
| Punch 2.0mm | 100 | Individual tool |
| Punch 3.0mm | 100 | Individual tool (row 35) |
| Punch 3.0mm | 100 | Individual tool (row 36) |
| Punch 4.0mm | 100 | Individual tool |
| Punch 5.0mm | 100 | Individual tool |
| Crate-180 | 1,200 | Transport crate 180 |
| Crate-220 | 1,500 | Transport crate 220 |
| Crate-320 | 1,800 | Transport crate 320 |

---

### PUNCHLINE
**Sheet:** Punchline (Rows 6-8)

| Code | Price | Description |
|---|---|---|
| P-180 | 10,660 | Automatic paper perforator, width to 1880mm |
| P-220 | 11,310 | Automatic paper perforator, width to 2420mm |
| Crate | 600 | Wooden transport box |

*Note: "Only sold to existing Pathfinder K or M series user"*

---

### SOFTWARE PRODUCTS
**Sheet:** Software (Rows 5-17)

| Code | Price | Description |
|---|---|---|
| PTW(S) | 4,000 | PathWorks Standalone (pattern creation, piece share) |
| PDG | 1,800 | PhotoDigitiser (digitizing photo patterns) |
| WPL | 5,850 | PoolLiner Wizard (flat shape creation from 3D) |
| ANT-V5 | 8,320 | Automatic Nester V5 |
| ANT-V6 | 11,720 | Automatic Nester V6 (faster, higher algorithm) |
| WPN | 500 | Panel Wizard (panel creation + tool path) |
| PTN | 20,577 | Photo Nesting (option only, no hardware/ANT) |
| EDG | 1,114 | External Digitizer connectivity |
| PRA | 3,500 | Production Analyst (remote production control) |
| LS Convert | *TBD* | LS Convert software (dongle protected) |

*Row 17 shows LS Convert with "End User Price AUD" label but no numeric price*

---

### LEATHER NESTING SYSTEM (Camera-based)
**Sheet:** Leather Nesting System (Rows 5, 9, 13)

| Code | Price | Description |
|---|---|---|
| LNS-2020 | 36,712 | Camera nesting system (operator console + utilities) |
| LNS-2420 | *(formula: =E5×1.05)* | Camera nesting system, +5% markup on LNS-2020 |
| LNS-3220 | *(formula: =E9×1.05)* | Camera nesting system, +5% markup on LNS-2420 |

*Row 9 & 13 use formulas to calculate pricing at 105% of previous model*

---

### EASYLOADER - Feed System Components
**Sheet:** EasyLoader (Rows 7-14 and 21-28)

#### EasyLoader-2020 (for FM180/FabricPro-180)
| Component | Price |
|---|---|
| Drive Module (first 1.2M) | 4,050 |
| Additional 1.2M lengths | 1,200 |
| Static table 1.2M lengths | 743 |
| Electrical Busbar per 1.2M (FabricPro spreader) | 120 |
| Travel Platform support rail per 1.2m | 45 |
| Single Roll feed attachment | 735 |
| Synchronisation Feature (sync with cutter) | 1,500 |
| ST620-2020 Roll Holder (perforated underlay) | 1,040 |

#### EasyLoader-2420 (for FM220/FabricPro-220)
| Component | Price |
|---|---|
| Drive Module (first 1.2M) | 4,455 |
| Additional 1.2M lengths | 1,320 |
| Static table 1.2M lengths | 780 |
| Electrical Busbar per 1.2M (FabricPro spreader) | 120 |
| Travel Platform support rail per 1.2m | 45 |
| Single Roll feed attachment | 780 |
| Synchronisation Feature (sync with cutter) | 1,500 |
| ST620-2420 Roll Holder (perforated underlay) | 1,080 |

*Note: Row 32 refers to "John Hollo" for additional specs*

---

### EASYFEEDER - Feeder Systems
**Sheet:** EasyFeeder (Rows 8, 10, 12)

| Code | Price | Description |
|---|---|---|
| EasyFeeder-2020 | 10,400 | 1200m length, sync with M & L series, electric |
| EasyFeeder-2420 | 10,860 | 1200m length, sync with M & L series, electric |
| EasyFeeder-4030 | 17,540 | 1200m length, sync with M & L series, electric |

---

### FABRICPRO - Automatic Fabric Spreader
**Sheet:** FabricPro (Rows 7-10)

| Code | Price | Description |
|---|---|---|
| FP-180 | 64,000 | Automatic spreader, max width 180cm |
| FP-220 | 67,000 | Automatic spreader, max width 220cm |
| TPL | 0 | Travelling operator Platform (standard equipment) |
| Crate | 1,200 | Wooden transport crate |

**Notes from sheet:**
- Table width is 220mm wider than FabricPro capacity
- Additional fabric feeding options to be added later
- Effective spreading length is 2.4m less than table length

---

## Data Structure & Formula Patterns

### Order Sheet (Master Summary)
- **Links:** References all 8 product sheets using formulas
- **Structure:**
  - Columns C-E: 1st, 2nd, 3rd machine full prices (pulled from each sheet)
  - Column F: Total sum
  - Columns I-K: Discount prices (Qty × Price × (1 - Discount Rate))
  - Column L: Discount total
  - Cell J25: Discount rate = 8.97%
  - Merged cells: C1:E1 (header), I1:K1 (header)

### Product Sheets (M-series, L-Series, etc.)
- **Pattern:** 
  - Column B: Machine/Option code
  - Column C: Sub-category (usually empty for base machines)
  - Column D-E: Description
  - Column F: Unit price (End User Price AUD)
  - Columns G-L: Qty inputs and calculated totals (=Unit Price × Qty)
  - **Merged headers:** G3:H3, I3:J3, K3:L3 (1st/2nd/3rd machine labels)

### Pricing Models
1. **Fixed price:** Most products (numeric value in F column)
2. **Formula price:** LNS models use `=previous_price × 1.05`
3. **Per-metre pricing:** MTS travel = 585/metre
4. **Bundled:** EasyLoader components sold separately
5. **Optional at zero:** TPL (Travelling Platform) = 0 (included)

---

## Notable Features & Data Issues

### ✓ Strengths
- Well-organized hierarchical structure (machines → options)
- Clear volume pricing (1st/2nd/3rd discount levels)
- Consistent formula pattern across sheets
- Cross-sheet references ensure data consistency
- Descriptive product names with technical specs

### ⚠️ Issues & Anomalies
1. **Missing Price:** M3390 (Row 7, M-series) has no price → *TBD*
2. **Missing Price:** LS Convert (Row 17, Software) shows label but no price
3. **Formula-based Pricing:** LNS-2420 and LNS-3220 use formulas instead of fixed values
  - LNS-2420 = LNS-2020 × 1.05 = 36,712 × 1.05 = 38,547.60
  - LNS-3220 = LNS-2420 × 1.05 = 38,547.60 × 1.05 = 40,475 (approx)
4. **Duplicate Descriptions:** Several L-Series accessories (Punch 3.0mm appears twice at rows 35-36)
5. **Tool References:** Multiple punch/knife variants lack clear distinguishing code names
6. **Incomplete L-Series Descriptions:** Most L-Series products have descriptions truncated or missing
7. **Merged Cell Complexity:** Multiple merged ranges create structural dependencies
8. **Discount Hardcoded:** L-Series shows "Maximum discount allowed is 10%" but M-series uses 8.97% in Order sheet

### Data Quality Notes
- **Descriptions:** Helpful but inconsistent formatting and truncation
- **Comments embedded:** Some descriptions contain internal notes ("Do we eliminate this?" on Waste Bin-180)
- **Precision:** Prices are integers (no cents); discount is 8-decimal float
- **Volume Assumption:** Sheets support 3-machine pricing; no indication of bulk tiers beyond 3 units

---

## Database Schema Implications

### Recommended Entity Structure
```
MACHINES
  - machine_id (PK)
  - machine_code (unique, e.g., "M3180")
  - machine_family (e.g., "M-series", "L-series", "Punchline")
  - description (text)
  - base_price_aud (decimal)
  - price_date (2026-05-28)
  - status (active/discontinued) [not in file]

OPTIONS (Add-ons/Accessories)
  - option_id (PK)
  - option_code (unique, e.g., "APM", "VRB-180")
  - option_family (e.g., "Software", "Vacuum", "Accessories")
  - description (text)
  - base_price_aud (decimal)
  - per_unit_measure (e.g., "each", "per_metre")
  - applicable_machines (relation or constraint) [notes in descriptions only]
  - price_date (2026-05-28)

PRICING_VOLUME
  - pricing_id (PK)
  - machine_id (FK)
  - tier_order (1, 2, 3)
  - discount_rate (decimal, e.g., 0.0897)
  - effective_price (calculated or stored)
  - price_date (2026-05-28)

COMPATIBILITY
  - machine_id (FK to MACHINES)
  - option_id (FK to OPTIONS)
  - compatible (boolean)
  - notes (e.g., "Not for Mx390", "Requires HDC")
```

### Key Assumptions for Schema Design
1. **Price date:** Use 2026-05-28 as snapshot date; versioning recommended for future updates
2. **Compatibility matrix:** Option-to-machine relationships are NOT explicitly mapped; infer from descriptions
3. **Multi-currency support:** Currently AUD only; add currency column if needed
4. **Discount tiers:** Support variable tier counts (currently fixed at 1st/2nd/3rd)
5. **Component bundling:** EasyLoader components can be sold individually; track sub-assemblies separately

---

## Summary Statistics

| Metric | Count |
|---|---|
| Total Product Sheets | 8 |
| Base Machines | 23 |
| Options/Add-ons | 60+ |
| Software Products | 10 |
| Unique Price Points | 80+ |
| Missing/TBD Prices | 2 |
| Formula-based Prices | 2 |
| Total Rows with Data | ~250 |
| Cross-sheet Formula Links | 71+ |
| Merged Cell Ranges | 20+ |

---

## File Metadata
- **File Size:** Excel workbook (.xlsx)
- **Sheet Visibility:** All 9 sheets visible
- **Protection:** None detected
- **Last Modified:** Date embedded in filename: 2026-05-28
- **Formulas:** Heavy use of `=+CellRef*CellRef` pattern and sum functions
- **Regional Format:** Implied AUD pricing; date format not specified
