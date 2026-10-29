import { describe, it, expect } from 'vitest';
import { lusinToPcs, pcsToLusin, formatQty, calculateLineTotal, formatRupiah } from './units';

describe('Aturan Bisnis Satuan & Angka (R-01, R-02, R-03)', () => {
  it('R-01: 1 lusin = 12 pcs, konversi bolak-balik akurat', () => {
    expect(lusinToPcs(1)).toBe(12);
    expect(lusinToPcs(2.5)).toBe(30);
    expect(lusinToPcs(10)).toBe(120);

    expect(pcsToLusin(12)).toBe(1);
    expect(pcsToLusin(30)).toBe(2.5);
    expect(pcsToLusin(6)).toBe(0.5);
  });

  it('R-02: format tampilan kuantitas pcs dan lusin', () => {
    expect(formatQty(24, 'pcs')).toBe('24 pcs');
    expect(formatQty(24, 'lusin')).toBe('2 lsn');
    expect(formatQty(30, 'lusin')).toBe('2,5 lsn');
    expect(formatQty(-12, 'pcs')).toBe('-12 pcs');
  });

  it('R-03: uang integer rupiah dan pembulatan pecahan HPP', () => {
    // 32.000 per lusin -> 2.666,6667 per pcs
    const hppPcs = 32000 / 12;
    expect(calculateLineTotal(12, hppPcs)).toBe(32000);
    expect(calculateLineTotal(1, hppPcs)).toBe(2667);
    expect(calculateLineTotal(6, hppPcs)).toBe(16000);

    expect(formatRupiah(1250000)).toBe('Rp 1.250.000');
    expect(formatRupiah(2666.67)).toBe('Rp 2.667');
  });
});
