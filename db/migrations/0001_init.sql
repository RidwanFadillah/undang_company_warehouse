-- 0001_init.sql — skema awal ERP Toko Online (SQLite / Cloudflare D1)
-- Konvensi: uang = INTEGER rupiah; hpp/unit_cost per pcs = REAL; tanggal bisnis = 'YYYY-MM-DD' (WIB);
-- *_at = epoch milidetik. Master data tidak di-hard-delete (is_active).
PRAGMA foreign_keys = ON;

-- ============ USER & PENGATURAN ============
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','admin','viewer')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,            -- mis. 'kas_induk_modal', 'deduct_stock_on'
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  user_email TEXT,
  action TEXT NOT NULL,            -- 'void_inbound','adjust_stock','edit_hpp',...
  entity TEXT NOT NULL,
  entity_id INTEGER,
  detail TEXT                      -- JSON ringkas
);
CREATE INDEX idx_audit_at ON audit_log(at);

-- ============ MASTER ============
CREATE TABLE stores (              -- toko/channel: Shopee Ucci Kids, TikTok Helmawati, ...
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,       -- 'shopee-ucci-kids'
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('shopee','tiktok','tokopedia','lazada','offline','reseller')),
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE partners (            -- Daftar Mitra: konveksi/maklun, supplier, reseller
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE,                -- 'KV01'
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('konveksi','supplier','reseller','toko_online')),
  pic TEXT,
  phone TEXT,
  note TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE products (            -- induk: CD COWOK, LEGGING PANJANG, LEOPARD, ...
  id INTEGER PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,        -- UPPER(name), kunci bisnis
  name TEXT NOT NULL,
  category TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE variants (            -- sel di matriks: produk × size × warna
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  size TEXT NOT NULL DEFAULT '-',
  color TEXT NOT NULL DEFAULT '-',
  hpp REAL NOT NULL DEFAULT 0,     -- rupiah per pcs saat ini
  sell_price INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  UNIQUE (product_id, size, color)
);
CREATE INDEX idx_variants_updated ON variants(updated_at);

CREATE TABLE fee_profiles (        -- Kalkulator_Harga: potongan marketplace
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,       -- 'Shopee Reguler','Shopee Star / Mall','TikTok Shop / Tokopedia',...
  admin_pct REAL NOT NULL DEFAULT 0,
  service_pct REAL NOT NULL DEFAULT 0,
  payment_pct REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- ============ STOK (LEDGER) ============
CREATE TABLE stock_movements (     -- append-only
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  moved_on TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN
    ('opening','purchase','maklun_in','sale','return_in','cancel_restock','adjust','void')),
  qty_delta INTEGER NOT NULL CHECK (qty_delta <> 0),   -- + masuk, - keluar (pcs)
  unit_cost REAL NOT NULL DEFAULT 0,
  ref_type TEXT,                   -- 'inbound_doc','outbound_item','return','adjustment'
  ref_id INTEGER,
  note TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_mov_variant_date ON stock_movements(variant_id, moved_on);
CREATE INDEX idx_mov_date ON stock_movements(moved_on);
CREATE INDEX idx_mov_ref ON stock_movements(ref_type, ref_id);

CREATE TABLE stock_balance (       -- saldo per varian, DIISI TRIGGER, jangan di-UPDATE manual
  variant_id INTEGER PRIMARY KEY REFERENCES variants(id),
  qty INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_balance_updated ON stock_balance(updated_at);

CREATE TRIGGER trg_mov_ai AFTER INSERT ON stock_movements
BEGIN
  INSERT INTO stock_balance (variant_id, qty, updated_at)
  VALUES (NEW.variant_id, NEW.qty_delta, NEW.created_at)
  ON CONFLICT(variant_id) DO UPDATE
    SET qty = stock_balance.qty + excluded.qty,
        updated_at = excluded.updated_at;
END;
CREATE TRIGGER trg_mov_no_update BEFORE UPDATE ON stock_movements
BEGIN SELECT RAISE(ABORT, 'stock_movements is append-only'); END;
CREATE TRIGGER trg_mov_no_delete BEFORE DELETE ON stock_movements
BEGIN SELECT RAISE(ABORT, 'stock_movements is append-only'); END;

-- ============ MAKLUN ============
CREATE TABLE maklun_batches (      -- Maklun_Titip: bahan dititipkan ke konveksi
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,       -- 'BT-1'
  batch_date TEXT NOT NULL,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  material_name TEXT NOT NULL,     -- 'Kain Spandek'
  material_qty REAL NOT NULL DEFAULT 0,
  material_unit TEXT,              -- 'roll'
  material_value INTEGER NOT NULL DEFAULT 0,
  target_product_id INTEGER REFERENCES products(id),
  target_pcs INTEGER,
  status TEXT NOT NULL DEFAULT 'berjalan' CHECK (status IN ('berjalan','selesai','batal')),
  note TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE maklun_receipts (     -- Maklun_Setor: hasil jadi disetor konveksi
  id INTEGER PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES maklun_batches(id),
  receipt_date TEXT NOT NULL,
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  qty_ok INTEGER NOT NULL CHECK (qty_ok >= 0),
  qty_reject INTEGER NOT NULL DEFAULT 0,
  material_used INTEGER NOT NULL DEFAULT 0,          -- Rp bahan terpakai
  sewing_rate INTEGER NOT NULL DEFAULT 0,            -- Rp per pcs
  sewing_bill INTEGER GENERATED ALWAYS AS (sewing_rate * qty_ok) STORED,
  inbound_doc_id INTEGER REFERENCES inbound_docs(id),
  voided_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_mrec_batch ON maklun_receipts(batch_id);

CREATE TABLE maklun_payments (     -- Maklun_Bayar
  id INTEGER PRIMARY KEY,
  pay_date TEXT NOT NULL,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  batch_id INTEGER REFERENCES maklun_batches(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  kind TEXT NOT NULL DEFAULT 'pelunasan' CHECK (kind IN ('dp','pelunasan')),
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_mpay_batch ON maklun_payments(batch_id);

-- ============ UTANG SUPPLIER ============
CREATE TABLE supplier_invoices (   -- Buku_Utang_Supplier: tagihan
  id INTEGER PRIMARY KEY,
  invoice_no TEXT,
  invoice_date TEXT,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  amount INTEGER NOT NULL,
  due_date TEXT,
  note TEXT,
  voided_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_sinv_partner ON supplier_invoices(partner_id);

CREATE TABLE supplier_payments (
  id INTEGER PRIMARY KEY,
  pay_date TEXT NOT NULL,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  invoice_id INTEGER REFERENCES supplier_invoices(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT,
  expense_id INTEGER,              -- tautan ke pengeluaran (hindari input ganda)
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_spay_partner ON supplier_payments(partner_id);

-- ============ BARANG MASUK ============
CREATE TABLE inbound_docs (
  id INTEGER PRIMARY KEY,
  doc_no TEXT UNIQUE,
  doc_date TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('beli','maklun')),
  partner_id INTEGER REFERENCES partners(id),
  batch_id INTEGER REFERENCES maklun_batches(id),
  invoice_id INTEGER REFERENCES supplier_invoices(id),
  note TEXT,
  voided_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_inb_date ON inbound_docs(doc_date);

CREATE TABLE inbound_lines (
  id INTEGER PRIMARY KEY,
  doc_id INTEGER NOT NULL REFERENCES inbound_docs(id),
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  qty INTEGER NOT NULL CHECK (qty > 0),            -- pcs
  unit_cost REAL NOT NULL DEFAULT 0
);
CREATE INDEX idx_inl_doc ON inbound_lines(doc_id);
CREATE INDEX idx_inl_variant ON inbound_lines(variant_id);

-- ============ PESANAN & BARANG KELUAR ============
CREATE TABLE sku_mappings (        -- Mapping_SKU
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  store_sku TEXT NOT NULL,
  variation_key TEXT NOT NULL DEFAULT '',          -- variasi marketplace ternormalisasi
  product_id INTEGER NOT NULL REFERENCES products(id),
  size TEXT,
  color TEXT,                                      -- NULL = pilih saat fisik (random)
  qty_multiplier INTEGER NOT NULL DEFAULT 1,       -- pengali bundle
  map_type TEXT NOT NULL CHECK (map_type IN ('pasti','random','bundle','setelan')),
  note TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE (store_id, store_sku, variation_key)
);

CREATE TABLE import_batches (      -- satu kali upload file; dasar tombol "Batalkan import"
  id INTEGER PRIMARY KEY,
  store_id INTEGER REFERENCES stores(id),
  filename TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  voided_at INTEGER
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  order_no TEXT NOT NULL,          -- No. Resi / Order ID
  ordered_at TEXT NOT NULL,        -- ISO WIB
  order_date TEXT NOT NULL,        -- 'YYYY-MM-DD'
  status TEXT NOT NULL CHECK (status IN
    ('belum_bayar','perlu_dikirim','dikirim','selesai','batal')),
  raw_status TEXT,                 -- teks asli marketplace
  buyer_note TEXT,
  stock_state TEXT NOT NULL DEFAULT 'belum'
    CHECK (stock_state IN ('belum','keluar','aman','dikembalikan')),
  import_batch_id INTEGER REFERENCES import_batches(id),
  updated_at INTEGER NOT NULL,
  UNIQUE (store_id, order_no)
);
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_orders_status ON orders(status, stock_state);

CREATE TABLE order_lines (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  line_no INTEGER NOT NULL,
  store_sku TEXT NOT NULL,
  variation TEXT,                  -- teks variasi asli
  qty INTEGER NOT NULL CHECK (qty > 0),
  mapping_id INTEGER REFERENCES sku_mappings(id),
  resolve_state TEXT NOT NULL DEFAULT 'baru'
    CHECK (resolve_state IN ('baru','siap_keluar','menunggu_fisik','perlu_mapping','selesai')),
  UNIQUE (order_id, line_no)
);
CREATE INDEX idx_lines_state ON order_lines(resolve_state);

CREATE TABLE outbound_items (      -- Barang Keluar (fisik)
  id INTEGER PRIMARY KEY,
  out_date TEXT NOT NULL,
  store_id INTEGER REFERENCES stores(id),          -- tujuan
  order_line_id INTEGER REFERENCES order_lines(id),
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  qty INTEGER NOT NULL CHECK (qty > 0),            -- pcs
  hpp_snapshot REAL NOT NULL,
  cogs INTEGER NOT NULL,                           -- round(qty * hpp_snapshot)
  note TEXT,
  voided_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_out_date ON outbound_items(out_date);
CREATE INDEX idx_out_variant ON outbound_items(variant_id, out_date);
CREATE INDEX idx_out_line ON outbound_items(order_line_id);

CREATE TABLE returns (             -- Data Barang Retur
  id INTEGER PRIMARY KEY,
  return_date TEXT NOT NULL,
  store_id INTEGER REFERENCES stores(id),
  order_no TEXT,
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  qty INTEGER NOT NULL CHECK (qty > 0),
  reason TEXT,
  condition TEXT NOT NULL CHECK (condition IN ('bagus','rusak')),
  restock_state TEXT NOT NULL DEFAULT 'belum' CHECK (restock_state IN ('belum','restok','dibuang')),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_ret_state ON returns(restock_state);

-- ============ KEUANGAN ============
CREATE TABLE sales_settlements (   -- Transaksi Penjualan: rekap per toko per hari
  id INTEGER PRIMARY KEY,
  settle_date TEXT NOT NULL,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  gross_sales INTEGER NOT NULL DEFAULT 0,
  store_discount INTEGER NOT NULL DEFAULT 0,
  refunds INTEGER NOT NULL DEFAULT 0,
  marketplace_fees INTEGER NOT NULL DEFAULT 0,
  net_received INTEGER GENERATED ALWAYS AS
    (gross_sales - store_discount - refunds - marketplace_fees) STORED,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import_tiktok','import_shopee')),
  note TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (store_id, settle_date, source)
);
CREATE INDEX idx_set_date ON sales_settlements(settle_date);

CREATE TABLE expenses (            -- Pengeluaran Operasional
  id INTEGER PRIMARY KEY,
  exp_date TEXT NOT NULL,
  category TEXT NOT NULL,          -- 'Transport & Logistik','Bahan Baku','Gaji & Komisi','Perlengkapan Packing','Iklan & Ads','Lain-lain'
  description TEXT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  pay_source TEXT NOT NULL CHECK (pay_source IN ('kas_induk','perputaran_toko')),
  txn_type TEXT NOT NULL CHECK (txn_type IN
    ('operasional','gaji_komisi','pelunasan_bon','belanja_bahan_stok','biaya_maklun','cicilan_pinjaman')),
  partner_id INTEGER REFERENCES partners(id),
  note TEXT,
  voided_at INTEGER,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_exp_date ON expenses(exp_date);
CREATE INDEX idx_exp_type ON expenses(txn_type, exp_date);

-- Seed minimal
INSERT INTO settings(key, value, updated_at) VALUES
  ('kas_induk_modal', '500000000', 0),
  ('deduct_stock_on', 'proses', 0),         -- 'proses' | 'dikirim'
  ('allow_negative_stock', '1', 0);
