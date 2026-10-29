import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { syncRoute } from './sync';
import type { Env, Variables } from '../types';
import type { SyncResponse } from '../../shared/types';

// Helper to wrap DatabaseSync to match D1Database interface for testing
function createD1Adapter(db: DatabaseSync): Env['DB'] {
  const prepare = (sql: string) => {
    let boundParams: unknown[] = [];
    return {
      bind: (...params: unknown[]) => {
        boundParams = params;
        return {
          all: async <T>() => {
            const stmt = db.prepare(sql);
            const results = stmt.all(...boundParams);
            return { results: results as unknown as T[], success: true };
          },
          run: async () => {
            const stmt = db.prepare(sql);
            const info = stmt.run(...boundParams);
            return { success: true, meta: { changes: info.changes } };
          },
          first: async <T>() => {
            const stmt = db.prepare(sql);
            const result = stmt.get(...boundParams);
            return result as unknown as T;
          },
        };
      },
    };
  };

  return {
    prepare,
    batch: async <T>(statements: Array<ReturnType<typeof prepare>>) => {
      const results = [];
      for (const statement of statements) {
        const stmt = statement as unknown as { all: () => Promise<unknown> };
        const allResult = await stmt.all();
        results.push(allResult);
      }
      return results as unknown as T[];
    },
  } as unknown as Env['DB'];
}

describe('Sync API (GET /api/sync)', () => {
  let db: DatabaseSync;
  let d1: Env['DB'];
  let app: Hono<{ Bindings: Env; Variables: Variables }>;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    const migrationPath = path.resolve(__dirname, '../../../db/migrations/0001_init.sql');
    db.exec(fs.readFileSync(migrationPath, 'utf8'));
    d1 = createD1Adapter(db);

    app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.route('/api/sync', syncRoute);
  });

  it('Full Sync: returns all master data and stock when since=0', async () => {
    const t1 = 1000;
    const t2 = 2000;

    // Seed test master
    db.exec(`
      INSERT INTO products (id, sku, name, is_active, updated_at) VALUES (1, 'KAOS', 'Kaos Polos', 1, ${t1});
      INSERT INTO variants (id, product_id, size, color, hpp, sell_price, is_active, updated_at) VALUES (10, 1, 'M', 'Hitam', 20000, 45000, 1, ${t1});
      INSERT INTO stores (id, code, name, channel, is_active, updated_at) VALUES (1, 'shopee-1', 'Shopee Official', 'shopee', 1, ${t1});
      INSERT INTO partners (id, code, name, type, is_active, updated_at) VALUES (1, 'KV1', 'Konveksi Berkah', 'konveksi', 1, ${t1});
      INSERT INTO stock_movements (id, variant_id, moved_on, kind, qty_delta, unit_cost, created_at) VALUES (1, 10, '2026-10-29', 'purchase', 100, 20000, ${t2});
    `);

    const res = await app.request('/api/sync', {}, { DB: d1 });
    expect(res.status).toBe(200);

    const data = (await res.json()) as SyncResponse;
    expect(data.products.length).toBe(1);
    expect(data.products[0].sku).toBe('KAOS');
    expect(data.variants.length).toBe(1);
    expect(data.stock.length).toBe(1);
    expect(data.stock[0].qty).toBe(100);
    expect(data.stores.length).toBe(1);
    expect(data.partners.length).toBe(1);
    expect(data.cursor).toBe(t2);

    const etag = res.headers.get('ETag');
    expect(etag).toBe(`W/"sync-${t2}"`);
  });

  it('Delta Sync: returns only updated rows since cursor', async () => {
    const t1 = 1000;
    const t3 = 3000;

    db.exec(`
      INSERT INTO products (id, sku, name, is_active, updated_at) VALUES (1, 'KAOS', 'Kaos', 1, ${t1});
      INSERT INTO products (id, sku, name, is_active, updated_at) VALUES (2, 'KEMEJA', 'Kemeja', 1, ${t3});
    `);

    const res = await app.request('/api/sync?since=1500', {}, { DB: d1 });
    expect(res.status).toBe(200);

    const data = (await res.json()) as SyncResponse;
    // Only KEMEJA (t3 = 3000) was updated after 1500
    expect(data.products.length).toBe(1);
    expect(data.products[0].sku).toBe('KEMEJA');
    expect(data.cursor).toBe(t3);
  });

  it('ETag caching: returns 304 Not Modified when client provides matching ETag and no rows changed', async () => {
    const t1 = 1000;
    db.exec(`
      INSERT INTO products (id, sku, name, is_active, updated_at) VALUES (1, 'KAOS', 'Kaos', 1, ${t1});
    `);

    const res = await app.request(
      '/api/sync?since=1000',
      {
        headers: { 'If-None-Match': 'W/"sync-1000"' },
      },
      { DB: d1 }
    );

    expect(res.status).toBe(304);
  });
});
