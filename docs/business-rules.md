# business-rules.md — Aturan Bisnis (hasil bedah spreadsheet)

Dokumen ini adalah **sumber kebenaran** perilaku aplikasi. Semua rumus diambil dari sheet *Sistem Pencatatan Barang* lalu dirapikan. Tiap aturan punya ID (`R-xx`) agar bisa dirujuk di test dan commit.

## 0. Gambaran usaha (dari data)
- 4 toko online: **Shopee Ucci Kids, Shopee Helmawati, TikTok Ucci Kids, TikTok Helmawati** + penjualan reseller (mis. "Reseller - Oubada kids").
- 52 produk induk, 889 varian (size × warna). Contoh: CD (celana dalam), singlet, tank top, legging, manset, leopard, jennie.
- Barang datang dari 2 jalur: **beli putus/grosir** dan **maklun** (bahan dititip ke konveksi, hasil jadi disetor).
- Mitra (9): 8 konveksi (Mang Dadan, A Ayi, A Ade, Teh Siti, Teh Dini, Teh Heti, A Epi, Sri Collections) + 1 toko online (Gemi).

## 1. Satuan & angka
- **R-01** Satuan dasar **pcs**. 1 lusin = 12 pcs. Lusin hanya tampilan/input (kolom "…/lusin" di sheet lama = pcs ÷ 12).
- **R-02** Input barang masuk boleh dalam lusin atau pcs (pilih satuan per baris); disimpan pcs (`pcs = lusin × 12`).
- **R-03** Uang = integer rupiah. HPP per pcs boleh pecahan (mis. 32.000 ÷ 12 = 2.666,67); total baris = `round(qty × hpp)`.

## 2. Stok
- **R-10** `Sisa Stok = Stok Awal + Total Masuk − Total Keluar` (semua pcs). Diimplementasi sebagai jumlah `stock_movements`, disimpan di `stock_balance`.
- **R-11** `Total Modal Stok = Sisa Stok × HPP`. Varian dengan stok minus **tidak dihitung** ke total modal (di sheet lama stok minus mengurangi modal secara menyesatkan).
- **R-12** **Stok minus diperbolehkan** (`allow_negative_stock=1`), karena penjualan sering dicatat sebelum barang masuk dicatat. Tapi harus **terlihat**: badge merah + halaman "Perlu Koreksi". Di data sekarang **72 dari 889 varian minus** (mis. CD Cowok S −591, Manset Hitam M −226).
- **R-13** **Stock opname**: pengguna memasukkan hitungan fisik; selisih menjadi movement `adjust` dengan catatan. Ini jalan resmi untuk membereskan stok minus.
- **R-14** Stok rendah: `qty <= min_stock` (default 0 = nonaktif) → tandai kuning.
- **R-15** Tampilan matriks: baris = produk × warna, kolom = size, sel = qty. Warna sel: minus merah, rendah kuning, nol abu. Toggle pcs/lusin.

## 3. HPP (harga pokok)
- **R-20** HPP disimpan per varian (`variants.hpp`, rupiah per pcs). Di sheet lama HPP ditulis manual sebagai rumus (`=32000/12`) dan biasanya **sama untuk satu size** pada produk tertentu (mis. CD Cowok S 32.000/lusin, M 33.000, L 34.000, XL 35.000). Aplikasi menyediakan **"Atur HPP per size"** untuk satu produk sekali jalan.
- **R-21** Saat barang keluar, simpan **`hpp_snapshot`** dan `cogs = round(qty × hpp_snapshot)`. HPP terjual tidak pernah dihitung ulang dari HPP terbaru.
- **R-22** HPP barang masuk **beli** = harga beli per pcs yang diinput. HPP barang masuk **maklun** = `(bahan terpakai + tagihan jahit) ÷ qty setor OK` (kolom "HPP Maklun per Pcs" di Rekap Maklun).
- **R-23** Metode default = **standar** (HPP varian diedit manual, ada riwayat di `audit_log`). Opsi nanti: rata-rata bergerak. Jangan diubah tanpa keputusan pemilik.

