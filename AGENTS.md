# AGENTS.md — Aturan Wajib untuk Agent

Proyek: web ERP toko online. Baca `README.md` lalu `docs/` sesuai fase di `docs/roadmap.md`. Jangan mengarang aturan bisnis: sumber kebenaran ada di `docs/business-rules.md`. Kalau ragu, **tanya**, jangan tebak.

## Stack (jangan diganti tanpa izin)
- Cloudflare Workers + **Hono** + **D1**. Frontend React + Vite + TS + Tailwind + shadcn/ui.
- Data client: TanStack Query (+ persist IndexedDB), TanStack Table + Virtual.
- Validasi: **zod** di setiap endpoint. Test: **vitest**.
- **Tanpa ORM.** Pakai SQL langsung via `env.DB.prepare().bind()` dan `env.DB.batch()` dengan helper bertipe di `src/server/db/`.

## Batasan keras (Workers free plan)
- CPU **10 ms per request**. DILARANG di Worker: PBKDF2/bcrypt/argon, parsing file xlsx/csv besar, loop berat, library besar. Parsing file import dilakukan **di browser** lalu kirim JSON ringkas.
- D1 free: 5 jt row-read/hari, 100 rb row-write/hari; lewat batas, query **gagal**. Karena itu: tidak ada `SELECT *` tanpa `WHERE`/`LIMIT` di endpoint transaksi, tidak ada polling agresif, semua query pakai index (cek `EXPLAIN QUERY PLAN`).
- Auth lewat Cloudflare Access: verifikasi JWT header `Cf-Access-Jwt-Assertion`, jangan bikin sistem password sendiri.

## Aturan data
1. **Uang = integer rupiah.** Pengecualian: `hpp`/`unit_cost` per pcs boleh REAL (harga lusin ÷ 12); total baris selalu `Math.round`.
2. **Satuan dasar = pcs.** Lusin hanya tampilan (÷12). Input boleh lusin, simpan pcs.
3. **Tanggal** disimpan `YYYY-MM-DD` zona **Asia/Jakarta (WIB)**; timestamp = epoch ms. Jangan pakai `new Date()` mentah untuk tanggal bisnis.
4. **Stok hanya berubah lewat `stock_movements`** (append-only). Dilarang `UPDATE stock_balance` langsung. Koreksi = movement baru (adjust/void). Trigger DB menjaga ini.
5. Setiap operasi multi-tabel **atomik** pakai `DB.batch([...])`.
6. HPP dicatat sebagai **snapshot** di baris barang keluar saat kejadian, jangan dihitung ulang dari HPP terbaru.
7. Import pesanan harus **idempoten**: kunci `(store_id, order_no, line_no)`; import ulang file yang sama tidak boleh menggandakan stok keluar.
8. Data master tidak pernah di-hard-delete: pakai `is_active = 0`.

## Aturan kode
- TypeScript strict, tanpa `any`. Satu fungsi bisnis = satu file di `src/shared/rules/` + unit test (dipakai server & client).
- Struktur: `src/server/` (Worker), `src/web/` (SPA), `src/shared/` (tipe, zod schema, aturan bisnis), `db/migrations/`.
- Migrasi: file bernomor baru di `db/migrations/`, **jangan edit migrasi yang sudah diterapkan**.
- Nama kolom/tabel `snake_case` Inggris; teks UI Bahasa Indonesia.
- Setiap fitur selesai = test hijau + `npm run build` sukses + cek anggaran di `docs/performance.md`.

## Aturan UI/kecepatan (ringkas; detail di `docs/performance.md`)
- Tidak ada spinner layar penuh. Tampilkan data cache dulu, perbarui di belakang.
- Mutasi **optimistic**; rollback + toast jika gagal.
- Tabel > 100 baris wajib virtualized. Pencarian SKU berjalan **di memori client**, bukan ke server.
- Dilarang menambah dependency > 30 KB gzip tanpa alasan tertulis di PR/commit.
- Font sistem saja. Ikon lucide per-ikon (tree-shaken).

## Cara bekerja
- Kerjakan **satu fase** dari `docs/roadmap.md` per sesi. Tulis rencana singkat dulu, lalu eksekusi.
- Jangan ubah file di `docs/` kecuali diminta; kalau menemukan konflik aturan, laporkan di akhir jawaban.
- Selesai fase: ringkas apa yang dibuat, apa yang belum, dan perintah untuk mencoba.
