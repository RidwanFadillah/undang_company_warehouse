import { describe, it, expect } from 'vitest';
import { normalizeOrderStatus, calculatePhysicalQty, normalizeVariationKey } from './orders';

describe('normalizeOrderStatus (R-43)', () => {
  it('normalizes various cancel statuses to batal', () => {
    expect(normalizeOrderStatus('Dibatalkan')).toBe('batal');
    expect(normalizeOrderStatus('Cancelled by buyer')).toBe('batal');
    expect(normalizeOrderStatus('Pembatalan diajukan')).toBe('batal');
    expect(normalizeOrderStatus('Batal')).toBe('batal');
  });

  it('normalizes to perlu_dikirim', () => {
    expect(normalizeOrderStatus('Perlu Dikirim')).toBe('perlu_dikirim');
    expect(normalizeOrderStatus('To Ship')).toBe('perlu_dikirim');
    expect(normalizeOrderStatus('Sedang Diproses')).toBe('perlu_dikirim');
    expect(normalizeOrderStatus('')).toBe('perlu_dikirim');
    expect(normalizeOrderStatus(null)).toBe('perlu_dikirim');
  });

  it('normalizes to dikirim and selesai', () => {
    expect(normalizeOrderStatus('Dikirim')).toBe('dikirim');
    expect(normalizeOrderStatus('In Transit')).toBe('dikirim');
    expect(normalizeOrderStatus('Selesai')).toBe('selesai');
    expect(normalizeOrderStatus('Completed')).toBe('selesai');
  });

  it('normalizes to belum_bayar', () => {
    expect(normalizeOrderStatus('Belum Bayar')).toBe('belum_bayar');
    expect(normalizeOrderStatus('Unpaid')).toBe('belum_bayar');
    expect(normalizeOrderStatus('Menunggu Pembayaran')).toBe('belum_bayar');
  });
});

describe('calculatePhysicalQty (R-45)', () => {
  it('calculates physical pcs with multiplier', () => {
    expect(calculatePhysicalQty(1, 1)).toBe(1);
    expect(calculatePhysicalQty(10, 3)).toBe(30); // 10 pack of 3 pcs
    expect(calculatePhysicalQty(2, 12)).toBe(24); // 2 lusin = 24 pcs
  });

  it('handles zero or negative inputs gracefully', () => {
    expect(calculatePhysicalQty(0, 0)).toBe(1);
    expect(calculatePhysicalQty(-5, 1)).toBe(1);
  });
});

describe('normalizeVariationKey', () => {
  it('normalizes spaces, hyphens, and commas', () => {
    expect(normalizeVariationKey('Hitam, XL')).toBe('hitam xl');
    expect(normalizeVariationKey('M - Coklat')).toBe('m coklat');
    expect(normalizeVariationKey('  Biru   Dongker  ')).toBe('biru dongker');
  });
});
