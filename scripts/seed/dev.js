import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const sqlPath = path.resolve(__dirname, 'dev.sql');

console.log('Generating dev seed data (52 variants, stores, partners, fee profiles, movements)...');

const now = Date.now();
const statements = [];

statements.push('PRAGMA foreign_keys = OFF;');

// Temporarily drop delete trigger to allow clean re-seed
statements.push(`
DROP TRIGGER IF EXISTS trg_mov_no_delete;
DROP TRIGGER IF EXISTS trg_mov_no_update;
DELETE FROM stock_movements;
DELETE FROM stock_balance;
DELETE FROM sku_mappings;
DELETE FROM variants;
DELETE FROM products;
DELETE FROM partners;
DELETE FROM stores;
DELETE FROM fee_profiles;
CREATE TRIGGER trg_mov_no_update BEFORE UPDATE ON stock_movements
BEGIN SELECT RAISE(ABORT, 'stock_movements is append-only'); END;
CREATE TRIGGER trg_mov_no_delete BEFORE DELETE ON stock_movements
BEGIN SELECT RAISE(ABORT, 'stock_movements is append-only'); END;
`);

// 1. Stores
const stores = [
  { id: 1, code: 'shopee-ucci-kids', name: 'Shopee Ucci Kids', channel: 'shopee' },
  { id: 2, code: 'tiktok-helmawati', name: 'TikTok Helmawati', channel: 'tiktok' },
  { id: 3, code: 'tokopedia-ucci', name: 'Tokopedia Ucci Kids', channel: 'tokopedia' },
  { id: 4, code: 'offline-gudang', name: 'Toko Offline Gudang', channel: 'offline' },
];

for (const s of stores) {
  statements.push(
    `INSERT INTO stores (id, code, name, channel, is_active, updated_at) VALUES (${s.id}, '${s.code}', '${s.name}', '${s.channel}', 1, ${now});`
  );
}

// 2. Partners
const partners = [
  {
    id: 1,
    code: 'KV01',
    name: 'Konveksi Berkah Mandiri',
    type: 'konveksi',
    pic: 'Pak Asep',
    phone: '081234567890',
  },
  {
    id: 2,
    code: 'KV02',
    name: 'Maklun Sahabat Jahit',
    type: 'konveksi',
    pic: 'Bu Siti',
    phone: '081987654321',
  },
  {
    id: 3,
    code: 'SP01',
    name: 'Supplier Kain Textile Bandung',
    type: 'supplier',
    pic: 'Ko Hendra',
    phone: '082111222333',
  },
  {
    id: 4,
    code: 'SP02',
    name: 'Supplier Plastik Packing',
    type: 'supplier',
    pic: 'Pak Joko',
    phone: '081555666777',
  },
];

for (const p of partners) {
  statements.push(
    `INSERT INTO partners (id, code, name, type, pic, phone, is_active, updated_at) VALUES (${p.id}, '${p.code}', '${p.name}', '${p.type}', '${p.pic}', '${p.phone}', 1, ${now});`
  );
}

// 3. Fee Profiles
const feeProfiles = [
  { id: 1, name: 'Shopee Reguler', admin_pct: 4.0, service_pct: 2.0, payment_pct: 1.0 },
  { id: 2, name: 'Shopee Star / Mall', admin_pct: 5.5, service_pct: 2.5, payment_pct: 1.0 },
  { id: 3, name: 'TikTok Shop / Tokopedia', admin_pct: 4.5, service_pct: 1.5, payment_pct: 1.0 },
];

for (const f of feeProfiles) {
  statements.push(
    `INSERT INTO fee_profiles (id, name, admin_pct, service_pct, payment_pct, updated_at) VALUES (${f.id}, '${f.name}', ${f.admin_pct}, ${f.service_pct}, ${f.payment_pct}, ${now});`
  );
}

