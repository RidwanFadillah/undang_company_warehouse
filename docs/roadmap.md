# roadmap.md — Fase Build + Prompt untuk Antigravity

Cara pakai: satu fase = satu conversation agent = satu commit. Tempel prompt fase, biarkan agent membuat rencana (mode Planning), tinjau, setujui. Fase dianggap selesai bila **Definition of Done (DoD)** terpenuhi **dan** anggaran kecepatan (`performance.md`) lolos. Semua prompt mengandaikan `AGENTS.md` terbaca otomatis.

---
## Fase 0 — Fondasi, deploy, auth
**Prompt**
> Baca `README.md`, `AGENTS.md`, `docs/arch.md`, `docs/deploy.md`. Buat scaffold: Vite + React + TS + Tailwind + shadcn/ui (SPA), Worker Hono di `src/server`, folder `src/shared`, `wrangler.jsonc` sesuai `deploy.md`, vitest, ESLint/Prettier. Terapkan `db/migrations/0001_init.sql` ke D1 lokal. Buat middleware auth Cloudflare Access (verifikasi JWT dengan `jose`, bypass `DEV_AUTH_EMAIL` hanya saat ENV=dev) + endpoint `GET /api/me`. Siapkan skrip `dev`, `build`, `test`, `deploy`, `db:migrate`, `perf` (cek ukuran bundle). Tampilkan halaman shell dengan sidebar kosong. Deploy "hello" ke workers.dev.

**DoD:** `npm run dev` jalan; `/api/me` bekerja lokal & produksi; tanpa login → ditolak; bundle shell < 150 KB gzip.

## Fase 1 — Sync, cache, kerangka UI
**Prompt**
> Baca `docs/arch.md` (ADR-3), `docs/api.md` (Sync), `docs/performance.md`. Implementasikan `GET /api/sync?since=` (products, variants, stock, stores, partners, mappings, fee_profiles, settings; ETag) dan client: TanStack Query + persister IndexedDB, hook `useMaster()`, indeks pencarian SKU di memori, indikator sinkron, sync saat fokus tab + tiap 60 dtk. Buat `npm run seed:dev` (50 varian) dan `seed:perf` (900 varian, 20.000 movement). Bangun layout: sidebar, bar atas, palet `Ctrl+K`, tema terang/gelap.

**DoD:** buka ulang app → data tampil < 300 ms dari cache; offline tetap membuka; pencarian SKU < 16 ms pada seed perf.

## Fase 2 — Stok master
**Prompt**
> Baca `docs/business-rules.md` §1–3, `docs/design.md` (Stok). Bangun halaman Stok: matriks produk×warna×size (toggle pcs/lusin, warna sel minus/rendah/nol), mode daftar virtualized, panel kartu stok, CRUD produk & varian (`POST /variants/bulk`), "Atur HPP per size", Stock Opname (`POST /stock/adjust`), halaman "Perlu Koreksi" (`/stock/issues`) dan `/stock/integrity`. Tulis fungsi murni `shared/rules/units.ts` (lusin↔pcs) + test. Pastikan hanya `stock_movements` yang mengubah saldo.

**DoD:** test R-01..R-15 hijau; opname menghasilkan movement `adjust`; integritas kosong.

## Fase 3 — Barang masuk
**Prompt**
> Baca `docs/business-rules.md` §4, `docs/design.md` (Barang Masuk). Bangun `EntryGrid` (keyboard, paste dari clipboard, autocomplete lokal), form dokumen barang masuk (beli), `POST /inbound` atomik (doc + lines + movement `purchase` + opsi buat `supplier_invoices`), daftar dokumen per bulan, void. CRUD Mitra. Optimistic UI.

**DoD:** input 30 baris < 60 detik pakai keyboard saja; void mengembalikan stok; tidak ada request per baris.

## Fase 4 — Pesanan: import, mapping, proses
**Prompt**
> Baca `docs/business-rules.md` §5.1–5.3, `docs/design.md` (Pesanan & Keluar), `docs/api.md` (Pesanan). Implementasikan parser import di browser (SheetJS lazy-load) untuk format baku R-40 (mulai dari format di sheet `Import_Pesanan`; parser Shopee/TikTok asli menyusul setelah saya kirim contoh file), normalisasi toko & status (R-42/R-43), `POST /orders/import` idempoten, resolusi mapping (pasti/bundle/random/perlu_mapping), `POST /orders/process` (outbound + movement `sale` + `hpp_snapshot`), barang keluar manual, UI mapping inline, CRUD Mapping SKU + bulk. Test idempotensi & pengali.

