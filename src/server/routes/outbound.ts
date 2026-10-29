import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { CreateOutboundSchema } from '../../shared/schema';

export const outboundRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/outbound
outboundRoute.get('/', async (c) => {
  const db = c.env.DB;
  const month = c.req.query('month');
  const storeId = c.req.query('store_id');
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit')) || 50));

  const whereClauses: string[] = ['o.voided_at IS NULL'];
  const params: unknown[] = [];

  if (month) {
    whereClauses.push('o.out_date LIKE ?');
    params.push(`${month}%`);
  }
  if (storeId) {
    whereClauses.push('o.store_id = ?');
    params.push(Number(storeId));
  }

  const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

  const { results } = await db
    .prepare(
      `SELECT 
        o.id, o.out_date, o.store_id, o.order_line_id, o.variant_id, o.qty,
        o.hpp_snapshot, o.cogs, o.note, o.created_by, o.created_at,
        s.name as store_name,
        pr.sku as product_sku, pr.name as product_name,
        v.size, v.color
      FROM outbound_items o
      LEFT JOIN stores s ON s.id = o.store_id
      JOIN variants v ON v.id = o.variant_id
      JOIN products pr ON pr.id = v.product_id
      ${whereSql}
      ORDER BY o.out_date DESC, o.id DESC
      LIMIT ?`
    )
    .bind(...params, limit)
    .all();

  return c.json({ items: results || [] });
});

// POST /api/outbound (Barang Keluar Manual, R-50)
outboundRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateOutboundSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Data pengeluaran barang tidak valid',
          details: parsed.error.format(),
        },
      },
      400
    );
  }

  const { out_date, store_id, note, items } = parsed.data;
  const db = c.env.DB;
  const now = Date.now();
  const user = c.get('user');

  // Fetch variant HPPs
  const variantIds = items.map((i) => i.variant_id);
  const placeholders = variantIds.map(() => '?').join(',');
  const { results: variants } = await db
    .prepare(`SELECT id, hpp FROM variants WHERE id IN (${placeholders})`)
    .bind(...variantIds)
    .all<{ id: number; hpp: number }>();

  const hppMap = new Map<number, number>();
  for (const v of variants || []) {
    hppMap.set(v.id, v.hpp);
  }

  const statements: D1PreparedStatement[] = [];
  let totalPcs = 0;
  let totalCogs = 0;

  for (const item of items) {
    const hpp = hppMap.get(item.variant_id) || 0;
    const cogs = Math.round(item.qty * hpp);
    totalPcs += item.qty;
    totalCogs += cogs;

    const id = Number(`${now}${Math.floor(Math.random() * 899 + 100)}`);

    // 1. outbound_items
    statements.push(
      db
        .prepare(
          `INSERT INTO outbound_items (id, out_date, store_id, variant_id, qty, hpp_snapshot, cogs, note, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          out_date,
          store_id || null,
          item.variant_id,
          item.qty,
          hpp,
          cogs,
          note || 'Barang keluar manual',
          user?.email || 'admin@local',
          now
        )
    );

    // 2. stock_movements (atomic deduction)
    statements.push(
      db
        .prepare(
          `INSERT INTO stock_movements (variant_id, moved_on, kind, qty_delta, unit_cost, ref_type, ref_id, note, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          item.variant_id,
          out_date,
          'sale',
          -item.qty,
          hpp,
          'outbound_item',
          id,
          note || 'Keluar Manual',
          user?.email || 'admin@local',
          now
        )
    );
  }

  // Execute in batches
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }

  return c.json({
    success: true,
    total_pcs: totalPcs,
    total_cogs: totalCogs,
    message: `${totalPcs} pcs barang berhasil dikeluarkan dan stok dipotong.`,
  });
});

// POST /api/outbound/:id/void
outboundRoute.post('/:id/void', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id) || id <= 0) {
    return c.json({ error: { code: 'VALIDATION', message: 'ID pengeluaran tidak valid' } }, 400);
  }

  const db = c.env.DB;
  const user = c.get('user');
  const item = await db
    .prepare(
      'SELECT id, out_date, variant_id, qty, hpp_snapshot, voided_at FROM outbound_items WHERE id = ?'
    )
    .bind(id)
    .first<{
      id: number;
      out_date: string;
      variant_id: number;
      qty: number;
      hpp_snapshot: number;
      voided_at: number | null;
    }>();

  if (!item) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Item pengeluaran tidak ditemukan' } },
      404
    );
  }

  if (item.voided_at) {
    return c.json(
      { error: { code: 'CONFLICT', message: 'Item pengeluaran ini sudah dibatalkan sebelumnya' } },
      400
    );
  }

  const now = Date.now();
  await db.batch([
    db.prepare('UPDATE outbound_items SET voided_at = ? WHERE id = ?').bind(now, id),
    db
      .prepare(
        `INSERT INTO stock_movements (variant_id, moved_on, kind, qty_delta, unit_cost, ref_type, ref_id, note, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        item.variant_id,
        item.out_date,
        'void',
        item.qty,
        item.hpp_snapshot,
        'outbound_item',
        id,
        `Void Keluar #${id}`,
        user?.email || 'admin@local',
        now
      ),
  ]);

  return c.json({
    success: true,
    message: 'Pengeluaran berhasil dibatalkan. Stok telah dikembalikan.',
  });
});
