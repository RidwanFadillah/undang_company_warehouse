# design.md — UI/UX

Pengguna: pemilik + admin gudang. Dipakai berjam-jam untuk **entri cepat** (resi, barang keluar, barang masuk), sering di laptop, kadang di HP. Prioritas: **kecepatan entri > keindahan > fitur**. Rasa yang dicari: seperti spreadsheet yang cepat, tapi tidak bisa salah rumus.

## 1. Prinsip
1. **Keyboard-first.** Tab/Enter pindah sel, `Ctrl+K` palet perintah (cari SKU, lompat halaman), `Ctrl+S` simpan dokumen, `Esc` batal, `N` baris baru.
2. **Tidak ada layar loading.** Data cache tampil dulu (lihat `performance.md`).
3. **Satu layar = satu pekerjaan.** Rutinitas harian (cetak resi → catat keuangan → rekap barang keluar) punya jalan pintas dari Dashboard.
4. **Kesalahan murah diperbaiki.** Semua simpan bisa di-*undo* beberapa detik (toast "Batalkan"); dokumen lama di-void, bukan dihapus.
5. **Angka selalu terbaca.** Format `Rp 1.234.567`, pemisah ribuan titik, tabular-nums; qty tampil pcs dengan toggle lusin.
6. **Padat tapi tenang.** Tabel rapat (baris 32 px), warna hanya untuk status.

## 2. Navigasi
Sidebar kiri (ikon + label; ciut jadi ikon di layar kecil; bottom tab bar di HP):

`Dashboard` · `Stok` · `Barang Masuk` · `Pesanan & Keluar` (badge: jumlah antrean) · `Antrean Random` · `Retur & Batal` · `Supplier & Maklun` · `Keuangan` · `Laporan` · `Kalkulator Harga` · `Mapping SKU` · `Pengaturan`

Bar atas: pencarian global (`Ctrl+K`), pemilih bulan, indikator sinkron (titik hijau/kuning/merah) dan nama pengguna.

## 3. Layar utama

### Dashboard
Kartu ringkas hari ini: **Perlu diproses** (n pesanan siap keluar), **Antrean random** (n), **Perlu mapping** (n), **Retur belum restok** (n), **Stok minus** (n), **Utang supplier** (Rp). Tiap kartu = tautan langsung ke daftar kerjanya. Di bawah: omzet bulan ini vs bulan lalu per toko (sparkline SVG ringan), 5 SKU terlaris minggu ini.

### Stok (matriks)
```
 Produk: LEOPARD                         [pcs | lusin]  [cari…]  [Hanya minus] [Stok rendah]
 Warna \ Size    XS    S     M     L     XL        Total   Nilai (HPP)
 Dusty Pink      -1    117  -54    37    79         178    …
 Mocca Hitam     –     190   13    35    84         322    …
 Navy            –     194   93    73    38         398    …
```
- Baris = produk × warna, kolom = size (hanya size yang dipakai produk itu). Sel merah = minus, kuning = rendah, abu = 0.
- Klik sel → panel kanan: kartu stok varian (movement terbaru), HPP, tombol **Koreksi/Opname**, **Barang masuk cepat**.
- Mode "Daftar" (tabel datar semua varian, kolom bisa disort, virtualized) untuk ekspor/cek.
- Tombol **Atur HPP per size** per produk (satu form, banyak size).

### Barang Masuk (grid entri)
Header dokumen: tanggal (default hari ini), sumber (Beli/Maklun), mitra, satuan default (pcs/lusin). Di bawah: grid mirip spreadsheet:

| SKU (autocomplete) | Size | Warna | Qty | Satuan | HPP/pcs | Nilai |
|---|---|---|---|---|---|---|
Fitur: **tempel dari clipboard** (Excel/Sheets), `Enter` turun baris, autocomplete berbasis cache lokal, total berjalan di footer, tombol **Simpan (Ctrl+S)**; centang "Buat tagihan supplier". Setelah simpan, baris kosong baru otomatis dengan mitra/tanggal yang sama.

### Pesanan & Keluar (jantung harian)
**Wizard import 3 langkah, satu layar:**
1. **Seret file** (xlsx/csv Shopee atau TikTok) + pilih toko (otomatis terdeteksi bila bisa).
2. **Preview** tabel hasil parse: baris hijau (otomatis siap keluar), kuning (random → antrean), merah (perlu mapping). Ringkasan di atas: "148 baris · 131 siap · 12 random · 5 perlu mapping · 3 batal".
3. **Proses**: tombol besar "Proses 131 yang siap". Selesai → ringkasan + tautan ke Antrean Random / Perlu Mapping.

