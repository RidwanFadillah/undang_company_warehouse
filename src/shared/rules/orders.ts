/**
 * Aturan Bisnis Pesanan & Mapping (R-42, R-43, R-44, R-45, R-46, R-51)
 */

export type OrderStatus = 'belum_bayar' | 'perlu_dikirim' | 'dikirim' | 'selesai' | 'batal';
export type OrderLineResolveState =
  'baru' | 'siap_keluar' | 'menunggu_fisik' | 'perlu_mapping' | 'selesai';
export type OrderStockState = 'belum' | 'keluar' | 'aman' | 'dikembalikan';

/**
 * Normalisasi status pesanan dari teks marketplace (R-43)
 */
export function normalizeOrderStatus(rawStatus: string | null | undefined): OrderStatus {
  if (!rawStatus) return 'perlu_dikirim';
  const clean = rawStatus.toLowerCase().trim();

  // Batal
  if (
    clean.includes('batal') ||
    clean.includes('cancel') ||
    clean.includes('batalkan') ||
    clean.includes('cancellation')
  ) {
    return 'batal';
  }

  // Belum bayar
  if (
    clean.includes('belum bayar') ||
    clean.includes('unpaid') ||
    clean.includes('menunggu pembayaran') ||
    clean.includes('pending')
  ) {
    return 'belum_bayar';
  }

  // Selesai
  if (
    clean.includes('selesai') ||
    clean.includes('completed') ||
    clean.includes('delivered') ||
    clean.includes('pesanan selesai')
  ) {
    return 'selesai';
  }

  // Perlu dikirim (prioritas sebelum dikirim karena ada kata 'dikirim')
  if (
    clean.includes('perlu dikirim') ||
    clean.includes('perlu di kirim') ||
    clean.includes('menunggu dikirim') ||
    clean.includes('to ship') ||
    clean.includes('ready to ship') ||
    clean.includes('diproses') ||
    clean.includes('processing')
  ) {
    return 'perlu_dikirim';
  }

  // Dikirim
  if (
    clean.includes('dikirim') ||
    clean.includes('shipped') ||
    clean.includes('dalam pengiriman') ||
    clean.includes('in transit') ||
    clean.includes('on delivery')
  ) {
    return 'dikirim';
  }

  return 'perlu_dikirim';
}

/**
 * Hitung pcs fisik dari qty pesanan dan pengali bundle (R-45)
 */
export function calculatePhysicalQty(orderQty: number, multiplier = 1): number {
  const m = Math.max(1, Math.round(multiplier || 1));
  const q = Math.max(1, Math.round(orderQty || 1));
  return q * m;
}

/**
 * Normalisasi kunci variasi (case-insensitive, hapus spasi berlebih)
 */
export function normalizeVariationKey(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[\s\-_,]+/g, ' ')
    .trim();
}
