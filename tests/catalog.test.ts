import { describe, it, expect, beforeAll } from 'vitest';
import catalogData from '../prisma/seed-data/catalog.json';

interface CatalogItem {
  code: string;
  name: string;
  description: string;
  price: number | null;
  needsReview: boolean;
}

interface Series {
  seriesCode: string;
  seriesName: string;
  maxDiscountPct: number | null;
  products: CatalogItem[];
  options: CatalogItem[];
}

interface Catalog {
  extractedAt: string;
  series: Series[];
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

    // Collect all items (products and options) from all series
    allItems = [];
    catalog.series.forEach((series) => {
      allItems.push(...series.products);
      allItems.push(...series.options);
    });
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
    it('every item should have either positive price or (null price with needsReview=true)', () => {
      allItems.forEach((item) => {
        if (item.price === null) {
          expect(item.needsReview).toBe(true);
        } else {
          expect(item.price).toBeGreaterThan(0);
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
        expect(Array.isArray(series.options)).toBe(true);
      });
    });
  });
});
