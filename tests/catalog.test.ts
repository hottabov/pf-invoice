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

    it('should have exactly 37 total products across all series', () => {
      const totalProducts = catalog.series.reduce((sum, series) => sum + series.products.length, 0);
      expect(totalProducts).toBe(37);
    });

    it('M series should have 12 products', () => {
      expect(mSeries.products).toHaveLength(12);
    });

    it('L series maxDiscountPct should be 10', () => {
      expect(lSeries.maxDiscountPct).toBe(10);
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

    it('LS Convert option should have needsReview=true', () => {
      const lsConvert = allItems.find((item) => item.code === 'LS Convert');
      expect(lsConvert).toBeDefined();
      expect(lsConvert?.needsReview).toBe(true);
    });

    it('TPL should have price 0 and needsReview=true (genuine 0 in source, not a missing cell)', () => {
      const tpl = catalog.options.find((o) => o.code === 'TPL');
      expect(tpl).toBeDefined();
      expect(tpl?.price).toBe(0);
      expect(tpl?.needsReview).toBe(true);
    });
  });

  describe('Global Options', () => {
    it('every option should have a non-empty compatibleSeries list', () => {
      catalog.options.forEach((option) => {
        expect(Array.isArray(option.compatibleSeries)).toBe(true);
        expect(option.compatibleSeries.length).toBeGreaterThan(0);
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

      // PRA splits two ways (L, SW), at different prices.
      const praL = catalog.options.find((o) => o.code === 'PRA-L');
      const praSW = catalog.options.find((o) => o.code === 'PRA-SW');
      expect(praL).toBeDefined();
      expect(praSW).toBeDefined();
      expect(praL!.price).not.toBe(praSW!.price);
      expect(catalog.options.some((o) => o.code === 'PRA')).toBe(false);
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
