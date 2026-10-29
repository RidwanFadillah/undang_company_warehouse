# performance.md — Anggaran Kecepatan

Tujuan pemilik: **tidak ada stuttering / loading lama.** Ini bukan fitur tambahan; ini syarat lulus tiap fase.

## 1. Anggaran (budget) — harus lolos sebelum fase dianggap selesai

| Metrik | Target |
|---|---|
| Buka app (kunjungan ulang, ada cache) → data tampil | **< 300 ms** |
| Buka app pertama kali (4G, HP mid-range) → bisa dipakai | **< 1,5 s** |
| Klik/ketik → respons UI | **< 100 ms** |
| Pencarian SKU saat mengetik | **< 16 ms/ketukan** (di memori) |
| Pindah halaman | **instan** (tanpa spinner layar penuh) |
| JS awal (gzip) | **< 150 KB** untuk shell; sisa di-lazy-load per route |
| API p95 tulis | < 150 ms; sync delta < 80 ms |
| Scroll tabel 5.000 baris | 60 fps |

## 2. Strategi (urut dari dampak terbesar)

1. **Data di memori client.** Master + stok + mapping (< 500 KB) diunduh sekali, disimpan di IndexedDB, di-refresh dengan sync delta. Pencarian/filter/matriks tanpa jaringan.
2. **Stale-while-revalidate.** Render dari cache seketika; perbarui di belakang. Layar loading penuh **dilarang**; pakai skeleton hanya jika data > 150 ms.
3. **Mutasi optimistic.** Barang masuk/keluar langsung tampil di UI; server mengonfirmasi di belakang; gagal → rollback + toast. Entri beruntun (grid) tidak menunggu respons.
4. **Ledger + saldo** (bukan `SUMIFS` ribuan baris). Baca stok O(1) per varian.
5. **Virtualisasi** semua tabel > 100 baris (TanStack Virtual). Tinggi baris tetap.
6. **Edge + wilayah DB dekat.** Worker melayani statis dari CDN; D1 dibuat dengan `--location apac`.
7. **Bundle kecil.** Route-level code splitting; SheetJS & chart hanya di-`import()` saat dibutuhkan; font sistem; ikon per-ikon; tanpa library tanggal besar (pakai `Intl` + util kecil WIB).
8. **Prefetch** data halaman berikutnya saat hover/focus menu; prefetch laporan bulan lalu saat idle.
9. **Batch di server.** 1 request = 1 `DB.batch` untuk dokumen multi-baris. Tidak ada N+1.
10. **Debounce cerdas.** Sync saat tab kembali fokus + tiap 60 dtk saat aktif (bukan polling agresif; menjaga kuota).
11. **Grid entri ringan.** Sel input uncontrolled, validasi saat blur, tidak me-render ulang seluruh grid per ketukan.

## 3. Hemat kuota = hemat latensi
- Kuota D1: 5 jt read & 100 rb write/hari. Sync delta + index + batch menjaganya di bawah ±5%.
- Worker 10 ms CPU: tanpa komputasi berat. Impor file diparse di browser.
- `GET /usage` + banner di UI bila mendekati batas; naik ke Workers Paid ($5/bln) bila ya.

## 4. Cara mengukur (wajib di Fase 0 dan tiap fase)
- `npm run perf`: skrip Playwright + Lighthouse CI lokal; gagal bila melewati anggaran bundle / LCP.
- Tambah `console.time`/Performance API pada: boot-dari-cache, pencarian SKU, simpan dokumen masuk, proses 200 pesanan.
- Seed data uji: 900 varian, 5.000 pesanan, 20.000 movement (`npm run seed:perf`). Semua tes kecepatan memakai seed ini, bukan data kosong.
- Di Worker: `wrangler tail` untuk melihat `cpuTime`; > 8 ms = perbaiki.

## 5. Anti-pola (tolak di review)
- Spinner layar penuh · `SELECT *` tanpa `LIMIT` · fetch per baris di dalam loop · render tabel penuh tanpa virtualisasi · import library besar untuk fungsi kecil (moment, lodash penuh, chart berat) · parsing xlsx di Worker · menghitung total di client dari semua transaksi mentah (minta agregat dari server) · polling < 30 dtk.

## 6. PWA (Fase 10)
Service worker cache shell → buka app tanpa jaringan, "Add to Home Screen" di HP gudang. Mutasi saat offline diantre dan dikirim ulang (kunci idempotensi per mutasi).