## 4. Barang masuk
- **R-30** Sumber: `beli` (supplier/grosir) atau `maklun`. Satu dokumen = banyak baris varian, 1 mitra, 1 tanggal.
- **R-31** Entri harus secepat spreadsheet: grid keyboard, tempel (paste) dari clipboard, autocomplete SKU lokal, default tanggal hari ini & mitra terakhir dipakai.
- **R-32** Barang masuk dari konveksi dengan tagihan → boleh membuat `supplier_invoices` otomatis (nilai = Σ qty × unit_cost).
- **R-33** "Default Supplier" per varian (kolom turunan `TEXTJOIN/UNIQUE` di sheet) = daftar mitra yang pernah memasok varian itu; dihitung lewat query, **tidak disimpan**.
- **R-34** Void dokumen masuk → movement lawan; tidak boleh edit angka langsung setelah disimpan (hanya void + input ulang, atau koreksi lewat opname).

## 5. Pesanan marketplace & barang keluar
### 5.1 Import
- **R-40** Format baku baris import: `Tanggal | Toko | No. Resi/Order ID | SKU Toko | Variasi/Size | Qty | Status | Catatan Pembeli`. Parser Shopee dan TikTok memetakan kolom asli ke format ini **di browser**.
- **R-41** **Idempoten**: kunci `(store_id, order_no)` dan `(order_id, line_no)`. Import ulang file yang sama hanya memperbarui status; tidak menggandakan barang keluar.
- **R-42** Normalisasi toko: nama bebas ("shopee ucci kids", "Shopee Ucci Kids", "Marketplace") → `stores`. Teks tak dikenal → pengguna memilih toko saat preview. (Data lama punya 12 variasi penulisan; "Marketplace" muncul 163× di pesanan batal dan 89× di barang keluar tanpa toko jelas.)
- **R-43** Normalisasi status:

| Teks marketplace | `status` |
|---|---|
| Belum Bayar | `belum_bayar` |
| Perlu Dikirim / Perlu dikirim | `perlu_dikirim` |
| Sedang Dikirim / Dikirim / Telah Dikirim | `dikirim` |
| Selesai | `selesai` |
| Batal / Dibatalkan / Pembatalan diajukan | `batal` |

Teks asli selalu disimpan di `raw_status`.

### 5.2 Mapping SKU toko → master gudang
- **R-44** Kunci cari: `(store_id, store_sku, variation_key)` → `sku_mappings`. Tipe di data sekarang (4.549 baris): **pasti 3.554**, **random/request 596**, **bundle 308**, **setelan 91**.
- **R-45** **Pengali** (`qty_multiplier`: 1, 3, 4, 5, 6, 12): `pcs fisik = qty pesanan × pengali`. Contoh: "3 PCS RANDOM" × 10 pesanan = 30 pcs. "1 lusin" = pengali 12.
- **R-46** Hasil resolusi tiap `order_line`:
  - `pasti` / `bundle` → `siap_keluar` (varian jelas).
  - `random` → `menunggu_fisik` (masuk **Antrean Random**): admin memilih warna/varian fisik yang dikirim, total harus = pcs fisik.
  - tak ada mapping → `perlu_mapping`: admin membuat mapping dari layar yang sama (sekali buat, berlaku seterusnya).
  - `setelan` → satu baris pesanan menghasilkan beberapa varian. **Asumsi:** tiap komponen adalah satu baris mapping dengan SKU/size/warna sendiri. *Verifikasi dengan contoh nyata dari sheet sebelum Fase 4.*
- **R-47** Perubahan mapping **tidak** mengubah barang keluar yang sudah diproses (snapshot).

