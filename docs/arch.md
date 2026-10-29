# arch.md — Arsitektur

## 1. Tujuan arsitektur
1. **Cepat terasa**: interaksi < 100 ms, buka app < 1 detik, tanpa spinner layar penuh.
2. **Gratis & boleh untuk usaha**: tanpa kartu kredit untuk mulai, tanpa database yang "tidur".
3. **Benar**: stok & HPP tidak boleh salah hitung (spreadsheet lama punya banyak stok minus dan HPP global yang salah — lihat `business-rules.md`).
4. **Mudah di-vibe-code**: sedikit bagian bergerak, satu bahasa (TypeScript) dari DB sampai UI.

## 2. Gambaran besar

```
 Browser (React SPA)                         Cloudflare edge
┌──────────────────────────┐   HTTPS   ┌─────────────────────────────┐
│ UI  ──► TanStack Query   │◄─────────►│ Worker (Hono)               │
│          │  ▲            │  /api/*   │  - verifikasi JWT Access    │
│   IndexedDB cache        │           │  - zod validate             │
│   (master+stok+mapping)  │           │  - DB.batch() atomik        │
│ Parse xlsx/csv di client │           │            │                │
└──────────────────────────┘           │            ▼                │
        ▲  static assets (CDN)         │      D1 (SQLite, APAC)      │
        └──────────────────────────────┴─────────────────────────────┘
        Cloudflare Access (email OTP) berdiri di depan seluruh domain
```

Satu Worker melayani **file statis SPA** dan **`/api/*`**. Tidak ada server yang perlu dijaga.

## 3. Kenapa stack ini (dan batas free tier-nya)

Angka di bawah diverifikasi dari dokumentasi/changelog Cloudflare per Okt 2026. **Cek ulang di dashboard sebelum go-live**, karena bisa berubah.

| Layanan | Batas free | Dampak ke desain |
|---|---|---|
| Workers | 100.000 request/hari, **10 ms CPU/request** | Worker harus tipis. Tanpa hashing password, tanpa parsing file besar. |
| D1 | 5 GB, **5 jt row-read/hari, 100 rb row-write/hari**. Sejak 1 Sep 2026 query **gagal** jika batas harian lewat (reset 00:00 UTC = 07:00 WIB) | Hemat row-read: cache di client + sync delta. Hemat row-write: batch & index seperlunya. |
| Access (Zero Trust) | Gratis untuk tim kecil (cek batas user terbaru) | Auth tanpa kode password sendiri |

### Anggaran kapasitas (perkiraan dari ukuran data spreadsheet saat ini)
Data sekarang: 889 varian (52 produk), 2.065 baris barang keluar, 649 baris barang masuk, 4.549 mapping SKU, ±1.420 pesanan batal, ±830 baris import pesanan.
- Seluruh master + stok ≈ **< 500 KB JSON** → muat penuh di memori browser.
- Hari sibuk: 600 baris pesanan × ±5 row-write (order, line, outbound, movement, balance) ≈ **3.000 write** (3% kuota).
- Row-read: sync delta hanya membaca baris berubah. 5 pengguna × 100 sync/hari × ±50 baris ≈ **25.000 read** (0,5% kuota).
- Migrasi awal data (± 15.000 row + index) bisa dekat 100 rb write → **lakukan bertahap, jangan sekaligus** (lihat `migration.md`).

### Jalur naik jika kuota sempit
Workers Paid ($5/bulan) menghapus batas harian D1 dan memberi CPU jauh lebih besar. Itu satu-satunya biaya yang mungkin muncul; arsitektur tidak perlu diubah.

## 4. Keputusan arsitektur (ADR singkat)

**ADR-1 — Cloudflare Workers + D1, bukan Vercel/Supabase.**
- Vercel Hobby setahu saya untuk pemakaian non-komersial; ini usaha, jadi berisiko melanggar ToS (verifikasi di syarat Vercel).
- Supabase free: project bisa di-*pause* saat tidak aktif dan cold start terasa → bertentangan dengan tujuan cepat.
- Workers + D1: tidak tidur, request dilayani dekat pengguna, DB satu platform. Set DB ke wilayah **APAC** (`--location apac`) karena pengguna di Indonesia.
- Cadangan jika D1 tidak cocok: Turso (libSQL) atau Neon (Postgres) — skema di `database.md` portabel karena SQL standar.

**ADR-2 — SPA, bukan SSR/Next.js.** Ini aplikasi internal di balik login; SEO tidak perlu. SPA + cache lokal memberi navigasi instan dan menghindari CPU server.

**ADR-3 — Local-first read model.** Master (produk, varian, toko, mitra, mapping) + `stock_balance` di-cache penuh di IndexedDB. App render dari cache dulu, lalu `GET /api/sync?since=<cursor>` mengambil hanya baris yang berubah. Pencarian, filter, dan matriks stok = nol request jaringan.

