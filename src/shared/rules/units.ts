/**
 * Aturan Bisnis Satuan & Angka (docs/business-rules.md §1)
 * R-01: Satuan dasar pcs. 1 lusin = 12 pcs. Lusin hanya tampilan/input.
 * R-02: Input barang masuk boleh dalam lusin atau pcs; disimpan pcs (pcs = lusin * 12).
 * R-03: Uang = integer rupiah. HPP per pcs boleh pecahan (mis. 32.000 / 12 = 2666.67);
 *       total baris = Math.round(qty * hpp).
 */

export const PCS_PER_LUSIN = 12;

/**
 * Konversi lusin ke pcs (R-02)
 */
export function lusinToPcs(lusin: number): number {
  return Math.round(lusin * PCS_PER_LUSIN);
}

/**
 * Konversi pcs ke lusin (R-01)
 */
export function pcsToLusin(pcs: number): number {
  return pcs / PCS_PER_LUSIN;
}

/**
 * Format kuantitas tampilan dengan opsi unit pcs atau lusin
 */
export function formatQty(pcs: number, unit: 'pcs' | 'lusin' = 'pcs'): string {
  if (unit === 'lusin') {
    const lusin = pcsToLusin(pcs);
    // Tampilkan desimal maksimal 2 angka jika tidak bulat, misal 1.5 lusin
    return Number.isInteger(lusin)
      ? `${lusin} lsn`
      : `${lusin.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} lsn`;
  }
  return `${pcs.toLocaleString('id-ID')} pcs`;
}

/**
 * Hitung total rupiah baris (R-03)
 * Total baris selalu dibulatkan ke integer rupiah terdekat
 */
export function calculateLineTotal(qtyPcs: number, unitCostOrHpp: number): number {
  return Math.round(qtyPcs * unitCostOrHpp);
}

/**
 * Format rupiah dengan pemisah ribuan titik
 */
export function formatRupiah(amount: number): string {
  const rounded = Math.round(amount);
  return `Rp ${rounded.toLocaleString('id-ID')}`;
}
