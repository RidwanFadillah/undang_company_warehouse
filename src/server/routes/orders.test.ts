import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { ordersRoute } from './orders';
import { mappingsRoute } from './mappings';
import { outboundRoute } from './outbound';
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
        return {
          success: true,
          meta: {
            changes: info.changes,
            last_row_id: Number(info.lastInsertRowid),
          },
        };
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

describe('Orders, Outbound & Mappings API Routes (Fase 4)', () => {
  let db: DatabaseSync;
  let d1: Env['DB'];
  let app: Hono<{ Bindings: Env; Variables: Variables }>;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    const migrationPath = path.resolve(__dirname, '../../../db/migrations/0001_init.sql');
    db.exec(fs.readFileSync(migrationPath, 'utf8'));
    d1 = createD1Adapter(db);

    app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.route('/api/orders', ordersRoute);
    app.route('/api/mappings', mappingsRoute);
    app.route('/api/outbound', outboundRoute);

    // Mock auth middleware injects user
    app.use('*', async (c, next) => {
      c.set('user', {
        id: 1,
        email: 'owner@local',
        name: 'Owner',
        role: 'owner',
      });
      await next();
    });

    // Seed test master data: Store, Product, Variant
    const now = Date.now();
    db.exec(`
      INSERT INTO stores (id, code, name, channel, is_active, updated_at)
      VALUES (1, 'TIKTOK-1', 'Gudang Official TikTok', 'tiktok', 1, ${now});

      INSERT INTO products (id, sku, name, category, is_active, updated_at)
      VALUES (1, 'LEGGING-PJG', 'Legging Panjang', 'Pakaian', 1, ${now});

      INSERT INTO variants (id, product_id, size, color, hpp, sell_price, min_stock, is_active, updated_at)
      VALUES 
        (101, 1, 'M', 'Hitam', 25000, 45000, 10, 1, ${now}),
        (102, 1, 'L', 'Hitam', 27000, 49000, 10, 1, ${now});

      -- Initial stock balance
      INSERT INTO stock_movements (variant_id, moved_on, kind, qty_delta, unit_cost, created_at)
      VALUES 
        (101, '2026-10-29', 'opening', 100, 25000, ${now}),
        (102, '2026-10-29', 'opening', 100, 27000, ${now});
    `);
  });

  it('imports orders and enforces idempotency (R-41)', async () => {
    // First, map SKU store 'LP-HTM-M' -> Variant 101
    await app.request(
      '/api/mappings',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: 1,
          store_sku: 'LP-HTM-M',
          variation_key: 'hitam m',
          product_id: 1,
          size: 'M',
          color: 'Hitam',
          qty_multiplier: 1,
          map_type: 'pasti',
        }),
      },
      { DB: d1 }
    );

    const importPayload = {
      store_id: 1,
      filename: 'pesanan_shopee_okt.xlsx',
      rows: [
        {
          order_no: 'ORD-001',
          ordered_at: '2026-10-29T10:00:00',
          status_raw: 'Perlu Dikirim',
          store_sku: 'LP-HTM-M',
          variation: 'Hitam, M',
          qty: 2,
          buyer_note: 'Jangan lupa packing rapi',
        },
        {
          order_no: 'ORD-002',
          ordered_at: '2026-10-29T11:00:00',
          status_raw: 'Perlu Dikirim',
          store_sku: 'LP-HTM-L-UNMAPPED',
          variation: 'Hitam, L',
          qty: 1,
        },
      ],
    };

    // First import
    const res1 = await app.request(
      '/api/orders/import',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importPayload),
      },
      { DB: d1 }
    );

    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.created_orders).toBe(2);
    expect(data1.resolved.siap_keluar).toBe(1);
    expect(data1.resolved.perlu_mapping).toBe(1);

    // Second import of the EXACT same file -> must be idempotent, 0 new orders created!
    const res2 = await app.request(
      '/api/orders/import',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importPayload),
      },
      { DB: d1 }
    );

    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.created_orders).toBe(0); // Idempotent!

    // Verify row count in DB
    const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get() as {
      count: number;
    };
    const lineCount = db.prepare('SELECT COUNT(*) as count FROM order_lines').get() as {
      count: number;
    };
    expect(orderCount.count).toBe(2);
    expect(lineCount.count).toBe(2);
  });

  it('new mapping immediately resolves pending order lines of the same type', async () => {
    // Import an unmapped order first
    await app.request(
      '/api/orders/import',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: 1,
          rows: [
            {
              order_no: 'ORD-UNMAPPED-1',
              status_raw: 'Perlu Dikirim',
              store_sku: 'LP-NEW-SKU',
              variation: 'Hitam, L',
              qty: 5,
            },
          ],
        }),
      },
      { DB: d1 }
    );

    // Verify resolve_state is 'perlu_mapping'
    const pendingLine = db
      .prepare("SELECT resolve_state FROM order_lines WHERE store_sku = 'LP-NEW-SKU'")
      .get() as { resolve_state: string };
    expect(pendingLine.resolve_state).toBe('perlu_mapping');

    // Create mapping for 'LP-NEW-SKU'
    const mapRes = await app.request(
      '/api/mappings',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: 1,
          store_sku: 'LP-NEW-SKU',
          variation_key: 'hitam l',
          product_id: 1,
          size: 'L',
          color: 'Hitam',
          qty_multiplier: 1,
          map_type: 'pasti',
        }),
      },
      { DB: d1 }
    );

    expect(mapRes.status).toBe(200);
    const mapData = await mapRes.json();
    expect(mapData.resolved_lines_count).toBe(1);

    // Verify resolve_state became 'siap_keluar' immediately!
    const updatedLine = db
      .prepare("SELECT resolve_state FROM order_lines WHERE store_sku = 'LP-NEW-SKU'")
      .get() as { resolve_state: string };
    expect(updatedLine.resolve_state).toBe('siap_keluar');
  });

  it('processes ready orders and deducts stock with HPP snapshot (R-48, R-49)', async () => {
    // Setup mapped order
    await app.request(
      '/api/mappings',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: 1,
          store_sku: 'LP-HTM-M',
          variation_key: 'hitam m',
          product_id: 1,
          size: 'M',
          color: 'Hitam',
          qty_multiplier: 1,
          map_type: 'pasti',
        }),
      },
      { DB: d1 }
    );

    await app.request(
      '/api/orders/import',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: 1,
          rows: [
            {
              order_no: 'ORD-SHIP-01',
              status_raw: 'Perlu Dikirim',
              store_sku: 'LP-HTM-M',
              variation: 'Hitam, M',
              qty: 4, // 4 pcs
            },
          ],
        }),
      },
      { DB: d1 }
    );

    // Initial stock was 100
    const stockBefore = db
      .prepare('SELECT qty FROM stock_balance WHERE variant_id = 101')
      .get() as {
      qty: number;
    };
    expect(stockBefore.qty).toBe(100);

    // Process all ready orders
    const procRes = await app.request(
      '/api/orders/process',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          all_ready: true,
        }),
      },
      { DB: d1 }
    );

    expect(procRes.status).toBe(200);
    const procData = await procRes.json();
    expect(procData.processed_lines).toBe(1);
    expect(procData.total_pcs).toBe(4);
    expect(procData.total_cogs).toBe(4 * 25000); // 100.000 (HPP snapshot)

    // Stock should be 100 - 4 = 96
    const stockAfter = db.prepare('SELECT qty FROM stock_balance WHERE variant_id = 101').get() as {
      qty: number;
    };
    expect(stockAfter.qty).toBe(96);

    // Outbound item recorded with HPP snapshot
    const outbound = db.prepare('SELECT * FROM outbound_items WHERE variant_id = 101').get() as {
      qty: number;
      hpp_snapshot: number;
      cogs: number;
    };
    expect(outbound.qty).toBe(4);
    expect(outbound.hpp_snapshot).toBe(25000);
    expect(outbound.cogs).toBe(100000);

    // Order stock_state updated to 'keluar'
    const order = db
      .prepare("SELECT stock_state FROM orders WHERE order_no = 'ORD-SHIP-01'")
      .get() as { stock_state: string };
    expect(order.stock_state).toBe('keluar');
  });

  it('handles manual outbound goods and voiding (R-50)', async () => {
    const res = await app.request(
      '/api/outbound',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          out_date: '2026-10-29',
          store_id: 1,
          note: 'Sample endorsement selebgram',
          items: [{ variant_id: 101, qty: 5 }],
        }),
      },
      { DB: d1 }
    );

    expect(res.status).toBe(200);

    // Stock was 100, now should be 95
    const stock = db.prepare('SELECT qty FROM stock_balance WHERE variant_id = 101').get() as {
      qty: number;
    };
    expect(stock.qty).toBe(95);

    // Void the outbound
    const outItem = db.prepare('SELECT id FROM outbound_items LIMIT 1').get() as { id: number };
    const voidRes = await app.request(
      `/api/outbound/${outItem.id}/void`,
      { method: 'POST' },
      { DB: d1 }
    );

    expect(voidRes.status).toBe(200);

    // Stock restored to 100
    const stockRestored = db
      .prepare('SELECT qty FROM stock_balance WHERE variant_id = 101')
      .get() as { qty: number };
    expect(stockRestored.qty).toBe(100);
  });
});
