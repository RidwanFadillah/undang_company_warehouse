# api.md — Kontrak API

Base: `/api`. JSON. Semua endpoint butuh JWT Cloudflare Access (`Cf-Access-Jwt-Assertion`). Role: `owner` > `admin` (tulis) > `viewer` (baca). Validasi body dengan zod (`src/shared/schema.ts`). Error seragam:

```json
{ "error": { "code": "VALIDATION|NOT_FOUND|CONFLICT|FORBIDDEN|LIMIT", "message": "…", "details": {} } }
```
`LIMIT` = kuota D1 harian habis → UI tampilkan banner jelas, jangan retry berulang.

Aturan umum: respons transaksi **dipaginasi** (cursor `?before=<id>&limit=100`); semua tulis **atomik** (`DB.batch`); tulis mengembalikan objek baru + `cursor` agar client langsung memperbarui cache tanpa fetch ulang.

## Sync & master
| Method | Path | Keterangan |
|---|---|---|
| GET | `/sync?since=<ms>` | Baris berubah sejak cursor: `products, variants, stock, stores, partners, mappings, fee_profiles, settings`. `since` kosong = snapshot penuh. Dukung `ETag` → 304 |
| POST | `/products` · PATCH `/products/:id` | Buat/ubah produk (+ varian awal) |
| POST | `/variants/bulk` | Buat banyak varian (size × warna) sekaligus |
| PATCH | `/variants/:id` | HPP, harga jual, min stok, aktif |
| POST | `/products/:id/hpp-by-size` | `{ "S": 2666.67, "M": 2750, … }` set HPP satu produk per size |
| CRUD | `/stores`, `/partners`, `/fee-profiles` | Master kecil |
| GET/PUT | `/settings` | owner saja |

## Stok
| Method | Path | Keterangan |
|---|---|---|
| GET | `/stock/:variantId/history?before=&limit=` | Kartu stok (movements) |
| POST | `/stock/adjust` | `{ items:[{variant_id, counted_qty}], note }` → selisih jadi movement `adjust` (opname) |
| GET | `/stock/issues` | Stok minus + stok rendah |
| GET | `/stock/integrity` | Bandingkan `SUM(movements)` vs `stock_balance`; harus kosong |

## Barang masuk
| Method | Path | Body ringkas |
|---|---|---|
| POST | `/inbound` | `{ doc_date, source:'beli'|'maklun', partner_id, batch_id?, create_invoice?, note, lines:[{variant_id, qty, unit:'pcs'|'lusin', unit_cost}] }` |
| GET | `/inbound?month=2026-10&before=&limit=` | Daftar dokumen |
| POST | `/inbound/:id/void` | Movement lawan + `voided_at` |

## Pesanan & barang keluar
| Method | Path | Keterangan |
|---|---|---|
| POST | `/orders/import` | `{ store_id, filename, rows:[{order_no, ordered_at, status_raw, store_sku, variation, qty, buyer_note}] }` ≤ 500 baris/request; idempoten; mengembalikan ringkasan `{created, updated, resolved:{siap_keluar, menunggu_fisik, perlu_mapping}, canceled_safe, canceled_needs_return}` |
| POST | `/orders/import/:batchId/void` | Batalkan import (hanya jika belum diproses) |
| GET | `/orders?state=siap_keluar|menunggu_fisik|perlu_mapping&store_id=&date=` | Antrean kerja |
| POST | `/orders/process` | `{ line_ids:[…] }` atau `{ all_ready:true, store_id? }` → outbound + movement `sale` (batch atomik) |
| POST | `/orders/lines/:id/resolve-random` | `{ picks:[{variant_id, qty}] }`; jumlah harus = pcs fisik |
| POST | `/outbound` | Barang keluar manual `{ out_date, store_id, note, items:[{variant_id, qty}] }` |
| POST | `/outbound/:id/void` | |
| CRUD | `/mappings` | + `POST /mappings/bulk` untuk migrasi; `GET /mappings/suggest?store_id=&sku=&variation=` |

## Retur
| Method | Path | Keterangan |
|---|---|---|
| POST | `/returns` | Catat retur manual |
| POST | `/returns/:id/restock` | `condition:'bagus'` → movement `return_in` |
| POST | `/returns/:id/discard` | `condition:'rusak'` |
| GET | `/returns?state=belum` | |

## Utang & maklun
| Method | Path |
|---|---|
| CRUD | `/supplier-invoices`, `/supplier-payments` |
| GET | `/suppliers/debt` — sisa utang per mitra + status |
| POST | `/maklun/batches` · GET `/maklun/batches` · GET `/maklun/batches/:id/recap` |
| POST | `/maklun/receipts` — otomatis membuat dokumen masuk `maklun` (R-63) |
| POST | `/maklun/payments` |

## Keuangan
| Method | Path | Keterangan |
|---|---|---|
| CRUD | `/expenses` | `txn_type='pelunasan_bon'` otomatis membuat `supplier_payments` (R-61) |
| GET | `/cash/summary` | Modal, terpakai, sisa kas induk |
| GET/POST | `/settlements?month=&store_id=` · POST `/settlements/import` | Rekap harian; import income TikTok sudah dijumlah di client |

## Laporan
| Method | Path |
|---|---|
| GET | `/reports/monthly?year=2026` — 12 baris sesuai §9 business-rules |
| GET | `/reports/executive?month=2026-10` |
| GET | `/reports/channel?month=&store_id=` — omzet, bersih, pesanan unik, unit, AOV, per SKU |
| GET | `/reports/stock-valuation` |

## Sistem
`GET /me` (email, role) · `GET /usage` (estimasi pemakaian kuota hari ini dari hitung di Worker) · `GET /export/stock.csv` (stream, untuk cadangan manual).

## Kontrak performa API
p95 < 150 ms untuk tulis tunggal; `/sync` delta < 80 ms; tidak ada endpoint yang membaca > 5.000 row tanpa `LIMIT`. Setiap handler dites dengan fixture dan dicek `meta.rows_read` ≤ batas yang dinyatakan di komentar handler.
