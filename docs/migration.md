# migration.md — Pindah dari Spreadsheet

Sumber: `Salinan_dari_Sistem_Pencacatan_barang.xlsx` (sheet: Stok Barang, Barang Masuk, Barang Keluar, Antrean_Random, Pesanan_Batal, Import_Pesanan, Transaksi Penjualan, Buku_Utang_Supplier, Pengeluaran Operasional, Data Barang Retur, Daftar Mitra, Maklun_*, Mapping_SKU, Kalkulator_Harga, dll).

## 1. Strategi: **cutover** dengan stok awal hasil opname (direkomendasikan)
Alasan: (a) 72 varian stok minus di spreadsheet menandakan riwayat stok lama tidak bersih; memindahkannya hanya memindahkan kekacauan; (b) menghemat kuota tulis D1 (100 rb row/hari).

1. **Pilih hari cutover** (mis. awal bulan). Hentikan input ke spreadsheet pada hari itu.
2. **Opname fisik** → angka itu jadi movement `opening` per varian (bukan Sisa Stok spreadsheet). Template CSV `varian,qty_fisik` diekspor dari aplikasi.
3. Pindahkan **master & saldo kerja**: produk, varian (+HPP), toko, mitra, mapping SKU, utang supplier, batch maklun yang masih berjalan, riwayat keuangan.
4. Riwayat barang masuk/keluar **tidak** dipindah; spreadsheet lama diarsipkan (read-only). Laporan sebelum cutover tetap dari arsip.
5. *(Opsional, Fase 9b)* Impor riwayat barang keluar/masuk untuk laporan HPP historis; lihat anggaran tulis di §5.

## 2. Pemetaan & pembersihan per sheet

| Sheet → tabel | Aturan pembersihan |
|---|---|
| Stok Barang → `products`, `variants` | `sku = UPPER(nama)`; `size` & `warna` kosong → `'-'`; **HPP = nilai terhitung** (hasil rumus `32000/12`), bukan teks rumus; kategori kosong → NULL; 889 varian / 52 produk |
| Daftar Mitra → `partners` | `ID Mitra`→`code`; tipe Konveksi/Toko online → enum; trim spasi ("Sri Collections ") |
| Mapping_SKU → `sku_mappings` | 4.549 baris; tipe: Varian Pasti→`pasti`, Random/Request→`random`, Bundle Paket→`bundle`, Setelan→`setelan`; nama toko → `stores`; `Qty Pengali` → `qty_multiplier`; simpan `Keterangan` ke `note`. **Periksa 10 contoh `Setelan` dulu (K-3)** |
| Buku_Utang_Supplier → `supplier_invoices`/`supplier_payments` | 8 baris. Nilai pembelian berupa rumus penjumlahan → ambil hasilnya; catat rincian di `note`. Tanggal nota/jatuh tempo "-" → NULL. Tiap baris: 1 invoice (nilai) + 1 pembayaran (dibayar) |
| Pengeluaran Operasional → `expenses` | ±52 baris; map `Kategori`, `Metode`→`pay_source` (Kas Induk / Perputaran Toko), `Jenis Transaksi`→`txn_type`; `Pelunasan Bon Supplier` otomatis → `supplier_payments` (R-61) |
| Transaksi Penjualan → `sales_settlements` | Baris harian per toko; "Reseller - Oubada kids" → toko `reseller` |
| Maklun_Titip/Setor/Bayar → `maklun_*` | Baru 3 batch berjalan (BT-1..3, Teh Heti); Setor & Bayar hampir kosong |
| Data Barang Retur → `returns` | Hampir kosong |
| Kalkulator_Harga → `fee_profiles` + `settings` | 5 profil potongan; default packing/margin/diskon |
| Import_Pesanan / Pesanan_Batal / Antrean_Random | **Tidak dimigrasi** (data operasional harian); antrean random yang masih terbuka diselesaikan di spreadsheet sebelum cutover |
| Dashboard_Shopee, Analisis Bulanan, Rekap_Keuangan_Eksekutif, Daftar SKU, List_Validasi, Calc_Dashboard | Tidak dimigrasi (hasil hitung; diganti laporan app) |
| income tiktok 22 sep 2026 | Contoh format untuk parser importer TikTok (Fase 7); bukan data migrasi |

