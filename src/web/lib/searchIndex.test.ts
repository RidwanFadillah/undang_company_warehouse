import { describe, it, expect } from 'vitest';
import { SkuSearchIndex } from './searchIndex';
import type { Product, Variant, StockBalance } from '../../shared/types';

describe('SkuSearchIndex Performance & Accuracy', () => {
  it('searches across 900 variants in under 16 ms (DoD budget)', () => {
    const products: Record<number, Product> = {};
    const variants: Record<number, Variant> = {};
    const stock: Record<number, StockBalance> = {};

    const sizes = ['S', 'M', 'L'];
    const colors = ['Hitam', 'Putih', 'Navy', 'Marun', 'Abu', 'Mocca'];
    let vId = 1;

    // Build 50 products x 3 sizes x 6 colors = 900 variants
    for (let p = 1; p <= 50; p++) {
      products[p] = {
        id: p,
        sku: `SKU-PROD-${String(p).padStart(3, '0')}`,
        name: `Busana Muslim Gamis Modern Seri ${p}`,
        category: 'Busana Muslim',
        is_active: 1,
        updated_at: 1000,
      };

      for (const size of sizes) {
        for (const color of colors) {
          const id = vId++;
          variants[id] = {
            id,
            product_id: p,
            size,
            color,
            hpp: 35000,
            sell_price: 70000,
            min_stock: 20,
            is_active: 1,
            updated_at: 1000,
          };
          stock[id] = {
            variant_id: id,
            qty: 150,
            updated_at: 1000,
          };
        }
      }
    }

    expect(Object.keys(variants).length).toBe(900);

    const index = new SkuSearchIndex();
    index.buildIndex(products, variants, stock);
    expect(index.size).toBe(900);

    // Measure search execution time
    const queries = ['042', 'hitam', 'gamis l', 'sku-prod-025 mocca', 'seri 10 s'];

    for (const q of queries) {
      const start = performance.now();
      const results = index.search(q);
      const duration = performance.now() - start;

      // Must be < 16 ms (target in performance.md)
      expect(duration).toBeLessThan(16);
      expect(results.length).toBeGreaterThan(0);
    }
  });

  it('matches multi-word and partial queries correctly', () => {
    const products: Record<number, Product> = {
      1: {
        id: 1,
        sku: 'CD-COWOK',
        name: 'Celana Dalam Cowok',
        category: 'Underwear',
        is_active: 1,
        updated_at: 1000,
      },
    };
    const variants: Record<number, Variant> = {
      10: {
        id: 10,
        product_id: 1,
        size: 'XL',
        color: 'Hitam',
        hpp: 5000,
        sell_price: 10000,
        min_stock: 10,
        is_active: 1,
        updated_at: 1000,
      },
    };
    const stock: Record<number, StockBalance> = {
      10: { variant_id: 10, qty: 85, updated_at: 1000 },
    };

    const index = new SkuSearchIndex();
    index.buildIndex(products, variants, stock);

    expect(index.search('cd hitam').length).toBe(1);
    expect(index.search('xl underwear').length).toBe(1);
    expect(index.search('gamis').length).toBe(0);
  });
});