**DoD:** import file yang sama 2× tidak menggandakan stok; 200 pesanan diproses < 1 dtk; mapping baru langsung me-resolve baris sejenis.

## Fase 5 — Antrean random, batal, retur
**Prompt**
> Baca `docs/business-rules.md` §5.2 (random) dan §5.4. Bangun Antrean Random (pemilih fisik, total harus = pcs fisik), logika batal saat import ulang (R-51: `aman` vs retur pending), halaman Retur (restok/buang → movement `return_in`) dan halaman Pesanan Batal (audit). KPI retur.

**DoD:** skenario batal-sebelum-keluar & batal-setelah-keluar punya test; stok akurat setelah restok.

## Fase 6 — Utang supplier & maklun
**Prompt**
> Baca `docs/business-rules.md` §6. Bangun Buku Utang (tagihan, pembayaran, sisa, status), alur Maklun (Titip → Setor → Bayar, rekap per batch, HPP maklun/pcs) di mana Setor otomatis membuat dokumen masuk `maklun` (R-63). Test rumus rekap dengan angka contoh BT-1..3.

**DoD:** sisa utang & rekap cocok dengan hitungan manual; setor menambah stok dengan HPP benar.

## Fase 7 — Keuangan
**Prompt**
> Baca `docs/business-rules.md` §7. Bangun Pengeluaran (grid entri, kategori, `pay_source`, `txn_type`, `pelunasan_bon` → `supplier_payments` otomatis), Kas Induk (modal dari settings), Rekap Penjualan harian per toko + importer income TikTok (parse di browser, jumlahkan per hari, unik per toko-tanggal-sumber). Mohon contoh file income Shopee/TikTok bila perlu.

**DoD:** `net_received` otomatis; import ulang menimpa; sisa kas benar.

## Fase 8 — Laporan, dashboard, kalkulator
**Prompt**
> Baca `docs/business-rules.md` §8–10. Implementasikan `/reports/monthly|executive|channel|stock-valuation` dengan SQL agregat ber-index, halaman Laporan + Dashboard (kartu kerja harian), grafik ringan (lazy-load), dan Kalkulator Harga (`shared/rules/price.ts` + test memakai angka sheet; potongan mengikuti channel terpilih). Terapkan keputusan K-1 sesuai konfirmasi pemilik.

**DoD:** laporan bulanan memakai HPP snapshot; laporan 1 tahun < 300 ms; kalkulator cocok dengan sheet untuk 3 contoh.

## Fase 9 — Migrasi data nyata (cutover)
**Prompt**
> Baca `docs/migration.md` utuh. Buat `scripts/migrate/extract.py` (openpyxl, data_only) dan `to_sql.py` sesuai pemetaan §2, hasilkan `anomalies.md`, template CSV opname, seed berpotongan ≤ 3.000 row, dan skrip verifikasi checksum §4. Jalankan di D1 lokal dulu. Jangan menjalankan seed remote sebelum saya setujui laporan anomali.

**DoD:** semua checksum §4 cocok; laporan anomali ditinjau pemilik; backup dibuat.

## Fase 10 — Poles, PWA, keamanan
**Prompt**
> Tambahkan PWA (cache shell, antrean mutasi offline dengan kunci idempotensi), panel Pengaturan > Pemakaian (`/usage`), audit log viewer, role viewer read-only, tombol "Batalkan import", ekspor CSV, audit performa penuh dengan `seed:perf` dan perbaiki yang melewati anggaran. Tes aksesibilitas dasar & responsif HP.

**DoD:** seluruh anggaran `performance.md` lolos; checklist `deploy.md` §8 tercentang.

---
## Prompt serbaguna
**Bug:** "Baca `AGENTS.md`. Bug: <gejala>. Reproduksi dengan test dulu, perbaiki akar masalah, jangan ubah perilaku lain. Jelaskan penyebabnya."
**Audit cepat:** "Audit kecepatan halaman <X> dengan seed:perf. Laporkan: ukuran bundle, jumlah request, row-read per aksi, interaksi > 100 ms. Usulkan perbaikan berurutan dampak."
**Fitur baru:** "Tambahkan <fitur>. Mulai dengan menulis aturan bisnis di `docs/business-rules.md` (ID baru) dan test; baru implementasi."

## Urutan jika waktu terbatas (jalur tercepat ke manfaat nyata)
Fase 0 → 1 → 2 → 3 → 4 → 5 → (pakai harian!) → 7 → 6 → 8 → 9 → 10. Setelah Fase 5 aplikasi sudah menggantikan inti spreadsheet (stok + masuk + keluar); sisanya bisa menyusul sambil dipakai.
