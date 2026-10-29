import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { inboundRoute } from './inbound';
import { partnersRoute } from './partners';
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

describe('Inbound & Partners API Routes', () => {
  let db: DatabaseSync;
  let d1: Env['DB'];
  let app: Hono<{ Bindings: Env; Variables: Variables }>;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    const migrationPath = path.resolve(__dirname, '../../../db/migrations/0001_init.sql');
    db.exec(fs.readFileSync(migrationPath, 'utf8'));
    d1 = createD1Adapter(db);

    app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.route('/api/inbound', inboundRoute);
    app.route('/api/partners', partnersRoute);

    // Seed 1 product, 2 variants, 1 partner
    const now = Date.now();
    db.exec(`
      INSERT INTO partners (id, code, name, type, is_active, updated_at)
      VALUES (1, 'SUP01', 'Supplier Kain Utama', 'supplier', 1, ${now});

      INSERT INTO products (id, sku, name, category, is_active, updated_at)
      VALUES (1, 'TEST-SKU', 'Test Product', 'Atasan', 1, ${now});

      INSERT INTO variants (id, product_id, size, color, hpp, sell_price, min_stock, is_active, updated_at)
      VALUES 
        (101, 1, 'M', 'Hitam', 25000, 50000, 5, 1, ${now}),
        (102, 1, 'L', 'Putih', 27000, 55000, 5, 1, ${now});
    `);
  });

  it('creates an inbound document atomically with lines, stock movements, and updates stock balance', async () => {
    const payload = {
      doc_date: '2026-10-29',
      source: 'beli',
      partner_id: 1,
      note: 'Kulakan awal minggu',
      create_invoice: true,
      due_date: '2026-11-29',
      lines: [
        { variant_id: 101, qty: 24, unit_cost: 25000 },
        { variant_id: 102, qty: 12, unit_cost: 27000 },
      ],
    };

    const res = await app.request(
      'http://localhost/api/inbound',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      { DB: d1, DEV_AUTH_EMAIL: 'admin@toko.com', ENV: 'dev' }
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { doc: { id: number; doc_no: string; invoice_id: number } };
    expect(body.doc.id).toBe(1);
    expect(body.doc.invoice_id).toBe(1);

    // Verify stock_balance updated by trigger
    const bal101 = db.prepare('SELECT qty FROM stock_balance WHERE variant_id = 101').get() as {
      qty: number;
    };
    const bal102 = db.prepare('SELECT qty FROM stock_balance WHERE variant_id = 102').get() as {
      qty: number;
    };
    expect(bal101.qty).toBe(24);
    expect(bal102.qty).toBe(12);

    // Verify stock_movements created with kind = 'purchase'
    const movements = db
      .prepare('SELECT variant_id, kind, qty_delta, ref_type, ref_id FROM stock_movements')
      .all() as Array<{
      variant_id: number;
      kind: string;
      qty_delta: number;
      ref_type: string;
      ref_id: number;
    }>;
    expect(movements.length).toBe(2);
    expect(movements[0].kind).toBe('purchase');
    expect(movements[0].qty_delta).toBe(24);
    expect(movements[0].ref_id).toBe(1);

    // Verify supplier_invoices created with correct amount (24*25000 + 12*27000 = 600000 + 324000 = 924000)
    const invoice = db
      .prepare('SELECT amount, partner_id FROM supplier_invoices WHERE id = 1')
      .get() as {
      amount: number;
      partner_id: number;
    };
    expect(invoice.amount).toBe(924000);
    expect(invoice.partner_id).toBe(1);
  });

  it('voiding an inbound document reverses stock balance via counter movements and marks invoice voided', async () => {
    // 1. Create document first
    await app.request(
      'http://localhost/api/inbound',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_date: '2026-10-29',
          source: 'beli',
          partner_id: 1,
          create_invoice: true,
          lines: [{ variant_id: 101, qty: 50, unit_cost: 20000 }],
        }),
      },
      { DB: d1, DEV_AUTH_EMAIL: 'admin@toko.com', ENV: 'dev' }
    );

    // Balance should be 50
    let bal = db.prepare('SELECT qty FROM stock_balance WHERE variant_id = 101').get() as {
      qty: number;
    };
    expect(bal.qty).toBe(50);

    // 2. Void document
    const voidRes = await app.request(
      'http://localhost/api/inbound/1/void',
      { method: 'POST' },
      { DB: d1, DEV_AUTH_EMAIL: 'admin@toko.com', ENV: 'dev' }
    );

    expect(voidRes.status).toBe(200);

    // Balance should be restored to 0!
    bal = db.prepare('SELECT qty FROM stock_balance WHERE variant_id = 101').get() as {
      qty: number;
    };
    expect(bal.qty).toBe(0);

    // Check void movement was appended
    const voidMov = db
      .prepare("SELECT kind, qty_delta FROM stock_movements WHERE kind = 'void'")
      .get() as { kind: string; qty_delta: number };
    expect(voidMov.kind).toBe('void');
    expect(voidMov.qty_delta).toBe(-50);

    // Document and invoice should be marked voided
    const doc = db.prepare('SELECT voided_at FROM inbound_docs WHERE id = 1').get() as {
      voided_at: number;
    };
    const inv = db.prepare('SELECT voided_at FROM supplier_invoices WHERE id = 1').get() as {
      voided_at: number;
    };
    expect(doc.voided_at).toBeGreaterThan(0);
    expect(inv.voided_at).toBeGreaterThan(0);

    // Voiding again should be rejected
    const reVoidRes = await app.request(
      'http://localhost/api/inbound/1/void',
      { method: 'POST' },
      { DB: d1, DEV_AUTH_EMAIL: 'admin@toko.com', ENV: 'dev' }
    );
    expect(reVoidRes.status).toBe(400);
  });

  it('lists inbound documents with monthly filter and aggregated line items', async () => {
    // Insert 2 docs
    await app.request(
      'http://localhost/api/inbound',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_date: '2026-10-15',
          source: 'beli',
          partner_id: 1,
          lines: [{ variant_id: 101, qty: 10, unit_cost: 25000 }],
        }),
      },
      { DB: d1, DEV_AUTH_EMAIL: 'admin@toko.com', ENV: 'dev' }
    );

    await app.request(
      'http://localhost/api/inbound',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_date: '2026-09-20',
          source: 'beli',
          lines: [{ variant_id: 102, qty: 5, unit_cost: 30000 }],
        }),
      },
      { DB: d1, DEV_AUTH_EMAIL: 'admin@toko.com', ENV: 'dev' }
    );

    const listRes = await app.request(
      'http://localhost/api/inbound?month=2026-10',
      { method: 'GET' },
      { DB: d1, DEV_AUTH_EMAIL: 'admin@toko.com', ENV: 'dev' }
    );
    expect(listRes.status).toBe(200);
    const data = (await listRes.json()) as {
      docs: Array<{ total_qty: number; total_amount: number }>;
    };
    expect(data.docs.length).toBe(1);
    expect(data.docs[0].total_qty).toBe(10);
    expect(data.docs[0].total_amount).toBe(250000);
  });

  it('creates and lists partners', async () => {
    const postRes = await app.request(
      'http://localhost/api/partners',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'SUP-NEW',
          name: 'Konveksi Maju Jaya',
          type: 'konveksi',
          pic: 'Pak Budi',
          phone: '08123456789',
        }),
      },
      { DB: d1, DEV_AUTH_EMAIL: 'admin@toko.com', ENV: 'dev' }
    );
    expect(postRes.status).toBe(201);

    const getRes = await app.request(
      'http://localhost/api/partners?type=konveksi',
      { method: 'GET' },
      { DB: d1, DEV_AUTH_EMAIL: 'admin@toko.com', ENV: 'dev' }
    );
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { partners: Array<{ name: string; type: string }> };
    expect(getBody.partners.length).toBe(1);
    expect(getBody.partners[0].name).toBe('Konveksi Maju Jaya');
  });
});