### 5.3 Kapan stok keluar
- **R-48** Stok keluar saat admin menekan **Proses** (setting `deduct_stock_on='proses'`, sesuai rutinitas "rekap barang keluar"). Hanya pesanan `perlu_dikirim`/`dikirim`/`selesai` yang `siap_keluar` yang bisa diproses. `belum_bayar` dan `batal` tidak pernah mengeluarkan stok.
- **R-49** Proses = 1 batch atomik: tulis `outbound_items` (+`hpp_snapshot`) + movement `sale`, set `orders.stock_state='keluar'`. Tombol "Proses semua yang siap" + hitungan sisa antrean.
- **R-50** Barang keluar manual (offline/WhatsApp/reseller) tanpa pesanan: form cepat, `order_line_id` kosong, `store_id` = tujuan.

### 5.4 Batal & retur
- **R-51** Pesanan jadi `batal` saat import ulang:
  - `stock_state='belum'` → `aman` (tidak ada yang perlu dilakukan; ini padanan "Batal (Stok Aman)").
  - `stock_state='keluar'` → buat baris `returns` dengan `restock_state='belum'` (butuh cek fisik). **Tidak** otomatis restok.
- **R-52** Retur: admin memeriksa kondisi → `bagus` + **Restok** (movement `return_in`) atau `rusak` → `dibuang` (tanpa movement). KPI: total retur, bagus, rusak, belum restok.
- **R-53** Halaman Pesanan Batal = filter `status='batal'` dengan alasan/catatan; untuk audit dan analisis alasan batal.

## 6. Utang supplier & maklun
- **R-60** `Sisa Utang = Σ tagihan − Σ pembayaran` per mitra. Status `LUNAS` jika sisa ≤ 0.
- **R-61** Pengeluaran bertipe **Pelunasan Bon Supplier** otomatis membuat `supplier_payments` (satu input, dua laporan; tidak diketik dua kali).
- **R-62** Alur maklun: **Titip** (bahan, nilai) → **Setor** (qty OK, reject, bahan terpakai, tarif jahit per pcs) → **Bayar** (DP/pelunasan). Rekap per batch:
  - `Sisa Aset Bahan = nilai bahan titip − bahan terpakai`
  - `Sisa Utang Baju (pcs) = target − disetor − reject`
  - `Tagihan Jahit = Σ (tarif × qty OK)`; `Sisa Utang Uang = tagihan − dibayar`
  - `HPP Maklun/pcs = (bahan terpakai + tagihan jahit) ÷ total disetor`
- **R-63** Setor maklun otomatis membuat dokumen barang masuk `maklun` dengan HPP dari R-22.

## 7. Keuangan harian
- **R-70** `Penghasilan Diterima = Omzet Kotor − Diskon Toko − Retur/Refund − Biaya Marketplace` (rekap per toko per hari).
- **R-71** Pengeluaran punya `pay_source`: **Kas Induk** atau **Perputaran Toko**, dan `txn_type`: operasional, gaji & komisi, pelunasan bon, belanja bahan & stok, biaya maklun, cicilan pinjaman.
- **R-72** `Sisa Kas Induk = modal kas induk (setting, saat ini 500.000.000) − Σ pengeluaran bersumber Kas Induk`.
- **R-73** Importer income TikTok: file income dijumlah per hari (komisi, biaya layanan, biaya pembayaran, diskon penjual, refund) → `sales_settlements` sumber `import_tiktok`. Unik per `(toko, tanggal, sumber)` agar import ulang menimpa, bukan menggandakan.

## 8. Kalkulator harga (dari sheet Kalkulator_Harga)
Parameter potongan per channel (default dari sheet): Shopee Reguler 4% + 4% + 1% = 9%; Shopee Star/Mall 6,5% + 4% + 1% = 11,5%; TikTok/Tokopedia 6% + 3,5% + 1% = 10,5%; Lazada 5% + 3% + 1% = 9%; Offline/Reseller 0%.