**ADR-4 — Stok = ledger append-only + saldo denormalisasi.** `stock_movements` (tidak boleh UPDATE/DELETE) + `stock_balance` diperbarui oleh **trigger SQLite**. Baca stok = 1 baris per varian, bukan `SUMIFS` ribuan baris seperti di spreadsheet. Audit lengkap, koreksi lewat movement baru.

**ADR-3b — Tanpa ORM.** ORM menambah bundle dan CPU di Worker 10 ms. Query hot-path ditulis SQL langsung dengan helper bertipe; validasi lewat zod.

**ADR-5 — Parsing file di browser.** Export Shopee/TikTok (.xlsx/.csv) dibaca di client (SheetJS, di-lazy-load), dinormalisasi, divalidasi, lalu dikirim sebagai JSON ringkas dalam potongan ≤ 500 baris. Worker hanya menyimpan.

**ADR-6 — Auth = Cloudflare Access.** Worker memverifikasi JWT (`jose`, verifikasi RS256 murah) dan memetakan email → role (`owner`, `admin`, `viewer`) dari tabel `users`. Alasan: PBKDF2 di Workers ≈ 66 ms CPU, jauh di atas batas 10 ms free plan.

**ADR-7 — Perhitungan bisnis = fungsi murni di `src/shared/rules/`.** Dipakai server (sumber kebenaran) dan client (preview instan, mis. kalkulator harga & pengali bundle). Satu implementasi, satu set test.

**ADR-8 — Laporan dihitung dengan SQL agregat + cache ringan.** Rekap bulanan memakai query ber-index pada `(tanggal)`; hasil bulan yang sudah lewat di-cache di client (immutable kecuali ada koreksi → `report_version` naik).

## 5. Alur data utama

**A. Import pesanan → barang keluar**
```
Browser: pilih file → parse (SheetJS) → normalisasi toko/status → POST /api/orders/import (chunk ≤500)
Worker : upsert orders+lines (idempoten) → cari sku_mappings → tiap line:
         pasti   → siap_keluar
         bundle  → siap_keluar (qty × pengali)
         random  → menunggu_fisik  (masuk Antrean Random)
         tak ada → perlu_mapping
Admin  : review → "Proses" → POST /api/orders/process
Worker : DB.batch([ outbound_items…, stock_movements(sale)… ])  → trigger update stock_balance
```

**B. Barang masuk (beli/maklun)**: `inbound_docs` + `inbound_lines` + `stock_movements(purchase|maklun_in)` dalam satu batch; jika dari supplier dengan tagihan → `supplier_invoices` otomatis.

**C. Sync client**: cursor = `max(updated_at)` yang sudah diterima. Tiap tabel master/saldo punya `updated_at` ber-index. Tombstone tidak perlu karena master tidak di-hard-delete.

## 6. Struktur kode
```
src/
  server/            # Worker (Hono)
    index.ts         # app, middleware auth, routes
    routes/*.ts      # satu file per domain (stock, inbound, orders, finance, maklun, reports)
    db/*.ts          # helper query bertipe
  web/               # SPA React
    routes/*         # halaman
    components/*     # UI & grid entry
    lib/query.ts     # TanStack Query + persister IndexedDB
    lib/import/*     # parser Shopee/TikTok (lazy)
  shared/
    schema.ts        # zod + tipe
    rules/*.ts       # aturan bisnis murni + *.test.ts
db/migrations/       # SQL bernomor
wrangler.jsonc
```

## 7. Keamanan & data
- Semua `/api/*` wajib JWT Access valid; role dicek per route (viewer = read-only).
- Audit: `audit_log` mencatat siapa mengubah apa (void dokumen, koreksi stok, edit HPP).
- Backup: D1 Time Travel (cek lama retensi di dokumentasi) + `wrangler d1 export` terjadwal mingguan ke penyimpanan pribadi. Detail di `deploy.md`.
- Tidak ada data kartu/rekening di DB; "kas" hanyalah angka pembukuan.

## 8. Risiko & mitigasi
| Risiko | Mitigasi |
|---|---|
| Kuota D1 harian habis → query gagal | Sync delta, index, batch; panel "Pemakaian" di Pengaturan menampilkan estimasi; naik ke Paid $5 bila perlu |
| Worker > 10 ms CPU | Tanpa komputasi berat; parsing di client; ukur dengan `wrangler tail` |
| Dua admin edit bersamaan | Movement append-only (tidak bentrok); edit master pakai `updated_at` optimistic check |
| Salah import (file ganda/salah toko) | Idempotensi + layar preview + tombol **Batalkan import** (void per batch import) |