// 4. Products & Variants (52 variants total)
const productsData = [
  {
    id: 1,
    sku: 'CD-COWOK',
    name: 'CD Cowok Segitiga',
    category: 'Celana Dalam',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Hitam', 'Abu', 'Navy'],
    hpp: 3500,
    price: 8500,
  },
  {
    id: 2,
    sku: 'LEGGING-PANJANG',
    name: 'Legging Panjang Anak',
    category: 'Celana',
    sizes: ['M', 'L', 'XL', 'XXL'],
    colors: ['Hitam', 'Coklat', 'Marun'],
    hpp: 12000,
    price: 24000,
  },
  {
    id: 3,
    sku: 'KAOS-POLOS-ANAK',
    name: 'Kaos Polos Anak Katun',
    category: 'Kaos',
    sizes: ['S', 'M', 'L'],
    colors: ['Putih', 'Merah', 'Kuning', 'Hijau'],
    hpp: 15000,
    price: 32000,
  },
  {
    id: 4,
    sku: 'SETELAN-RAYON',
    name: 'Setelan Rayon Motif Anak',
    category: 'Setelan',
    sizes: ['AllSize'],
    colors: ['Mocca', 'Sage', 'Dusty', 'Hitam'],
    hpp: 28000,
    price: 55000,
  },
  {
    id: 5,
    sku: 'DRESS-KATUN',
    name: 'Dress Katun Bunga',
    category: 'Dress',
    sizes: ['S', 'M', 'L'],
    colors: ['Pink', 'Lilac', 'Mint', 'Peach'],
    hpp: 22000,
    price: 48000,
  },
];

let variantId = 1;
let movementId = 1;

for (const p of productsData) {
  statements.push(
    `INSERT INTO products (id, sku, name, category, is_active, updated_at) VALUES (${p.id}, '${p.sku}', '${p.name}', '${p.category}', 1, ${now});`
  );

  for (const size of p.sizes) {
    for (const color of p.colors) {
      const vId = variantId++;
      const minStock = 20;
      statements.push(
        `INSERT INTO variants (id, product_id, size, color, hpp, sell_price, min_stock, is_active, updated_at) ` +
          `VALUES (${vId}, ${p.id}, '${size}', '${color}', ${p.hpp}, ${p.price}, ${minStock}, 1, ${now});`
      );

      const initialQty = 50 + ((vId * 7) % 150);
      statements.push(
        `INSERT INTO stock_movements (id, variant_id, moved_on, kind, qty_delta, unit_cost, created_at) ` +
          `VALUES (${movementId++}, ${vId}, '2026-10-01', 'opening', ${initialQty}, ${p.hpp}, ${now});`
      );
    }
  }
}

// 5. SKU Mappings
statements.push(`
INSERT INTO sku_mappings (id, store_id, store_sku, variation_key, product_id, size, color, qty_multiplier, map_type, updated_at) VALUES
  (1, 1, 'CD-COWOK-3PCS', 'Size S', 1, 'S', NULL, 3, 'bundle', ${now}),
  (2, 1, 'CD-COWOK-3PCS', 'Size M', 1, 'M', NULL, 3, 'bundle', ${now}),
  (3, 1, 'LEGGING-HITAM', 'L', 2, 'L', 'Hitam', 1, 'pasti', ${now}),
  (4, 2, 'TIKTOK-DRESS-PINK', 'S', 5, 'S', 'Pink', 1, 'pasti', ${now});
`);

statements.push('PRAGMA foreign_keys = ON;');

const fullSql = statements.join('\n');
fs.writeFileSync(sqlPath, fullSql);

// Direct execution via SQLite database file
const d1Dir = path.resolve(projectRoot, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
if (fs.existsSync(d1Dir)) {
  const sqliteFile = fs.readdirSync(d1Dir).find((f) => f.endsWith('.sqlite'));
  if (sqliteFile) {
    const dbPath = path.join(d1Dir, sqliteFile);
    const db = new DatabaseSync(dbPath);
    db.exec(fullSql);
    console.log(`✅ Dev seed applied directly to local D1 SQLite (${sqliteFile})!`);
    process.exit(0);
  }
}

// Fallback to wrangler CLI
try {
  execSync('npx.cmd wrangler d1 execute erp-db --local --yes --file=scripts/seed/dev.sql', {
    stdio: 'inherit',
    cwd: projectRoot,
  });
  console.log('\n✅ Dev seed successfully applied to local D1 database!');
} catch (err) {
  console.error('\n❌ Failed to apply dev seed:', err.message);
  process.exit(1);
}