```
modal          = HPP + biaya_packing                    (HPP kosong → fallback 2500)
target_laba    = round(modal × target_margin%)
harga_coret    = ceil100( (modal + target_laba) / (1 − potongan% − diskon_event%) )
harga_checkout = ceil100( harga_coret × (1 − diskon_event%) )
bottom_price   = ceil100( modal / (1 − potongan%) )      // di bawah ini rugi
```
`ceil100` = bulatkan ke atas kelipatan 100. **Beda dengan sheet lama:** potongan memakai channel yang **dipilih**, bukan selalu Shopee Star/Mall. Default: packing 1.500, margin 30%, diskon event 10%. Fungsi murni di `shared/rules/price.ts` + test dengan angka sheet.

## 9. Laporan bulanan (dari Analisis Bulanan & Rekap Eksekutif)
```
Pendapatan Bersih = Omzet Kotor − Diskon − Retur
HPP Terjual       = Σ cogs barang keluar bulan itu          (snapshot, R-21)
Laba Kotor        = Pendapatan Bersih − HPP Terjual
Beban Operasional = Admin Marketplace + Iklan + Gaji & Komisi + Operasional Toko  [+ Biaya Maklun, lihat §10]
Laba Bersih       = Laba Kotor − Beban Operasional
```
Metrik pendamping (bukan laba): Modal Restok Grosir (Σ nilai barang masuk bulan itu), Belanja Bahan Kain, Pelunasan Bon Supplier, margin kotor %, HPP % dari pendapatan bersih. Filter: bulan, toko. Dashboard per toko: omzet, penjualan bersih, jumlah pesanan unik, produk terjual, AOV, performa per SKU, top 10 wilayah (jika data wilayah diimpor).

## 10. Cacat di spreadsheet lama (jangan ditiru)
1. **HPP terjual per bulan salah:** rasio global `Σ Barang Keluar / Σ Penjualan` (semua bulan) dikali pendapatan tiap bulan → laba bulanan tidak akurat. Aplikasi memakai snapshot per baris (R-21).
2. **Stok minus tidak terkontrol** (72 varian) dan ikut mengurangi total modal. → R-11, R-12, R-13.
3. **Nama toko tidak konsisten** (12 variasi tulisan) → tabel `stores` + normalisasi (R-42).
4. **Rumus tertanam di data** (HPP `=32000/12`, nilai tagihan `=58719500+1814000+…`). → simpan angka; tagihan lama dimigrasi sebagai total + catatan rincian.
5. **Formula berat** (`SUMIFS` kolom penuh, `FILTER/UNIQUE` array) yang membuat sheet lambat → ledger + saldo.
6. **Kolom Kategori kosong semua** (0 dari 889 varian) → opsional di app, isi bertahap.
7. **Risiko hitung ganda biaya maklun** (lihat §11, K-1).

## 11. Keputusan yang perlu dikonfirmasi pemilik
| ID | Pertanyaan | Default sementara |
|---|---|---|
| K-1 | Biaya maklun masuk **HPP** (via batch) atau **beban operasional**? Jangan keduanya (hitung ganda). | Masuk HPP; baris `biaya_maklun` di pengeluaran **tidak** dihitung ke beban |
| K-2 | Stok keluar saat **Proses** atau saat status **Dikirim**? | Proses (R-48) |
| K-3 | Mapping `setelan`: apakah 1 baris = 1 komponen? (R-46) | Ya, dicek dengan contoh nyata |
| K-4 | "Pembatalan diajukan" dianggap batal? | Ya, tidak mengeluarkan stok |
| K-5 | HPP: standar manual atau rata-rata bergerak? | Standar manual |
| K-6 | Reseller/affiliate: di app ini atau proyek terpisah? | Terpisah; app ini hanya punya toko `reseller` sebagai tujuan barang keluar |
| K-7 | Siapa saja pengguna & role-nya? | 1 owner + admin gudang |
