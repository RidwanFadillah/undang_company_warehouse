/**
 * Rules for dates according to AGENTS.md:
 * - Tanggal disimpan 'YYYY-MM-DD' zona Asia/Jakarta (WIB, UTC+7)
 * - Timestamp = epoch milidetik
 * - Jangan pakai new Date() mentah untuk tanggal bisnis
 */

export function getWibDateString(epochMs: number = Date.now()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(epochMs); // Returns YYYY-MM-DD
}

export function isValidWibDateString(val: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const [year, month, day] = val.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
