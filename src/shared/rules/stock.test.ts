import { describe, it, expect } from 'vitest';
import {
  getStockStatus,
  calculateTotalStockValuation,
  calculateOpnameDelta,
  filterStockIssues,
  type VariantStockItem,
} from './stock';

describe('Aturan Bisnis Stok (R-10 s/d R-15)', () => {
  it('R-11: Varian stok minus TIDAK mengurangi total modal stok', () => {
    const items: VariantStockItem[] = [
      { variantId: 1, qty: 100, minStock: 20, hpp: 20000 }, // 100 * 20.000 = 2.000.000
      { variantId: 2, qty: 50, minStock: 10, hpp: 10000 }, // 50 * 10.000  =   500.000
      { variantId: 3, qty: -20, minStock: 10, hpp: 15000 }, // Minus! Tidak boleh mengurangi!
      { variantId: 4, qty: 0, minStock: 10, hpp: 30000 }, // Nol
    ];

    const totalValuation = calculateTotalStockValuation(items);
    // Modal harus 2.500.000, bukan 2.200.000
    expect(totalValuation).toBe(2_500_000);
  });

  it('R-12, R-14, R-15: Penentuan status warna sel matriks stok', () => {
    expect(getStockStatus(-5, 10)).toBe('negative'); // Merah
    expect(getStockStatus(0, 10)).toBe('zero'); // Abu
    expect(getStockStatus(8, 10)).toBe('low'); // Kuning (qty <= minStock)
    expect(getStockStatus(10, 10)).toBe('low'); // Kuning (qty == minStock)
    expect(getStockStatus(15, 10)).toBe('normal'); // Aman/hijau
    expect(getStockStatus(5, 0)).toBe('normal'); // MinStock=0 -> tidak ada tanda rendah
  });

  it('R-13: Hitung selisih Stock Opname (Delta penyesuaian)', () => {
    // Stok sistem = 10, fisik dihitung = 15 -> perlu movement +5
    expect(calculateOpnameDelta(10, 15)).toBe(5);

    // Stok sistem = 20, fisik dihitung = 12 -> perlu movement -8
    expect(calculateOpnameDelta(20, 12)).toBe(-8);

    // Stok sistem = -5 (minus), fisik dihitung = 10 -> perlu movement +15
    expect(calculateOpnameDelta(-5, 10)).toBe(15);

    // Stok cocok -> selisih 0
    expect(calculateOpnameDelta(50, 50)).toBe(0);
  });

  it('Filter isu stok minus dan stok rendah untuk halaman Perlu Koreksi', () => {
    const items: VariantStockItem[] = [
      { variantId: 1, qty: -10, minStock: 5, hpp: 1000 },
      { variantId: 2, qty: 3, minStock: 10, hpp: 1000 },
      { variantId: 3, qty: 25, minStock: 10, hpp: 1000 },
      { variantId: 4, qty: 0, minStock: 10, hpp: 1000 },
    ];

    const issues = filterStockIssues(items);
    expect(issues.negative.length).toBe(1);
    expect(issues.negative[0].variantId).toBe(1);

    expect(issues.low.length).toBe(1);
    expect(issues.low[0].variantId).toBe(2);
  });
});
