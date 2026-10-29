/**
 * Aturan Bisnis Stok (docs/business-rules.md §2)
 * R-10: Sisa Stok = Stok Awal + Total Masuk − Total Keluar (semua pcs).
 * R-11: Total Modal Stok = Sisa Stok × HPP. Varian dengan stok minus TIDAK DIHITUNG ke total modal.
 * R-12: Stok minus diperbolehkan (allow_negative_stock=1), tetapi ditandai merah (Perlu Koreksi).
 * R-13: Stock Opname: selisih (counted_qty - current_qty) menjadi movement 'adjust'.
 * R-14: Stok rendah: qty <= min_stock (hanya bila min_stock > 0 dan qty > 0).
 * R-15: Status warna sel matriks: minus (merah), rendah (kuning), nol (abu), normal/aman (hijau/standar).
 */

export type StockStatus = 'negative' | 'low' | 'zero' | 'normal';

export interface VariantStockItem {
  variantId: number;
  qty: number;
  minStock: number;
  hpp: number;
}

/**
 * Menentukan status stok varian untuk penandaan warna (R-12, R-14, R-15)
 */
export function getStockStatus(qty: number, minStock: number = 0): StockStatus {
  if (qty < 0) return 'negative';
  if (qty === 0) return 'zero';
  if (minStock > 0 && qty <= minStock) return 'low';
  return 'normal';
}

/**
 * Hitung total modal stok (R-11).
 * Varian dengan stok minus TIDAK dihitung ke total modal (tidak mengurangi modal).
 */
export function calculateTotalStockValuation(items: VariantStockItem[]): number {
  return items.reduce((total, item) => {
    if (item.qty > 0 && item.hpp > 0) {
      return total + Math.round(item.qty * item.hpp);
    }
    return total;
  }, 0);
}

/**
 * Hitung selisih kuantitas untuk Stock Opname (R-13).
 * Delta positif = stok fisik lebih banyak dari sistem (+adjust).
 * Delta negatif = stok fisik lebih sedikit dari sistem (-adjust).
 */
export function calculateOpnameDelta(currentQty: number, countedQty: number): number {
  return Math.round(countedQty) - Math.round(currentQty);
}

/**
 * Filter item yang memerlukan koreksi (stok minus atau stok rendah)
 */
export function filterStockIssues(items: VariantStockItem[]): {
  negative: VariantStockItem[];
  low: VariantStockItem[];
} {
  const negative: VariantStockItem[] = [];
  const low: VariantStockItem[] = [];

  for (const item of items) {
    const status = getStockStatus(item.qty, item.minStock);
    if (status === 'negative') {
      negative.push(item);
    } else if (status === 'low') {
      low.push(item);
    }
  }

  return { negative, low };
}
