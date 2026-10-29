import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { AdjustStockSchema } from '../../shared/schema';
import { getWibDateString } from '../../shared/rules/date';

export const stockRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/stock/history/:variantId?before=&limit=
stockRoute.get('/history/:variantId', async (c) => {
  const variantId = Number(c.req.param('variantId'));
  if (isNaN(variantId)) {
    return c.json({ error: { code: 'VALIDATION', message: 'Invalid variant ID' } }, 400);
  }

  const query = c.req.query();
  const limit = Math.min(Number(query.limit) || 50, 100);
  const beforeId = Number(query.before) || 0;

  const db = c.env.DB;
  let sql = `
    SELECT id, variant_id, moved_on, kind, qty_delta, unit_cost, ref_type, ref_id, note, created_by, created_at
    FROM stock_movements
    WHERE variant_id = ?
  `;
  const params: unknown[] = [variantId];

  if (beforeId > 0) {
    sql += ' AND id < ?';
    params.push(beforeId);
  }

  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);

  const stmt = db.prepare(sql).bind(...params);
  const { results } = await stmt.all();

  return c.json({
    items: results || [],
    has_more: (results?.length || 0) === limit,
  });
});

// POST /api/stock/adjust (Stock Opname)
stockRoute.post('/adjust', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = AdjustStockSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Invalid adjust payload',
          details: parsed.error.format(),
        },
      },
      400
    );
  }

  const user = c.get('user');
  const db = c.env.DB;
  const now = Date.now();
  const todayWib = getWibDateString(now);
  const { items, note } = parsed.data;

  // 1. Fetch current balances and HPP for the given variants in a batch or single IN query
  const variantIds = items.map((i) => i.variant_id);
  const placeholders = variantIds.map(() => '?').join(',');

  const balancesRes = await db
    .prepare(
      `SELECT v.id as variant_id, v.hpp, COALESCE(b.qty, 0) as current_qty
       FROM variants v
       LEFT JOIN stock_balance b ON b.variant_id = v.id
       WHERE v.id IN (${placeholders})`
    )
    .bind(...variantIds)
    .all<{ variant_id: number; hpp: number; current_qty: number }>();

  const currentMap = new Map<number, { hpp: number; current_qty: number }>();
  (balancesRes.results || []).forEach((r) => {
    currentMap.set(r.variant_id, { hpp: r.hpp, current_qty: r.current_qty });
  });

  // 2. Prepare movements for variants that have delta !== 0
  const statements = [];
  let adjustedCount = 0;

  for (const item of items) {
    const info = currentMap.get(item.variant_id);
    const currentQty = info ? info.current_qty : 0;
    const hpp = info ? info.hpp : 0;
    const delta = item.counted_qty - currentQty;

    if (delta !== 0) {
      adjustedCount++;
      statements.push(
        db
          .prepare(
            `INSERT INTO stock_movements (
              variant_id, moved_on, kind, qty_delta, unit_cost, ref_type, note, created_by, created_at
            ) VALUES (?, ?, 'adjust', ?, ?, 'adjustment', ?, ?, ?)`
          )
          .bind(
            item.variant_id,
            todayWib,
            delta,
            hpp,
            note || 'Stock Opname Fisik',
            user?.email || 'admin',
            now
          )
      );
    }
  }

  if (statements.length > 0) {
    // Audit log entry
    statements.push(
      db
        .prepare(
          `INSERT INTO audit_log (at, user_email, action, entity, entity_id, detail)
           VALUES (?, ?, 'adjust_stock', 'stock', NULL, ?)`
        )
        .bind(now, user?.email || 'admin', JSON.stringify({ adjusted_count: adjustedCount, note }))
    );

    // Atomically execute movements. DB trigger trg_mov_ai updates stock_balance automatically!
    await db.batch(statements);
  }

  return c.json({
    success: true,
    adjusted_count: adjustedCount,
    updated_at: now,
  });
});

// GET /api/stock/issues (Stok minus & stok rendah)
stockRoute.get('/issues', async (c) => {
  const db = c.env.DB;

  const [negativeRes, lowRes] = await db.batch([
    db.prepare(`
      SELECT
        v.id as variant_id,
        v.product_id,
        p.sku,
        p.name as product_name,
        v.size,
        v.color,
        v.hpp,
        v.sell_price,
        v.min_stock,
        b.qty
      FROM variants v
      JOIN products p ON p.id = v.product_id
      JOIN stock_balance b ON b.variant_id = v.id
      WHERE v.is_active = 1 AND b.qty < 0
      ORDER BY b.qty ASC
    `),
    db.prepare(`
      SELECT
        v.id as variant_id,
        v.product_id,
        p.sku,
        p.name as product_name,
        v.size,
        v.color,
        v.hpp,
        v.sell_price,
        v.min_stock,
        COALESCE(b.qty, 0) as qty
      FROM variants v
      JOIN products p ON p.id = v.product_id
      LEFT JOIN stock_balance b ON b.variant_id = v.id
      WHERE v.is_active = 1 AND v.min_stock > 0 AND COALESCE(b.qty, 0) >= 0 AND COALESCE(b.qty, 0) <= v.min_stock
      ORDER BY COALESCE(b.qty, 0) ASC
    `),
  ]);

  return c.json({
    negative: negativeRes.results || [],
    low: lowRes.results || [],
  });
});

// GET /api/stock/integrity (Verifikasi SUM(movements) == stock_balance)
stockRoute.get('/integrity', async (c) => {
  const db = c.env.DB;

  const sql = `
    SELECT
      v.id as variant_id,
      p.sku,
      p.name as product_name,
      v.size,
      v.color,
      COALESCE(b.qty, 0) as balance_qty,
      COALESCE(m.total_movements, 0) as movement_qty,
      (COALESCE(b.qty, 0) - COALESCE(m.total_movements, 0)) as diff
    FROM variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN stock_balance b ON b.variant_id = v.id
    LEFT JOIN (
      SELECT variant_id, SUM(qty_delta) as total_movements
      FROM stock_movements
      GROUP BY variant_id
    ) m ON m.variant_id = v.id
    WHERE (COALESCE(b.qty, 0) - COALESCE(m.total_movements, 0)) <> 0
  `;

  const { results } = await db.prepare(sql).all();

  return c.json({
    is_consistent: (results?.length || 0) === 0,
    anomalies: results || [],
  });
});
