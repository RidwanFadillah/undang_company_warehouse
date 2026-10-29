import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { stockRoute } from './stock';
import { productsRoute } from './products';
import type { Env, Variables } from '../types';

function createD1Adapter(db: DatabaseSync): Env['DB'] {
  const createStatement = (sql: string, params: unknown[] = []) => {
    return {
      bind: (...newParams: unknown[]) => createStatement(sql, newParams),
      all: async <T>() => {
        const stmt = db.prepare(sql);
        const results = stmt.all(...params);
        return { results: results as unknown as T[], success: true };
      },
      run: async () => {
        const stmt = db.prepare(sql);
        const info = stmt.run(...params);
        return { success: true, meta: { changes: info.changes } };
      },
      first: async <T>() => {
        const stmt = db.prepare(sql);
        const result = stmt.get(...params);
        return result as unknown as T;
      },
    };
  };

  return {
    prepare: (sql: string) => createStatement(sql),
    batch: async <T>(statements: Array<ReturnType<typeof createStatement>>) => {
      const results = [];
      for (const statement of statements) {
        const res = await statement.run();
        results.push(res);
      }
      return results as unknown as T[];
    },
  } as unknown as Env['DB'];
}

describe('Stock & Products API Routes', () => {
  let db: DatabaseSync;
  let d1: Env['DB'];
  let app: Hono<{ Bindings: Env; Variables: Variables }>;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    const migrationPath = path.resolve(__dirname, '../../../db/migrations/0001_init.sql');
    db.exec(fs.readFileSync(migrationPath, 'utf8'));
    d1 = createD1Adapter(db);

    app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.route('/api/stock', stockRoute);
    app.route('/api/products', productsRoute);
  });

  it('Stock Opname (/api/stock/adjust): produces adjust movement and updates stock_balance', async () => {
    const now = Date.now();
    db.exec(`
      INSERT INTO products (id, sku, name, is_active, updated_at) VALUES (1, 'MANSET-01', 'Manset Hitam', 1, ${now});
      INSERT INTO variants (id, product_id, size, color, hpp, sell_price, is_active, updated_at) VALUES (10, 1, 'M', 'Hitam', 15000, 30000, 1, ${now});
      -- Opening stock = 50 pcs
      INSERT INTO stock_movements (id, variant_id, moved_on, kind, qty_delta, unit_cost, created_at) VALUES (1, 10, '2026-10-01', 'opening', 50, 15000, ${now});
    `);

    // Verify system stock is 50
    const initialBal = db.prepare('SELECT qty FROM stock_balance WHERE variant_id = 10').get() as {
      qty: number;
    };
    expect(initialBal.qty).toBe(50);

    // Perform Opname: physically counted 42 pcs (diff is -8)
    const res = await app.request(
      '/api/stock/adjust',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ variant_id: 10, counted_qty: 42 }],
          note: 'Opname Mingguan Rak 2',
        }),
      },
      { DB: d1 }
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; adjusted_count: number };
    expect(body.success).toBe(true);
    expect(body.adjusted_count).toBe(1);

    // Verify stock_balance is now 42!
    const updatedBal = db.prepare('SELECT qty FROM stock_balance WHERE variant_id = 10').get() as {
      qty: number;
    };
    expect(updatedBal.qty).toBe(42);

    // Verify movement was created with kind 'adjust' and qty_delta -8
    const movement = db
      .prepare(
        'SELECT kind, qty_delta, note FROM stock_movements WHERE variant_id = 10 ORDER BY id DESC LIMIT 1'
      )
      .get() as { kind: string; qty_delta: number; note: string };
    expect(movement.kind).toBe('adjust');
    expect(movement.qty_delta).toBe(-8);
    expect(movement.note).toBe('Opname Mingguan Rak 2');
  });

  it('Stock Integrity (/api/stock/integrity): confirms 0 anomalies on valid ledger', async () => {
    const now = Date.now();
    db.exec(`
      INSERT INTO products (id, sku, name, is_active, updated_at) VALUES (1, 'CD', 'CD Cowok', 1, ${now});
      INSERT INTO variants (id, product_id, size, color, is_active, updated_at) VALUES (1, 1, 'S', 'Hitam', 1, ${now});
      INSERT INTO stock_movements (id, variant_id, moved_on, kind, qty_delta, unit_cost, created_at) VALUES (1, 1, '2026-10-01', 'opening', 100, 5000, ${now});
      INSERT INTO stock_movements (id, variant_id, moved_on, kind, qty_delta, unit_cost, created_at) VALUES (2, 1, '2026-10-02', 'sale', -25, 5000, ${now});
    `);

    const res = await app.request('/api/stock/integrity', {}, { DB: d1 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { is_consistent: boolean; anomalies: unknown[] };
    expect(body.is_consistent).toBe(true);
    expect(body.anomalies.length).toBe(0);
  });

  it('Atur HPP per Size (/api/products/:id/hpp-by-size): updates HPP across multiple colors of that size', async () => {
    const now = Date.now();
    db.exec(`
      INSERT INTO products (id, sku, name, is_active, updated_at) VALUES (1, 'LEOPARD', 'Legging Leopard', 1, ${now});
      INSERT INTO variants (id, product_id, size, color, hpp, is_active, updated_at) VALUES
        (1, 1, 'S', 'Hitam', 20000, 1, ${now}),
        (2, 1, 'S', 'Mocca', 20000, 1, ${now}),
        (3, 1, 'M', 'Hitam', 22000, 1, ${now}),
        (4, 1, 'M', 'Mocca', 22000, 1, ${now});
    `);

    // Set HPP: S = 24000, M = 26500
    const res = await app.request(
      '/api/products/1/hpp-by-size',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hpp_by_size: { S: 24000, M: 26500 },
        }),
      },
      { DB: d1 }
    );

    expect(res.status).toBe(200);

    const v1 = db.prepare('SELECT hpp FROM variants WHERE id = 1').get() as { hpp: number };
    const v2 = db.prepare('SELECT hpp FROM variants WHERE id = 2').get() as { hpp: number };
    const v3 = db.prepare('SELECT hpp FROM variants WHERE id = 3').get() as { hpp: number };

    expect(v1.hpp).toBe(24000);
    expect(v2.hpp).toBe(24000);
    expect(v3.hpp).toBe(26500);
  });
});
