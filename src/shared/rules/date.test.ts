import { describe, it, expect } from 'vitest';
import { getWibDateString, isValidWibDateString } from './date';

describe('date rules (Asia/Jakarta WIB)', () => {
  it('formats epoch to WIB YYYY-MM-DD correctly across midnight boundary', () => {
    // 2026-10-29 00:30 WIB is 2026-10-28 17:30 UTC
    const epochUtc = Date.UTC(2026, 9, 28, 17, 30, 0); // 17:30 UTC
    expect(getWibDateString(epochUtc)).toBe('2026-10-29');

    // 2026-10-28 23:30 WIB is 2026-10-28 16:30 UTC
    const epochUtcEarlier = Date.UTC(2026, 9, 28, 16, 30, 0);
    expect(getWibDateString(epochUtcEarlier)).toBe('2026-10-28');
  });

  it('validates YYYY-MM-DD format correctly', () => {
    expect(isValidWibDateString('2026-10-29')).toBe(true);
    expect(isValidWibDateString('2026-02-29')).toBe(false); // 2026 is not a leap year
    expect(isValidWibDateString('2024-02-29')).toBe(true); // 2024 is a leap year
    expect(isValidWibDateString('invalid')).toBe(false);
  });
});
