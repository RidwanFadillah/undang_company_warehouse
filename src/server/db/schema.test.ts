import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

describe('Database Schema & Triggers (db/migrations/0001_init.sql)', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    // Read and apply 0001_init.sql migration
    const migrationPath = path.resolve(__dirname, '../../../db/migrations/0001_init.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    db.exec(sql);
  });

  it('(1) insert stock_movements memperbarui stock_balance dengan benar via trigger', () => {
    const now = Date.now();

    // Setup master product & variant
    db.exec(`
      INSERT INTO products (id, sku, name, is_active, updated_at)
      VALUES (1, 'KAOS-01', 'Kaos Polos', 1, ${now});

      INSERT INTO variants (id, product_id, size, color, hpp, sell_price, is_active, updated_at)
      VALUES (101, 1, 'M', 'Hitam', 25000, 50000, 1, ${now});
    `);

    // Initial stock_balance should be empty
    const initialBalance = db
      .prepare('SELECT qty FROM stock_balance WHERE variant_id = ?')
      .get(101) as { qty: number } | undefined;
    expect(initialBalance).toBeUndefined();

    // 1. Inbound stock movement: +50 pcs
    db.prepare(
      `
      INSERT INTO stock_movements (id, variant_id, moved_on, kind, qty_delta, unit_cost, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(1, 101, '2026-10-29', 'purchase', 50, 25000, now);

    const balanceAfterInbound = db
      .prepare('SELECT qty FROM stock_balance WHERE variant_id = ?')
      .get(101) as { qty: number };
    expect(balanceAfterInbound).toBeDefined();
    expect(balanceAfterInbound.qty).toBe(50);

    // 2. Outbound stock movement (sale): -20 pcs
    db.prepare(
      `
      INSERT INTO stock_movements (id, variant_id, moved_on, kind, qty_delta, unit_cost, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(2, 101, '2026-10-29', 'sale', -20, 25000, now + 1000);

    const balanceAfterSale = db
      .prepare('SELECT qty FROM stock_balance WHERE variant_id = ?')
      .get(101) as { qty: number };
    expect(balanceAfterSale.qty).toBe(30);

    // 3. Return movement: +5 pcs
    db.prepare(
      `
      INSERT INTO stock_movements (id, variant_id, moved_on, kind, qty_delta, unit_cost, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(3, 101, '2026-10-29', 'return_in', 5, 25000, now + 2000);

    const balanceAfterReturn = db
      .prepare('SELECT qty FROM stock_balance WHERE variant_id = ?')
      .get(101) as { qty: number };
    expect(balanceAfterReturn.qty).toBe(35);
  });

  it('(2) UPDATE dan DELETE pada stock_movements ditolak oleh trigger (append-only ledger)', () => {
    const now = Date.now();

    db.exec(`
      INSERT INTO products (id, sku, name, is_active, updated_at)
      VALUES (1, 'KAOS-01', 'Kaos Polos', 1, ${now});

      INSERT INTO variants (id, product_id, size, color, hpp, sell_price, is_active, updated_at)
      VALUES (101, 1, 'M', 'Hitam', 25000, 50000, 1, ${now});

      INSERT INTO stock_movements (id, variant_id, moved_on, kind, qty_delta, unit_cost, created_at)
      VALUES (1, 101, '2026-10-29', 'purchase', 50, 25000, ${now});
    `);

    // Verify UPDATE is rejected with RAISE(ABORT, 'stock_movements is append-only')
    expect(() => {
      db.prepare('UPDATE stock_movements SET qty_delta = 100 WHERE id = 1').run();
    }).toThrowError(/stock_movements is append-only/);

    // Verify DELETE is rejected with RAISE(ABORT, 'stock_movements is append-only')
    expect(() => {
      db.prepare('DELETE FROM stock_movements WHERE id = 1').run();
    }).toThrowError(/stock_movements is append-only/);

    // Ensure the original stock_movement remains unmodified
    const movement = db.prepare('SELECT qty_delta FROM stock_movements WHERE id = 1').get() as {
      qty_delta: number;
    };
    expect(movement.qty_delta).toBe(50);
  });

  it('(3) UNIQUE(product_id, size, color) pada variants bekerja', () => {
    const now = Date.now();

    db.exec(`
      INSERT INTO products (id, sku, name, is_active, updated_at)
      VALUES (1, 'LEGGING-01', 'Legging Panjang', 1, ${now});

      INSERT INTO variants (id, product_id, size, color, is_active, updated_at)
      VALUES (1, 1, 'L', 'Navy', 1, ${now});
    `);

    // Duplicate (product_id, size, color) MUST fail
    expect(() => {
      db.prepare(
        `
        INSERT INTO variants (id, product_id, size, color, is_active, updated_at)
        VALUES (2, 1, 'L', 'Navy', 1, ${now})
      `
      ).run();
    }).toThrowError(
      /UNIQUE constraint failed: variants\.product_id, variants\.size, variants\.color/
    );

    // Different size or color for the same product must succeed
    expect(() => {
      db.prepare(
        `
        INSERT INTO variants (id, product_id, size, color, is_active, updated_at)
        VALUES (3, 1, 'XL', 'Navy', 1, ${now})
      `
      ).run();
    }).not.toThrow();

    expect(() => {
      db.prepare(
        `
        INSERT INTO variants (id, product_id, size, color, is_active, updated_at)
        VALUES (4, 1, 'L', 'Maroon', 1, ${now})
      `
      ).run();
    }).not.toThrow();
  });

  it('(4) kolom net_received dan sewing_bill terhitung otomatis (STORED GENERATED COLUMNS)', () => {
    const now = Date.now();

    // A. Testing sewing_bill GENERATED ALWAYS AS (sewing_rate * qty_ok) STORED on maklun_receipts
    db.exec(`
      INSERT INTO partners (id, code, name, type, is_active, updated_at)
      VALUES (1, 'KV01', 'Konveksi Berkah', 'konveksi', 1, ${now});

      INSERT INTO products (id, sku, name, is_active, updated_at)
      VALUES (1, 'GAMIS-01', 'Gamis Rayon', 1, ${now});

      INSERT INTO variants (id, product_id, size, color, is_active, updated_at)
      VALUES (1, 1, 'AllSize', 'Mocca', 1, ${now});

      INSERT INTO maklun_batches (id, code, batch_date, partner_id, material_name, updated_at)
      VALUES (1, 'BT-1', '2026-10-29', 1, 'Kain Rayon', ${now});

      INSERT INTO maklun_receipts (
        id, batch_id, receipt_date, variant_id, qty_ok, qty_reject, sewing_rate, created_at
      ) VALUES (1, 1, '2026-10-29', 1, 120, 5, 7500, ${now});
    `);

    const receipt = db
      .prepare('SELECT qty_ok, sewing_rate, sewing_bill FROM maklun_receipts WHERE id = 1')
      .get() as { qty_ok: number; sewing_rate: number; sewing_bill: number };

    expect(receipt.qty_ok).toBe(120);
    expect(receipt.sewing_rate).toBe(7500);
    // sewing_bill = 120 * 7500 = 900,000
    expect(receipt.sewing_bill).toBe(900_000);

    // B. Testing net_received GENERATED ALWAYS AS (gross_sales - store_discount - refunds - marketplace_fees) STORED
    db.exec(`
      INSERT INTO stores (id, code, name, channel, is_active, updated_at)
      VALUES (1, 'shopee-ucci', 'Shopee Ucci Kids', 'shopee', 1, ${now});

      INSERT INTO sales_settlements (
        id, settle_date, store_id, gross_sales, store_discount, refunds, marketplace_fees, created_at
      ) VALUES (
        1, '2026-10-29', 1, 2500000, 150000, 50000, 200000, ${now}
      );
    `);

    const settlement = db
      .prepare(
        `
        SELECT gross_sales, store_discount, refunds, marketplace_fees, net_received
        FROM sales_settlements WHERE id = 1
      `
      )
      .get() as {
      gross_sales: number;
      store_discount: number;
      refunds: number;
      marketplace_fees: number;
      net_received: number;
    };

    expect(settlement.gross_sales).toBe(2_500_000);
    expect(settlement.store_discount).toBe(150_000);
    expect(settlement.refunds).toBe(50_000);
    expect(settlement.marketplace_fees).toBe(200_000);
    // net_received = 2,500,000 - 150,000 - 50,000 - 200,000 = 2,100,000
    expect(settlement.net_received).toBe(2_100_000);
  });
});
