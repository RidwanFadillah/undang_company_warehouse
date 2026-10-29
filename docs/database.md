# database.md — Skema Data

Sumber kebenaran skema: [`db/migrations/0001_init.sql`](../db/migrations/0001_init.sql) (sudah diuji di SQLite: trigger saldo & proteksi append-only berfungsi). Dokumen ini menjelaskan **kenapa** bentuknya begitu dan padanannya dengan sheet lama.

## Peta sheet → tabel

| Sheet spreadsheet | Tabel baru | Catatan |
|---|---|---|
| Stok Barang | `products` + `variants` + `stock_balance` (+ `stock_movements`) | Kolom hitungan (Total Masuk, Keluar, Sisa) tidak disimpan di baris; saldo dijaga trigger |
| Barang Masuk | `inbound_docs` + `inbound_lines` → `stock_movements` | Sumber `beli` / `maklun` |
| Barang Keluar | `outbound_items` → `stock_movements` | Menyimpan `hpp_snapshot` |
| Import_Pesanan | `orders` + `order_lines` (+ `import_batches`) | Idempoten lewat `UNIQUE(store_id, order_no)` |
| Antrean_Random | `order_lines.resolve_state = 'menunggu_fisik'` (+ `'perlu_mapping'`) | Bukan tabel terpisah, cukup filter |
| Pesanan_Batal | `orders.status = 'batal'` + `stock_state` | `aman` = batal sebelum stok keluar; `dikembalikan` = batal setelah keluar |
| Mapping_SKU | `sku_mappings` | `map_type`: pasti / random / bundle / setelan |
| Data Barang Retur | `returns` | |
| Transaksi Penjualan, income tiktok | `sales_settlements` | Rekap harian per toko; importer TikTok menjumlahkan per hari |
| Pengeluaran Operasional | `expenses` | + `settings.kas_induk_modal` |
| Buku_Utang_Supplier | `supplier_invoices` + `supplier_payments` | Sisa utang = tagihan − pembayaran (dihitung, bukan disimpan) |
| Maklun_Titip / Setor / Bayar / Rekap | `maklun_batches` / `maklun_receipts` / `maklun_payments` | Rekap = query agregat |
| Daftar Mitra | `partners` | |
| Daftar SKU, List_Validasi | (hilang) | Cukup query dari `products`/`variants` |
| Kalkulator_Harga | `fee_profiles` + fungsi murni di `shared/rules/price.ts` | |
| Analisis Bulanan, Rekap_Keuangan_Eksekutif, Dashboard_Shopee | Query laporan (`/api/reports/*`) | Tidak ada tabel; lihat `business-rules.md` §9 |

## Pola penting

### 1. Ledger stok + saldo
- Semua perubahan stok = **INSERT** ke `stock_movements` (`qty_delta` + masuk, − keluar, selalu **pcs**).
- Trigger `trg_mov_ai` meng-upsert `stock_balance`. UPDATE/DELETE pada movement ditolak trigger.
- **Void** dokumen = tulis movement lawan (`kind='void'`, `qty_delta` berlawanan) + isi `voided_at` pada dokumen. Tidak ada penghapusan.
- Stok awal (migrasi) = movement `opening`.
- Rekonsiliasi kapan saja: `SELECT variant_id, SUM(qty_delta) FROM stock_movements GROUP BY variant_id` harus sama dengan `stock_balance.qty`. Jadikan tes otomatis + tombol "Cek integritas" di Pengaturan.

### 2. Satu kunci varian
`UNIQUE(product_id, size, color)` dengan default `'-'` untuk produk tanpa size/warna (sama seperti sheet lama yang memakai "-"). Pencarian cepat dilakukan di client dengan key `SKU|SIZE|WARNA` (huruf besar, trim).

### 3. Sync delta
Tabel yang di-sync ke client punya `updated_at` ber-index: `products`, `variants`, `stock_balance`, `stores`, `partners`, `sku_mappings`, `fee_profiles`. Client menyimpan cursor per tabel. **Master tidak di-hard-delete** sehingga tombstone tidak diperlukan.

### 4. Pesanan & stok
`orders.stock_state`: `belum` → `keluar` (saat diproses) → `dikembalikan` (batal setelah keluar). `aman` = batal sebelum pernah keluar. Ini menggantikan teks "Batal (Stok Aman)" di sheet lama. Satu `order_line` bisa menghasilkan banyak `outbound_items` (bundle/random/setelan).

### 5. Kolom turunan (generated)
`sewing_bill` dan `net_received` memakai `GENERATED ALWAYS AS ... STORED` supaya tidak bisa tidak konsisten.

### 6. Index (jangan ditambah sembarangan)
Setiap index menambah row-write (kuota 100 rb/hari). Index yang ada sudah menutup: filter tanggal, riwayat per varian, antrean per state, lookup referensi. Tambah index baru hanya setelah `EXPLAIN QUERY PLAN` menunjukkan full scan pada tabel > 1.000 baris.

## Query referensi (siap pakai)

```sql
-- Matriks stok (client juga menyimpan ini di cache)
SELECT p.sku, v.id, v.size, v.color, v.hpp, COALESCE(b.qty,0) AS qty
FROM variants v JOIN products p ON p.id = v.product_id
LEFT JOIN stock_balance b ON b.variant_id = v.id
WHERE v.is_active = 1;

-- Delta sync
SELECT variant_id, qty, updated_at FROM stock_balance WHERE updated_at > ?1;

-- Sisa utang per supplier
SELECT p.name,
       COALESCE((SELECT SUM(amount) FROM supplier_invoices i WHERE i.partner_id=p.id AND i.voided_at IS NULL),0)
     - COALESCE((SELECT SUM(amount) FROM supplier_payments s WHERE s.partner_id=p.id),0) AS sisa
FROM partners p WHERE p.type IN ('konveksi','supplier');

-- Antrean random + perlu mapping
SELECT l.id, o.order_no, s.name AS toko, l.store_sku, l.variation, l.qty, l.resolve_state
FROM order_lines l JOIN orders o ON o.id=l.order_id JOIN stores s ON s.id=o.store_id
WHERE l.resolve_state IN ('menunggu_fisik','perlu_mapping') ORDER BY o.order_date;
```

## Aturan migrasi skema
- Migrasi bernomor `000N_nama.sql`, hanya maju. Jangan edit yang sudah diterapkan.
- Perubahan kolom di D1/SQLite: `ALTER TABLE ... ADD COLUMN` aman; ubah tipe/hapus kolom → buat tabel baru + salin (di migrasi sendiri).
- Setiap migrasi besar: `wrangler d1 export` dulu (lihat `deploy.md`).
