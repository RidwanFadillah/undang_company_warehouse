import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { CreateSkuMappingSchema, BulkCreateSkuMappingSchema } from '../../shared/schema';
import { normalizeVariationKey } from '../../shared/rules/orders';

export const mappingsRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/mappings?store_id=
mappingsRoute.get('/', async (c) => {
  const db = c.env.DB;
  const storeId = c.req.query('store_id');

  let sql = `
    SELECT 
      m.id, m.store_id, m.store_sku, m.variation_key, m.product_id,
      m.size, m.color, m.qty_multiplier, m.map_type, m.note, m.updated_at,
      s.name as store_name, s.code as store_code,
      p.sku as product_sku, p.name as product_name
    FROM sku_mappings m
    JOIN stores s ON s.id = m.store_id
    JOIN products p ON p.id = m.product_id
  `;

  const params: unknown[] = [];
  if (storeId) {
    sql += ' WHERE m.store_id = ?';
    params.push(Number(storeId));
  }
  sql += ' ORDER BY m.updated_at DESC, m.id DESC LIMIT 500';

  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all();

  return c.json({ mappings: results || [] });
});

// POST /api/mappings (Create or Upsert single mapping)
mappingsRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateSkuMappingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Data mapping SKU tidak valid',
          details: parsed.error.format(),
        },
      },
      400
    );
  }

  const {
    store_id,
    store_sku,
    variation_key,
    product_id,
    size,
    color,
    qty_multiplier,
    map_type,
    note,
  } = parsed.data;
  const db = c.env.DB;
  const now = Date.now();

  const normVar = normalizeVariationKey(variation_key);

  // Check if mapping exists
  const existing = await db
    .prepare(
      'SELECT id FROM sku_mappings WHERE store_id = ? AND store_sku = ? AND variation_key = ?'
    )
    .bind(store_id, store_sku, normVar)
    .first<{ id: number }>();

  let mappingId: number;

  if (existing) {
    mappingId = existing.id;
    await db
      .prepare(
        `UPDATE sku_mappings
         SET product_id = ?, size = ?, color = ?, qty_multiplier = ?, map_type = ?, note = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        product_id,
        size || null,
        color || null,
        qty_multiplier,
        map_type,
        note || null,
        now,
        mappingId
      )
      .run();
  } else {
    mappingId = Number(`${now}${Math.floor(Math.random() * 899 + 100)}`);
    await db
      .prepare(
        `INSERT INTO sku_mappings (id, store_id, store_sku, variation_key, product_id, size, color, qty_multiplier, map_type, note, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        mappingId,
        store_id,
        store_sku,
        normVar,
        product_id,
        size || null,
        color || null,
        qty_multiplier,
        map_type,
        note || null,
        now
      )
      .run();
  }

  // DoD Requirement: Mapping baru langsung me-resolve baris order sejenis
  const newState = map_type === 'random' ? 'menunggu_fisik' : 'siap_keluar';
  const resolveResult = await db
    .prepare(
      `UPDATE order_lines
       SET mapping_id = ?, resolve_state = ?
       WHERE resolve_state = 'perlu_mapping'
         AND store_sku = ?
         AND order_id IN (SELECT id FROM orders WHERE store_id = ?)`
    )
    .bind(mappingId, newState, store_sku, store_id)
    .run();

  return c.json({
    success: true,
    mapping_id: mappingId,
    resolved_lines_count: resolveResult.meta?.changes || 0,
    message: `Mapping berhasil disimpan. ${resolveResult.meta?.changes || 0} baris pesanan otomatis diperbarui!`,
  });
});

// POST /api/mappings/bulk (Untuk migrasi atau impor massal mapping)
mappingsRoute.post('/bulk', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = BulkCreateSkuMappingSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION', message: 'Data bulk mapping tidak valid' } }, 400);
  }

  const db = c.env.DB;
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  for (const m of parsed.data.mappings) {
    const id = Number(`${now}${Math.floor(Math.random() * 899 + 100)}`);
    const normVar = normalizeVariationKey(m.variation_key);
    statements.push(
      db
        .prepare(
          `INSERT INTO sku_mappings (id, store_id, store_sku, variation_key, product_id, size, color, qty_multiplier, map_type, note, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(store_id, store_sku, variation_key) DO UPDATE SET
             product_id = excluded.product_id,
             size = excluded.size,
             color = excluded.color,
             qty_multiplier = excluded.qty_multiplier,
             map_type = excluded.map_type,
             note = excluded.note,
             updated_at = excluded.updated_at`
        )
        .bind(
          id,
          m.store_id,
          m.store_sku,
          normVar,
          m.product_id,
          m.size || null,
          m.color || null,
          m.qty_multiplier || 1,
          m.map_type || 'pasti',
          m.note || null,
          now
        )
    );
  }

  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }

  return c.json({
    success: true,
    count: parsed.data.mappings.length,
    message: `${parsed.data.mappings.length} mapping berhasil disimpan.`,
  });
});
