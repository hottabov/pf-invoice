import { describe, it, expect, beforeAll } from 'vitest';
import catalogData from '../prisma/seed-data/catalog.json';

interface CatalogItem {
  code: string;
  name: string;
  description: string;
  price: number | null;
  needsReview: boolean;
}

interface GlobalOption extends CatalogItem {
  compatibleSeries: string[];
  compatibleProducts?: string[];
}

interface Series {
  seriesCode: string;
  seriesName: string;
  maxDiscountPct: number | null;
  products: CatalogItem[];
}

interface Catalog {
  extractedAt: string;
  series: Series[];
  options: GlobalOption[];
}

const catalog = catalogData as Catalog;

describe('Catalog Extraction Validation', () => {
  let mSeries: Series;
  let xcSeries: Series;
  let lSeries: Series;
  let pSeries: Series;
  let allItems: CatalogItem[];

  beforeAll(() => {
    mSeries = catalog.series.find((s) => s.seriesCode === 'M')!;
    xcSeries = catalog.series.find((s) => s.seriesCode === 'X')!;
    lSeries = catalog.series.find((s) => s.seriesCode === 'L')!;
    pSeries = catalog.series.find((s) => s.seriesCode === 'P')!;

    // Collect all items (products from every series, plus the global options)
    allItems = [];
    catalog.series.forEach((series) => {
      allItems.push(...series.products);
    });
    allItems.push(...catalog.options);
  });

  describe('Series Structure', () => {
    // 10 series: the original 9 plus "SVC" (Service) -- a hand-authored
    // series with no sheet of its own, added for the new "SERVICE" container
    // product and its SVC-* service options (see MANUAL_PRODUCTS.SVC and
    // MANUAL_OPTIONS in scripts/extract-catalog.ts).
    it('should have exactly 10 series', () => {
      expect(catalog.series).toHaveLength(10);
    });

    // 64 -> 67: the single width-less "HDRF" product was split into three
    // width variants (HDRF-180/220/320, net +2 -- owner decision, see
    // MANUAL_PRODUCTS.EF), and the new "SERVICE" container product was added
    // (+1, see MANUAL_PRODUCTS.SVC). See that file's header comments for the
    // full history of how 64 itself was reached (10 NA-only additions).
    it('should have exactly 67 total products across all series', () => {
      const totalProducts = catalog.series.reduce((sum, series) => sum + series.products.length, 0);
      expect(totalProducts).toBe(67);
    });

    it('M series should have 16 products (12 original + NA-only M3300/M5300/M7300/M10300)', () => {
      expect(mSeries.products).toHaveLength(16);
    });

    it('L series maxDiscountPct should be 10', () => {
      expect(lSeries.maxDiscountPct).toBe(10);
    });

    // EasyLoader/EasyFeeder/Software were originally misclassified as
    // options-only sheets (0 products each), which made their machines and
    // software modules impossible to add to a document. Re-verified against
    // the source sheets and reclassified -- see scripts/extract-catalog.ts.
    it('EasyLoader (EL) should have 4 products (2020/2420 + NA-only 3220/4030 drive modules)', () => {
      const el = catalog.series.find((s) => s.seriesCode === 'EL')!;
      expect(el.products).toHaveLength(4);
    });

    // 5 -> 7: the single "HDRF" product was replaced by three width variants
    // (HDRF-180/220/320) -- see MANUAL_PRODUCTS.EF in scripts/extract-catalog.ts.
    it('EasyFeeder (EF) should have 7 products (2020/2420/4030 + NA-only EF-3220 + manual HDRF-180/220/320)', () => {
      const ef = catalog.series.find((s) => s.seriesCode === 'EF')!;
      expect(ef.products).toHaveLength(7);
      expect(ef.products.map((p) => p.code).sort()).toEqual(
        ['EF-2020', 'EF-2420', 'EF-3220', 'EF-4030', 'HDRF-180', 'HDRF-220', 'HDRF-320'].sort()
      );
    });

    it('FabricPro (FP) should have 4 products (FP-180/FP-220 + manual FP-TROLLEY + NA-only FP-300)', () => {
      const fp = catalog.series.find((s) => s.seriesCode === 'FP')!;
      expect(fp.products).toHaveLength(4);
    });

    it('Software (SW) should have 11 products (10 original + NA-only PTW(I))', () => {
      const sw = catalog.series.find((s) => s.seriesCode === 'SW')!;
      expect(sw.products).toHaveLength(11);
    });

    // New hand-authored series (see MANUAL_PRODUCTS.SVC in
    // scripts/extract-catalog.ts) -- a container product for the SVC-*
    // service options, not sold on its own (price 0, needsReview false).
    it('Service (SVC) should have exactly 1 product: "SERVICE"', () => {
      const svc = catalog.series.find((s) => s.seriesCode === 'SVC')!;
      expect(svc).toBeDefined();
      expect(svc.products).toHaveLength(1);
      expect(svc.products[0]).toMatchObject({
        code: 'SERVICE',
        name: 'Service',
        price: 0,
        needsReview: false,
      });
    });
  });

  describe('X and M Series Code Mapping', () => {
    // X is cloned from M-Series' products BEFORE the NA-only M3300/M5300/
    // M7300/M10300 products are appended (see scripts/extract-catalog.ts's
    // main()) -- there's no NA evidence of a matching X-3300-style product
    // (the NA X-series sheet only prices X10180/X10220), so X intentionally
    // stays at its original 12 rather than growing to 16 alongside M.
    it('X series should have 12 products (unaffected by the NA-only M-series widths)', () => {
      expect(xcSeries.products).toHaveLength(12);
    });

    // The X-Calibre *series code* is "X" (renamed from "XC" -- the catalog
    // UI showed "XC" but should read "X"; product codes were already
    // "X-####" before this rename and are unaffected).
    it('X series seriesName should still read "X-Calibre"', () => {
      expect(xcSeries.seriesName).toBe('X-Calibre');
    });

    it('every X product should correspond to an M product of the same spec (X-<code> <-> M<code>)', () => {
      xcSeries.products.forEach((xcProduct) => {
        const expectedMCode = 'M' + xcProduct.code.substring(2);
        const mProduct = mSeries.products.find((p) => p.code === expectedMCode);
        expect(mProduct, `expected M product "${expectedMCode}" for X product "${xcProduct.code}"`).toBeDefined();
      });
    });

    it('every original M product (excluding the NA-only 300cm-width tier) has an X clone', () => {
      const naOnlyMCodes = new Set(['M3300', 'M5300', 'M7300', 'M10300']);
      mSeries.products
        .filter((p) => !naOnlyMCodes.has(p.code))
        .forEach((mProduct) => {
          const expectedXcCode = 'X-' + mProduct.code.substring(1);
          expect(xcSeries.products.some((p) => p.code === expectedXcCode)).toBe(true);
        });
    });
  });

  describe('Spot Price Validation', () => {
    it('M3180 should have price 175000', () => {
      const m3180 = mSeries.products.find((p) => p.code === 'M3180');
      expect(m3180?.price).toBe(175000);
    });

    it('L-180 should have price 135000', () => {
      const l180 = lSeries.products.find((p) => p.code === 'L-180');
      expect(l180?.price).toBe(135000);
    });

    it('P-180 should have price 10660', () => {
      const p180 = pSeries.products.find((p) => p.code === 'P-180');
      expect(p180?.price).toBe(10660);
    });

    it('P-220 should have price 11310', () => {
      const p220 = pSeries.products.find((p) => p.code === 'P-220');
      expect(p220?.price).toBe(11310);
    });

    it('EL-2020 should have price 4050', () => {
      const el = catalog.series.find((s) => s.seriesCode === 'EL')!;
      const el2020 = el.products.find((p) => p.code === 'EL-2020');
      expect(el2020?.price).toBe(4050);
    });

    it('EF-4030 should have price 17540', () => {
      const ef = catalog.series.find((s) => s.seriesCode === 'EF')!;
      const ef4030 = ef.products.find((p) => p.code === 'EF-4030');
      expect(ef4030?.price).toBe(17540);
    });

    it('PTN should have price 20577', () => {
      const sw = catalog.series.find((s) => s.seriesCode === 'SW')!;
      const ptn = sw.products.find((p) => p.code === 'PTN');
      expect(ptn?.price).toBe(20577);
    });
  });

  describe('Price Validation Rules', () => {
    // A price is either a usable positive number, or it's flagged for review
    // (covers both a missing price, e.g. M3390, and a present-but-unusable
    // one, e.g. TPL's genuine 0) -- with one deliberate, documented
    // exception: "SERVICE" (see MANUAL_PRODUCTS.SVC in
    // scripts/extract-catalog.ts) is a container product never sold on its
    // own -- its own price is a real, intentional 0, not a "TBD" gap, so
    // needsReview is false for it specifically.
    it('every item should have a positive price OR be flagged needsReview (except the SERVICE container product)', () => {
      allItems.forEach((item) => {
        if (item.code === 'SERVICE') {
          expect(item.price).toBe(0);
          expect(item.needsReview).toBe(false);
          return;
        }
        expect((item.price !== null && item.price > 0) || item.needsReview).toBe(true);
      });
    });

    it('a null price should always be flagged needsReview', () => {
      allItems.forEach((item) => {
        if (item.price === null) {
          expect(item.needsReview).toBe(true);
        }
      });
    });
  });

  describe('Known Data Gaps', () => {
    it('M3390 should have needsReview=true (price is null)', () => {
      const m3390 = mSeries.products.find((p) => p.code === 'M3390');
      expect(m3390?.needsReview).toBe(true);
      expect(m3390?.price).toBeNull();
    });

    it('LS Convert (now a Software product) should have needsReview=true', () => {
      const sw = catalog.series.find((s) => s.seriesCode === 'SW')!;
      const lsConvert = sw.products.find((p) => p.code === 'LS Convert');
      expect(lsConvert).toBeDefined();
      expect(lsConvert?.needsReview).toBe(true);
      expect(lsConvert?.price).toBeNull();
    });

    it('TPL should have price 0 and needsReview=true (genuine 0 in source, not a missing cell)', () => {
      const tpl = catalog.options.find((o) => o.code === 'TPL');
      expect(tpl).toBeDefined();
      expect(tpl?.price).toBe(0);
      expect(tpl?.needsReview).toBe(true);
    });

    // Manual products (not in the source Excel -- see MANUAL_PRODUCTS in
    // scripts/extract-catalog.ts) should survive extraction with no price
    // and needsReview=true, same as every other unpriced item.
    it('FP-TROLLEY (manual FP product) should exist with needsReview=true and no price', () => {
      const fp = catalog.series.find((s) => s.seriesCode === 'FP')!;
      const trolley = fp.products.find((p) => p.code === 'FP-TROLLEY');
      expect(trolley).toBeDefined();
      expect(trolley?.name).toBe('Fabric Roll Trolley');
      expect(trolley?.price).toBeNull();
      expect(trolley?.needsReview).toBe(true);
    });

    // The old single width-less "HDRF" product was split into three width
    // variants (owner decision, model like EasyLoader) -- see
    // MANUAL_PRODUCTS.EF in scripts/extract-catalog.ts. "HDRF" itself no
    // longer exists as a product code.
    it('HDRF-180/220/320 (manual EF products) should exist with needsReview=true and no AU price', () => {
      const ef = catalog.series.find((s) => s.seriesCode === 'EF')!;
      expect(ef.products.some((p) => p.code === 'HDRF')).toBe(false);
      for (const code of ['HDRF-180', 'HDRF-220', 'HDRF-320']) {
        const product = ef.products.find((p) => p.code === code);
        expect(product, `expected EF product "${code}"`).toBeDefined();
        expect(product?.name).toBe(`Heavy Duty Roll Feeder ${code.split('-')[1]}`);
        expect(product?.price).toBeNull();
        expect(product?.needsReview).toBe(true);
      }
    });
  });

  describe('Global Options', () => {
    // 81 -> 90: -1 (FM180 retired, not sold anymore -- see the "FM180
    // retirement" describe block below), +1 (JTP), +9 (SVC-* service
    // options) -- see MANUAL_OPTIONS in scripts/extract-catalog.ts.
    // 90 -> 95: +1 (Crate-EL) +4 (EL-3220/EL-4030 Additional/Static table
    // 1.2M lengths, priced null pending confirmation) -- production forms
    // phase 2, Task 1.
    it('should have exactly 95 global options', () => {
      expect(catalog.options).toHaveLength(95);
    });

    // Most options are series-scoped (non-empty compatibleSeries). A few
    // (e.g. EasyLoader accessories, scoped to one specific drive-module
    // product rather than the whole EL series) are product-scoped instead:
    // compatibleSeries is `[]` and compatibleProducts carries the scoping.
    // Every option must be compatible with *something*, one way or the other.
    it('every option should have a non-empty compatibleSeries OR compatibleProducts list', () => {
      catalog.options.forEach((option) => {
        expect(Array.isArray(option.compatibleSeries)).toBe(true);
        const hasSeries = option.compatibleSeries.length > 0;
        const hasProducts = Array.isArray(option.compatibleProducts) && option.compatibleProducts.length > 0;
        expect(hasSeries || hasProducts).toBe(true);
      });
    });

    it('EasyLoader accessory options should be product-scoped: empty compatibleSeries + compatibleProducts', () => {
      const elOptions = catalog.options.filter((o) => o.code.startsWith('EL-'));
      expect(elOptions.length).toBeGreaterThan(0);
      elOptions.forEach((option) => {
        expect(option.compatibleSeries).toEqual([]);
        expect(option.compatibleProducts).toBeDefined();
        expect(option.compatibleProducts!.length).toBeGreaterThan(0);
        option.compatibleProducts!.forEach((code) =>
          expect(['EL-2020', 'EL-2420', 'EL-3220', 'EL-4030']).toContain(code),
        );
      });
    });

    it('every option sourced from the M sheet should include "X" in compatibleSeries', () => {
      // PTW (merged M+L) and every M-only/split "-M" option should carry X.
      const mSourced = catalog.options.filter((o) => o.compatibleSeries.includes('M'));
      expect(mSourced.length).toBeGreaterThan(0);
      mSourced.forEach((option) => {
        expect(option.compatibleSeries).toContain('X');
      });
    });

    it('options priced identically across sheets are merged into one option with the union of series', () => {
      // PTW is priced 3500 in both M-series and L-Series -> single global option.
      const ptw = catalog.options.filter((o) => o.code === 'PTW');
      expect(ptw).toHaveLength(1);
      expect(ptw[0].price).toBe(3500);
      expect(ptw[0].compatibleSeries.sort()).toEqual(['L', 'M', 'X'].sort());
      // No unsuffixed leftovers for a merged code.
      expect(catalog.options.some((o) => o.code === 'PTW-M' || o.code === 'PTW-L')).toBe(false);
    });

    it('options priced differently across sheets are split into series-suffixed codes', () => {
      const splitBaseCodes = ['ABR', 'APM', 'BCR', 'HDC', 'HFV', 'OFD', 'OFP', 'PM', 'PRM'];
      splitBaseCodes.forEach((code) => {
        // The unsuffixed base code must not survive a split.
        expect(catalog.options.some((o) => o.code === code)).toBe(false);

        const mVariant = catalog.options.find((o) => o.code === `${code}-M`);
        const lVariant = catalog.options.find((o) => o.code === `${code}-L`);
        expect(mVariant).toBeDefined();
        expect(lVariant).toBeDefined();
        expect(mVariant!.price).not.toBe(lVariant!.price);
        expect(mVariant!.compatibleSeries).toContain('X');
      });

      // Crate splits three ways (M, P, FP), all at different prices.
      const crateM = catalog.options.find((o) => o.code === 'Crate-M');
      const crateP = catalog.options.find((o) => o.code === 'Crate-P');
      const crateFP = catalog.options.find((o) => o.code === 'Crate-FP');
      expect(crateM).toBeDefined();
      expect(crateP).toBeDefined();
      expect(crateFP).toBeDefined();
      expect(new Set([crateM!.price, crateP!.price, crateFP!.price]).size).toBe(3);
      expect(catalog.options.some((o) => o.code === 'Crate')).toBe(false);

    });

    // PRA used to split two ways (L-Series option, SW-sheet option) at
    // different prices. The SW-sheet "PRA" is now a Software product (see
    // Series Structure above) rather than an option, so there's no longer a
    // second "PRA" option to trigger the automatic merge/split logic --
    // the L-Series option keeps its long-standing "PRA-L" code (hard-coded
    // in extractLSeries) rather than reverting to an unsuffixed "PRA", which
    // would collide with the new SW product code.
    it('PRA-L (L-Series option) and PRA (SW product) coexist as distinct codes with different prices', () => {
      const praL = catalog.options.find((o) => o.code === 'PRA-L');
      expect(praL).toBeDefined();
      expect(praL!.price).toBe(2200);
      expect(praL!.compatibleSeries).toEqual(['L']);
      // No leftover "PRA-SW" option and no unsuffixed "PRA" option -- SW's
      // PRA is a product now.
      expect(catalog.options.some((o) => o.code === 'PRA-SW')).toBe(false);
      expect(catalog.options.some((o) => o.code === 'PRA')).toBe(false);

      const sw = catalog.series.find((s) => s.seriesCode === 'SW')!;
      const praProduct = sw.products.find((p) => p.code === 'PRA');
      expect(praProduct).toBeDefined();
      expect(praProduct!.price).toBe(3500);
    });

    // New owner-requested option (MANUAL_OPTIONS in scripts/extract-catalog.ts),
    // distinct from the pre-existing "JetPen" option sourced from the
    // L-Series sheet's own row (priced 7500).
    it('JTP ("JetPen") should exist, L-Series only, price null + needsReview true', () => {
      const jtp = catalog.options.find((o) => o.code === 'JTP');
      expect(jtp).toBeDefined();
      expect(jtp?.name).toBe('JetPen');
      expect(jtp?.price).toBeNull();
      expect(jtp?.needsReview).toBe(true);
      expect(jtp?.compatibleSeries).toEqual(['L']);

      // The pre-existing "JetPen" option (different code, different price)
      // is untouched by this addition.
      const jetPen = catalog.options.find((o) => o.code === 'JetPen');
      expect(jetPen).toBeDefined();
      expect(jetPen?.price).toBe(7500);
    });

    // FM180 ("Fabric Master") retired -- not sold anymore (owner decision).
    // Dropped at extraction (scripts/extract-catalog.ts skips the row) so it
    // never reappears in catalog.json; prisma/seed.ts's RETIRED_OPTION_CODES
    // handles cleaning it up on an existing DB.
    it('FM180 no longer exists as a catalog option', () => {
      expect(catalog.options.some((o) => o.code === 'FM180')).toBe(false);
    });

    // Service options (MANUAL_OPTIONS in scripts/extract-catalog.ts),
    // product-scoped to the new "SERVICE" container product, sourced from
    // prisma/seed-data/prices-us.json's `unmatched[]` rows (real NA service
    // rows with no AU equivalent) -- see scripts/extract-us-prices.ts.
    it('service options exist, product-scoped to SERVICE, AU price null + needsReview true', () => {
      const serviceCodes = [
        'SVC-LNS-INSTALL',
        'SVC-FP-INSTALL',
        'SVC-HDRF-INSTALL',
        'SVC-M-INSTALL',
        'SVC-M-INSTALL-MTS',
        'SVC-L-INSTALL',
        'SVC-L-INSTALL-MTS',
        'SVC-EL-INSTALL',
        'SVC-SW-TRAINING',
      ];
      expect(serviceCodes).toHaveLength(9);
      for (const code of serviceCodes) {
        const option = catalog.options.find((o) => o.code === code);
        expect(option, `expected service option "${code}"`).toBeDefined();
        expect(option?.price).toBeNull();
        expect(option?.needsReview).toBe(true);
        expect(option?.compatibleSeries).toEqual([]);
        expect(option?.compatibleProducts).toEqual(['SERVICE']);
      }
    });
  });

  describe('Data Integrity', () => {
    it('should not have duplicate codes across all products and options globally', () => {
      const codeMap: Record<string, number> = {};

      allItems.forEach((item) => {
        codeMap[item.code] = (codeMap[item.code] || 0) + 1;
      });

      const duplicates = Object.entries(codeMap)
        .filter(([, count]) => count > 1)
        .map(([code]) => code);

      expect(duplicates).toEqual([]);
    });

    it('all items should have required fields', () => {
      allItems.forEach((item) => {
        expect(item.code).toBeDefined();
        expect(typeof item.code).toBe('string');
        expect(item.code.length).toBeGreaterThan(0);

        expect(item.name).toBeDefined();
        expect(typeof item.name).toBe('string');
        expect(item.name.length).toBeGreaterThan(0);

        expect(item.description).toBeDefined();
        expect(typeof item.description).toBe('string');

        if (item.price !== null) {
          expect(typeof item.price).toBe('number');
        }

        expect(typeof item.needsReview).toBe('boolean');
      });
    });
  });

  describe('Catalog Metadata', () => {
    it('should have valid extractedAt timestamp', () => {
      expect(catalog.extractedAt).toBeDefined();
      const timestamp = new Date(catalog.extractedAt);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).toBeGreaterThan(0);
    });

    it('all series should have required fields', () => {
      catalog.series.forEach((series) => {
        expect(series.seriesCode).toBeDefined();
        expect(typeof series.seriesCode).toBe('string');
        expect(series.seriesCode.length).toBeGreaterThan(0);

        expect(series.seriesName).toBeDefined();
        expect(typeof series.seriesName).toBe('string');
        expect(series.seriesName.length).toBeGreaterThan(0);

        expect(Array.isArray(series.products)).toBe(true);
      });
    });

    it('options should be a top-level global array on the catalog, not nested per series', () => {
      expect(Array.isArray(catalog.options)).toBe(true);
      expect(catalog.options.length).toBeGreaterThan(0);
    });
  });
});
