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
    xcSeries = catalog.series.find((s) => s.seriesCode === 'XC')!;
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
    it('should have exactly 9 series', () => {
      expect(catalog.series).toHaveLength(9);
    });

    it('should have exactly 54 total products across all series', () => {
      const totalProducts = catalog.series.reduce((sum, series) => sum + series.products.length, 0);
      expect(totalProducts).toBe(54);
    });

    it('M series should have 12 products', () => {
      expect(mSeries.products).toHaveLength(12);
    });

    it('L series maxDiscountPct should be 10', () => {
      expect(lSeries.maxDiscountPct).toBe(10);
    });

    // EasyLoader/EasyFeeder/Software were originally misclassified as
    // options-only sheets (0 products each), which made their machines and
    // software modules impossible to add to a document. Re-verified against
    // the source sheets and reclassified -- see scripts/extract-catalog.ts.
    it('EasyLoader (EL) should have 2 products (one per width: drive module base machine)', () => {
      const el = catalog.series.find((s) => s.seriesCode === 'EL')!;
      expect(el.products).toHaveLength(2);
    });

    it('EasyFeeder (EF) should have 4 products (2020/2420/4030 + manual HDRF)', () => {
      const ef = catalog.series.find((s) => s.seriesCode === 'EF')!;
      expect(ef.products).toHaveLength(4);
    });

    it('FabricPro (FP) should have 3 products (FP-180/FP-220 + manual FP-TROLLEY)', () => {
      const fp = catalog.series.find((s) => s.seriesCode === 'FP')!;
      expect(fp.products).toHaveLength(3);
    });

    it('Software (SW) should have 10 products', () => {
      const sw = catalog.series.find((s) => s.seriesCode === 'SW')!;
      expect(sw.products).toHaveLength(10);
    });
  });

  describe('XC and M Series Code Mapping', () => {
    it('XC series should have same product count as M series', () => {
      expect(xcSeries.products).toHaveLength(mSeries.products.length);
    });

    it('every XC product code should match pattern XC- + M code without leading M', () => {
      mSeries.products.forEach((mProduct, index) => {
        const xcProduct = xcSeries.products[index];
        const expectedXcCode = 'XC-' + mProduct.code.substring(1);
        expect(xcProduct.code).toBe(expectedXcCode);
      });
    });

    it('XC and M products should be in same order', () => {
      mSeries.products.forEach((mProduct, index) => {
        const xcProduct = xcSeries.products[index];
        expect(xcProduct.code).toBe('XC-' + mProduct.code.substring(1));
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
    // one, e.g. TPL's genuine 0).
    it('every item should have a positive price OR be flagged needsReview', () => {
      allItems.forEach((item) => {
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

    it('HDRF (manual EF product) should exist with needsReview=true and no price', () => {
      const ef = catalog.series.find((s) => s.seriesCode === 'EF')!;
      const hdrf = ef.products.find((p) => p.code === 'HDRF');
      expect(hdrf).toBeDefined();
      expect(hdrf?.name).toBe('Heavy Duty Roll Feeder');
      expect(hdrf?.price).toBeNull();
      expect(hdrf?.needsReview).toBe(true);
    });
  });

  describe('Global Options', () => {
    it('should have exactly 81 global options', () => {
      expect(catalog.options).toHaveLength(81);
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
        option.compatibleProducts!.forEach((code) => expect(['EL-2020', 'EL-2420']).toContain(code));
      });
    });

    it('every option sourced from the M sheet should include "XC" in compatibleSeries', () => {
      // PTW (merged M+L) and every M-only/split "-M" option should carry XC.
      const mSourced = catalog.options.filter((o) => o.compatibleSeries.includes('M'));
      expect(mSourced.length).toBeGreaterThan(0);
      mSourced.forEach((option) => {
        expect(option.compatibleSeries).toContain('XC');
      });
    });

    it('options priced identically across sheets are merged into one option with the union of series', () => {
      // PTW is priced 3500 in both M-series and L-Series -> single global option.
      const ptw = catalog.options.filter((o) => o.code === 'PTW');
      expect(ptw).toHaveLength(1);
      expect(ptw[0].price).toBe(3500);
      expect(ptw[0].compatibleSeries.sort()).toEqual(['L', 'M', 'XC'].sort());
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
        expect(mVariant!.compatibleSeries).toContain('XC');
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
