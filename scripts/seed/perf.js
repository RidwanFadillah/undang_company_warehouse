import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const sqlPath = path.resolve(__dirname, 'perf.sql');

console.log('Generating perf seed data: 900 variants across 50 products and 20,000 movements...');

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
DELETE FROM stores;
DELETE FROM partners;
DELETE FROM fee_profiles;
CREATE TRIGGER trg_mov_no_update BEFORE UPDATE ON stock_movements
BEGIN SELECT RAISE(ABORT, 'stock_movements is append-only'); END;
CREATE TRIGGER trg_mov_no_delete BEFORE DELETE ON stock_movements
BEGIN SELECT RAISE(ABORT, 'stock_movements is append-only'); END;
`);

// Stores
statements.push(`
INSERT INTO stores (id, code, name, channel, is_active, updated_at) VALUES
  (1, 'shopee-ucci', 'Shopee Ucci Kids', 'shopee', 1, ${now}),
  (2, 'tiktok-helma', 'TikTok Helmawati', 'tiktok', 1, ${now}),
  (3, 'tokopedia-ucci', 'Tokopedia Ucci', 'tokopedia', 1, ${now}),
  (4, 'offline-gudang', 'Toko Offline Gudang', 'offline', 1, ${now});
`);

// Partners
statements.push(`
INSERT INTO partners (id, code, name, type, is_active, updated_at) VALUES
  (1, 'KV01', 'Konveksi Berkah Mandiri', 'konveksi', 1, ${now}),
  (2, 'SP01', 'Supplier Kain Bandung', 'supplier', 1, ${now});
`);

// 50 Products x 3 Sizes x 6 Colors = 900 Variants
const sizes = ['S', 'M', 'L'];
const colors = ['Hitam', 'Putih', 'Navy', 'Marun', 'Abu', 'Mocca'];

let variantId = 1;
const variantList = [];

for (let p = 1; p <= 50; p++) {
  const sku = `SKU-PROD-${String(p).padStart(3, '0')}`;
  const name = `Produk Busana Seri ${p}`;
  const category = p % 2 === 0 ? 'Pakaian Anak' : 'Pakaian Dewasa';
  statements.push(
    `INSERT INTO products (id, sku, name, category, is_active, updated_at) VALUES (${p}, '${sku}', '${name}', '${category}', 1, ${now});`
  );

  for (const s of sizes) {
    for (const c of colors) {
      const vId = variantId++;
      const hpp = 15000 + ((p * 500) % 30000);
      const sellPrice = hpp * 2;
      statements.push(
        `INSERT INTO variants (id, product_id, size, color, hpp, sell_price, min_stock, is_active, updated_at) ` +
          `VALUES (${vId}, ${p}, '${s}', '${c}', ${hpp}, ${sellPrice}, 20, 1, ${now});`
      );
      variantList.push({ id: vId, hpp });
    }
  }
}

// 20,000 movements using chunked multi-row inserts (100 rows per INSERT)
let movId = 1;
const movementRows = [];

// 1. Initial 900 opening movements
for (const v of variantList) {
  const qty = 100 + ((v.id * 3) % 200);
  movementRows.push(`(${movId++}, ${v.id}, '2026-10-01', 'opening', ${qty}, ${v.hpp}, ${now})`);
}

// 2. Remaining 19,100 movements
const kinds = ['sale', 'sale', 'sale', 'purchase', 'return_in'];
for (let i = 0; i < 19100; i++) {
  const v = variantList[i % 900];
  const kind = kinds[i % kinds.length];
  let qtyDelta = 0;
  if (kind === 'sale') qtyDelta = -((i % 5) + 1);
  else if (kind === 'purchase') qtyDelta = (i % 20) + 10;
  else if (kind === 'return_in') qtyDelta = (i % 2) + 1;

  movementRows.push(
    `(${movId++}, ${v.id}, '2026-10-15', '${kind}', ${qtyDelta}, ${v.hpp}, ${now + i})`
  );
}

// Chunk into 100 rows per INSERT statement for rapid execution
const CHUNK_SIZE = 100;
for (let i = 0; i < movementRows.length; i += CHUNK_SIZE) {
  const chunk = movementRows.slice(i, i + CHUNK_SIZE);
  statements.push(
    `INSERT INTO stock_movements (id, variant_id, moved_on, kind, qty_delta, unit_cost, created_at) VALUES\n` +
      chunk.join(',\n') +
      ';'
  );
}

statements.push('PRAGMA foreign_keys = ON;');

const fullSql = statements.join('\n');
fs.writeFileSync(sqlPath, fullSql);

console.log(`perf.sql generated with ${statements.length} statements.`);
console.log(
  'Applying perf seed to local D1 (applying 20,000 movements and updating stock_balance)...'
);

// Direct execution via SQLite database file
const d1Dir = path.resolve(projectRoot, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
if (fs.existsSync(d1Dir)) {
  const sqliteFile = fs.readdirSync(d1Dir).find((f) => f.endsWith('.sqlite'));
  if (sqliteFile) {
    const dbPath = path.join(d1Dir, sqliteFile);
    const start = performance.now();
    const db = new DatabaseSync(dbPath);
    db.exec(fullSql);
    const duration = ((performance.now() - start) / 1000).toFixed(2);
    console.log(
      `\n✅ Perf seed applied directly to local D1 SQLite in ${duration}s! 900 variants and 20,000 movements loaded.`
    );
    process.exit(0);
  }
}

// Fallback to wrangler CLI
try {
  execSync('npx.cmd wrangler d1 execute erp-db --local --yes --file=scripts/seed/perf.sql', {
    stdio: 'inherit',
    cwd: projectRoot,
  });
  console.log('\n✅ Perf seed successfully applied! 900 variants and 20,000 movements loaded.');
} catch (err) {
  console.error('\n❌ Failed to apply perf seed:', err.message);
  process.exit(1);
}