Normalisasi toko untuk semua sheet: huruf kecil + trim → pemetaan ke 4 toko resmi + `reseller`. Teks "Marketplace" tanpa nama toko → minta dipilih manual (jangan ditebak).

## 3. Cara menjalankan
Skrip di `scripts/migrate/` (dibuat agent pada Fase 9, lihat `roadmap.md`) (Python + openpyxl, `data_only=True` agar dapat nilai hasil rumus):

```bash
python scripts/migrate/extract.py  path/ke/spreadsheet.xlsx  out/       # → JSON bersih per tabel + laporan anomali
python scripts/migrate/to_sql.py   out/ db/seed/                        # → file SQL berpotongan (≤ 3.000 row/file)
npm run db:seed:local                                                    # uji di D1 lokal dulu
npm run db:seed:remote                                                   # setelah lolos checksum
```
`extract.py` wajib menghasilkan `out/anomalies.md`: baris dengan SKU/size/warna tak cocok master, toko tak dikenal, angka negatif/aneh, duplikat kunci varian.

## 4. Checksum (angka dari spreadsheet saat ini — harus cocok setelah migrasi)
| Cek | Nilai yang diharapkan |
|---|---|
| Jumlah varian / produk | 889 / 52 |
| Jumlah mapping SKU | 4.549 (3.554 pasti · 596 random · 308 bundle · 91 setelan) |
| Total tagihan supplier | Rp 393.822.000 |
| Total terbayar | Rp 241.957.000 |
| **Sisa utang** | **Rp 151.865.000** |
| Total pengeluaran operasional (semua bulan) | Rp 309.806.995 · 52 transaksi |
| Mitra | 9 |

Setelah opname, cek: `/api/stock/integrity` kosong dan Σ stok × HPP dilaporkan di Pengaturan > Valuasi. (Untuk membandingkan dengan spreadsheet sebelum opname: Σ Sisa Stok × HPP spreadsheet = Rp 324.542.605 **termasuk** varian minus.)

## 5. Anggaran tulis D1 (batas free 100.000 row-write/hari, dihitung termasuk index)
| Bagian | Perkiraan row-write |
|---|---|
| Master (produk, varian, mitra, toko, fee) + opening + saldo | ± 6.000 |
| Mapping SKU 4.549 (+ unique index) | ± 9.500 |
| Keuangan (utang, pengeluaran, settlement, maklun) | ± 1.500 |
| **Total cutover** | **± 17.000 (17%)** → aman 1 hari |
| *(Opsional 9b)* riwayat barang keluar 2.065 + masuk 649 + movement | + ± 25.000 |

Jalankan potongan SQL berurutan dan berhenti jika ada error; jangan mengulang seluruh seed (gunakan `INSERT … ON CONFLICT DO NOTHING` + kunci bisnis). Bila mendekati batas: lanjutkan besok (reset 07.00 WIB) atau aktifkan Workers Paid sebulan lalu hentikan.

## 6. Verifikasi manual (wajib, 30 menit)
- Bandingkan 20 varian acak: nama, size, warna, HPP.
- Buka 5 mapping tiap tipe; uji import 1 file pesanan kecil end-to-end (hasilkan `siap_keluar`, `menunggu_fisik`, `perlu_mapping` sesuai harapan).
- Jalankan "Cek integritas" dan cocokkan checksum §4.
- Simpan **backup** (`wrangler d1 export`) sebelum mulai memakai harian.

## 7. Rencana mundur
Spreadsheet lama tetap utuh (arsip). Jika ada masalah serius dalam 2 minggu pertama: ekspor stok dari app (`/api/export/stock.csv`) dan kembali ke spreadsheet sambil memperbaiki.
