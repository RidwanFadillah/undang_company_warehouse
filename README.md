# ERP Toko Online — "Gudang Cepat"

Web ERP untuk mengelola beberapa toko online (Shopee, TikTok Shop, dll): stok master, barang masuk dari supplier/maklun, barang keluar dari pesanan marketplace, retur, utang supplier, keuangan, dan laporan bulanan. Menggantikan spreadsheet **"Sistem Pencatatan Barang"**.

> **Prinsip #1: CEPAT.** Tidak ada loading yang terasa. Semua keputusan teknis di repo ini tunduk pada satu tujuan: setiap klik terasa instan (< 100 ms), halaman pertama muncul < 1 detik.

## Stack (semua gratis, bisa dipakai untuk usaha)

| Lapisan | Pilihan | Kenapa |
|---|---|---|
| Hosting + API | **Cloudflare Workers** (static assets + Hono) | Edge global, tanpa cold start berarti, satu deploy untuk web + API |
| Database | **Cloudflare D1** (SQLite) | Gratis 5 GB, 5 jt row-read/hari, 100 rb row-write/hari |
| Frontend | **React + Vite + TypeScript** SPA | Tanpa SSR, pindah halaman instan |
| Data client | **TanStack Query + cache IndexedDB** | Buka app langsung tampil dari cache, sinkron di belakang |
| Tabel | **TanStack Table + Virtual** | 10.000+ baris tetap mulus |
| UI | **Tailwind + shadcn/ui** | Ringan, mudah di-vibe-code |
| Auth | **Cloudflare Access** (email OTP) | Gratis, nol CPU di Worker |

Alasan lengkap + batas free tier: lihat [`docs/arch.md`](docs/arch.md).

## Urutan baca (juga urutan konteks untuk agent)

1. [`AGENTS.md`](AGENTS.md) — aturan wajib untuk agent Antigravity
2. [`docs/arch.md`](docs/arch.md) — arsitektur & keputusan teknis
3. [`docs/business-rules.md`](docs/business-rules.md) — aturan bisnis hasil bedah spreadsheet (**jantung proyek**)
4. [`docs/database.md`](docs/database.md) + [`db/migrations/0001_init.sql`](db/migrations/0001_init.sql) — skema data
5. [`docs/api.md`](docs/api.md) — kontrak endpoint
6. [`docs/design.md`](docs/design.md) — UI/UX
7. [`docs/performance.md`](docs/performance.md) — anggaran kecepatan & cara menjaganya
8. [`docs/migration.md`](docs/migration.md) — pindahkan data dari spreadsheet
9. [`docs/deploy.md`](docs/deploy.md) — setup Cloudflare & deploy
10. [`docs/roadmap.md`](docs/roadmap.md) — fase build + prompt siap tempel

## Mulai di Antigravity

1. Buat folder repo kosong, salin seluruh isi folder ini ke dalamnya (`AGENTS.md` harus di root).
2. Buka folder di Antigravity. Pakai mode **Planning** untuk fase besar, **Fast** untuk perbaikan kecil.
3. Buka [`docs/roadmap.md`](docs/roadmap.md), tempel prompt **Fase 0**, lanjut fase demi fase. Jangan loncat fase.
4. Satu fase = satu conversation agent = satu commit. Cek Definition of Done sebelum lanjut.

## Perintah (setelah Fase 0)

```bash
npm run dev          # vite + wrangler dev (D1 lokal)
npm run test         # vitest: aturan bisnis wajib hijau
npm run db:migrate   # terapkan migrasi ke D1 lokal
npm run db:migrate:remote
npm run deploy       # build + wrangler deploy
```

## Ruang lingkup

**Masuk MVP:** stok master (matriks size × warna), barang masuk (beli & maklun), import pesanan Shopee/TikTok → barang keluar otomatis, mapping SKU, antrean random/request, pesanan batal, retur, buku utang supplier, maklun, pengeluaran operasional, rekap penjualan & biaya marketplace, laporan bulanan, kalkulator harga.

**Di luar MVP:** integrasi API marketplace otomatis, multi-gudang, modul affiliate/reseller (proyek terpisah), payroll penuh.