Di bawah wizard: daftar pesanan (filter toko, tanggal, status, state stok) dengan aksi massal. Tombol **Barang keluar manual** (offline/WA/reseller) membuka grid seperti Barang Masuk.
**Perlu mapping** diselesaikan inline: baris merah → klik → pilih produk/size/warna (+ pengali, tipe) → simpan → semua baris sejenis otomatis ikut resolve.

### Antrean Random
Kartu per baris pesanan: toko, no. pesanan, variasi, "butuh 6 pcs (2 × 3)". Pemilih fisik: stepper per warna yang **hanya menampilkan warna ber-stok**; total harus = pcs fisik (indikator hijau saat pas). Tombol "Selesai & keluarkan". Shortcut: angka untuk memilih warna terbanyak.

### Retur & Batal
Dua tab. **Batal**: daftar audit (toko, resi, SKU, qty, alasan, state stok). **Retur**: kartu "belum diproses" dengan tombol besar **Bagus → Restok** / **Rusak → Buang**; KPI total, bagus, rusak, belum restok.

### Supplier & Maklun
- Tab **Utang**: tabel mitra (tagihan, dibayar, sisa, status LUNAS/BELUM) + tombol bayar cepat.
- Tab **Maklun**: daftar batch (BT-n) dengan progres setor (bar), sisa bahan, sisa utang pcs/uang. Detail batch: timeline Titip → Setor → Bayar, HPP/pcs.

### Keuangan
Tab **Penjualan** (rekap harian per toko + import income TikTok), **Pengeluaran** (grid entri + filter bulan; KPI total, terbesar, jumlah transaksi), **Kas** (modal kas induk, terpakai, sisa).

### Laporan
Pemilih bulan/tahun. **Rekap bulanan** (tabel 12 bulan: omzet → laba bersih), **Eksekutif** (kartu omzet bersih, HPP, laba kotor, beban, laba bersih, modal kerja), **Per toko** (omzet, bersih, pesanan unik, unit, AOV, performa SKU). Grafik: garis/batang ringan (uPlot atau SVG), di-lazy-load.

### Kalkulator Harga
Dua panel: kiri parameter (channel, HPP, packing, margin, diskon event) → kanan hasil langsung (harga coret, harga checkout, **bottom price**, laba bersih per unit). Tabel semua varian dengan harga rekomendasi; tombol "Terapkan ke harga jual".

## 4. Komponen & token
- **shadcn/ui** dipakai selektif: Button, Input, Select, Dialog, Sheet, Tabs, Toast, Command (palet), Badge, Tooltip. Tanpa komponen berat bila ada alternatif native.
- **Grid entri**: komponen sendiri `EntryGrid` (sel input uncontrolled, paste handler, validasi saat blur).
- **DataTable**: TanStack Table + Virtual, kolom sticky, sort/filter lokal.
- Token warna (CSS variables, mode terang/gelap): `--bg`, `--surface`, `--border`, `--text`, `--muted`, `--primary` (biru-hijau tenang), `--ok`, `--warn`, `--danger`. Status: ok=hijau, warn=kuning, danger=merah; jangan pakai merah untuk hal selain minus/error.
- Tipografi: font sistem; angka `font-variant-numeric: tabular-nums`. Skala 12/13/14/16/20/28.
- Ikon: lucide per-ikon.

## 5. Keadaan & pesan
- **Kosong:** satu kalimat + satu tombol aksi ("Belum ada pesanan. Import file pertama").
- **Galat:** pesan manusiawi + apa yang bisa dilakukan; galat `LIMIT` (kuota D1) = banner kuning "Batas harian database tercapai, reset pukul 07.00 WIB".
- **Sinkron:** titik status; saat offline: "Menyimpan di perangkat, akan dikirim saat online".
- **Konfirmasi** hanya untuk aksi berisiko (void dokumen, proses massal). Selain itu tidak ada dialog "Apakah Anda yakin".

## 6. Responsif & aksesibilitas
- Desktop (≥1024): sidebar + panel detail kanan. Tablet: sidebar ciut. HP: bottom tab (Dashboard, Stok, Pesanan, Keuangan, Lainnya), grid entri diganti **kartu entri satu-baris** dengan tombol besar.
- Target sentuh ≥ 44 px di HP, kontras AA, fokus terlihat, semua aksi bisa lewat keyboard, label `aria` pada tabel & grid.
- Teks UI Bahasa Indonesia; tanggal `29 Okt 2026`; zona WIB.

## 7. Daftar kecil "yang membuat terasa cepat"
Optimistic UI · fokus otomatis ke sel pertama · Enter menyimpan baris & turun · ingat pilihan terakhir (toko, mitra, satuan) · skeleton hanya bila > 150 ms · transisi ≤ 120 ms atau tanpa transisi · hasil import tampil bertahap per 100 baris.
