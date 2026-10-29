import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { ImportOrdersSchema, ProcessOrdersSchema, ResolveRandomSchema } from '../../shared/schema';
import {
  normalizeOrderStatus,
  calculatePhysicalQty,
  normalizeVariationKey,
} from '../../shared/rules/orders';
import { getWibDateString } from '../../shared/rules/date';

export const ordersRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

interface DbMapping {
  id: number;
  store_sku: string;
  variation_key: string;
  product_id: number;
  size: string | null;
  color: string | null;
  qty_multiplier: number;
  map_type: 'pasti' | 'random' | 'bundle' | 'setelan';
}

interface DbVariantItem {
  id: number;
  product_id: number;
  size: string;
  color: string;
  hpp: number;
  product_sku: string;
  product_name: string;
}

interface ReadyOrderLine {
  line_id: number;
  order_id: number;
  order_qty: number;
  order_no: string;
  store_id: number;
  qty_multiplier: number | null;
  mapped_size: string | null;
  mapped_color: string | null;
  variant_id: number;
  variant_hpp: number;
}

// GET /api/orders
ordersRoute.get('/', async (c) => {
  const db = c.env.DB;
  const state = c.req.query('state') || 'all';
  const storeId = c.req.query('store_id');
  const date = c.req.query('date');
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit')) || 100));

  const whereClauses: string[] = [];
  const params: unknown[] = [];

  if (state !== 'all') {
    whereClauses.push('ol.resolve_state = ?');
    params.push(state);
  }
  if (storeId) {
    whereClauses.push('o.store_id = ?');
    params.push(Number(storeId));
  }
  if (date) {
    whereClauses.push('o.order_date = ?');
    params.push(date);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const { results } = await db
    .prepare(
      `SELECT 
        ol.id as line_id, ol.order_id, ol.line_no, ol.store_sku, ol.variation, ol.qty as order_qty,
        ol.resolve_state, ol.mapping_id,
        o.order_no, o.store_id, o.order_date, o.ordered_at, o.status as order_status,
        o.stock_state, o.buyer_note,
        s.name as store_name, s.code as store_code,
        m.qty_multiplier, m.map_type, m.size as mapped_size, m.color as mapped_color,
        v.id as variant_id, v.size as variant_size, v.color as variant_color, v.hpp as variant_hpp,
        pr.id as product_id, pr.sku as product_sku, pr.name as product_name
      FROM order_lines ol
      JOIN orders o ON o.id = ol.order_id
      JOIN stores s ON s.id = o.store_id
      LEFT JOIN sku_mappings m ON m.id = ol.mapping_id
      LEFT JOIN products pr ON pr.id = m.product_id
      LEFT JOIN variants v ON (
        v.product_id = pr.id 
        AND (m.size IS NULL OR v.size = m.size)
        AND (m.color IS NULL OR v.color = m.color)
        AND v.is_active = 1
      )
      ${whereSql}
      ORDER BY o.order_date DESC, o.id DESC, ol.line_no ASC
      LIMIT ?`
    )
    .bind(...params, limit)
    .all();

  // Summary counts
  const summary = await db
    .prepare(
      `SELECT 
        SUM(CASE WHEN resolve_state = 'siap_keluar' THEN 1 ELSE 0 END) as siap_keluar,
        SUM(CASE WHEN resolve_state = 'menunggu_fisik' THEN 1 ELSE 0 END) as menunggu_fisik,
        SUM(CASE WHEN resolve_state = 'perlu_mapping' THEN 1 ELSE 0 END) as perlu_mapping,
        SUM(CASE WHEN resolve_state = 'selesai' THEN 1 ELSE 0 END) as selesai,
        COUNT(*) as total_lines
      FROM order_lines`
    )
    .first();

  return c.json({
    orders: results || [],
    summary: summary || {
      siap_keluar: 0,
      menunggu_fisik: 0,
      perlu_mapping: 0,
      selesai: 0,
      total_lines: 0,
    },
  });
});

// POST /api/orders/import (Idempoten, R-41, R-43, R-44, R-51)
ordersRoute.post('/import', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = ImportOrdersSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Data import pesanan tidak valid',
          details: parsed.error.format(),
        },
      },
      400
    );
  }

  const { store_id, filename, rows } = parsed.data;
  const db = c.env.DB;
  const now = Date.now();
  const today = getWibDateString();
  const user = c.get('user');

  // Verify store exists
  const store = await db
    .prepare('SELECT id, name, code FROM stores WHERE id = ?')
    .bind(store_id)
    .first();
  if (!store) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Toko tidak ditemukan' } }, 404);
  }

  // 1. Create import batch record
  const batchId = now;
  await db
    .prepare(
      `INSERT INTO import_batches (id, store_id, filename, row_count, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      batchId,
      store_id,
      filename || 'import_pesanan.xlsx',
      rows.length,
      user?.email || 'admin@local',
      now
    )
    .run();

  // 2. Fetch existing mappings for this store
  const { results: existingMappings } = await db
    .prepare(
      `SELECT id, store_sku, variation_key, product_id, size, color, qty_multiplier, map_type
       FROM sku_mappings
       WHERE store_id = ?`
    )
    .bind(store_id)
    .all();

  // Map for fast lookup: key = `${store_sku}:::${normalizeVariationKey(variation_key)}`
  const mappingMap = new Map<string, DbMapping>();
  const mappingSkuOnlyMap = new Map<string, DbMapping>();
  for (const m of (existingMappings || []) as DbMapping[]) {
    const normVar = normalizeVariationKey(m.variation_key);
    mappingMap.set(`${m.store_sku}:::${normVar}`, m);
    if (!mappingSkuOnlyMap.has(m.store_sku)) {
      mappingSkuOnlyMap.set(m.store_sku, m);
    }
  }

  // 3. Fetch all active variants & products for variant matching
  const { results: allVariants } = await db
    .prepare(
      `SELECT v.id, v.product_id, v.size, v.color, v.hpp, pr.sku as product_sku, pr.name as product_name
       FROM variants v
       JOIN products pr ON pr.id = v.product_id
       WHERE v.is_active = 1`
    )
    .all<DbVariantItem>();

  const variantLookup = new Map<string, DbVariantItem>();
  for (const v of (allVariants || []) as DbVariantItem[]) {
    variantLookup.set(`${v.product_id}:::${v.size}:::${v.color}`, v);
    // Variant by SKU
    variantLookup.set(`sku:::${v.product_sku}:::${v.size}:::${v.color}`, v);
  }

  // Group incoming rows by order_no
  const orderGroups = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = orderGroups.get(r.order_no) || [];
    list.push(r);
    orderGroups.set(r.order_no, list);
  }

  let createdOrders = 0;
  let updatedOrders = 0;
  let resolvedSiapKeluar = 0;
  let resolvedMenungguFisik = 0;
  let resolvedPerluMapping = 0;
  let canceledSafe = 0;
  let canceledNeedsReturn = 0;

  const statements: D1PreparedStatement[] = [];

  for (const [orderNo, orderRows] of orderGroups.entries()) {
    const firstRow = orderRows[0];
    const normalizedStatus = normalizeOrderStatus(firstRow.status_raw);
    const orderDate = firstRow.ordered_at ? firstRow.ordered_at.slice(0, 10) : today;
    const orderedAt = firstRow.ordered_at || today;

    // Check if order already exists in DB
    const existingOrder = await db
      .prepare('SELECT id, status, stock_state FROM orders WHERE store_id = ? AND order_no = ?')
      .bind(store_id, orderNo)
      .first<{ id: number; status: string; stock_state: string }>();

    if (existingOrder) {
      // Order exists (Idempotensi R-41 / R-51)
      if (normalizedStatus === 'batal' && existingOrder.status !== 'batal') {
        if (existingOrder.stock_state === 'belum') {
          // R-51: Belum keluar -> aman
          statements.push(
            db
              .prepare('UPDATE orders SET status = ?, stock_state = ?, updated_at = ? WHERE id = ?')
              .bind('batal', 'aman', now, existingOrder.id)
          );
          canceledSafe++;
        } else if (existingOrder.stock_state === 'keluar') {
          // R-51: Sudah keluar -> butuh cek retur
          statements.push(
            db
              .prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?')
              .bind('batal', now, existingOrder.id)
          );
          // Find outbound items for this order to register in returns
          const { results: outboundLines } = await db
            .prepare(
              `SELECT o.variant_id, o.qty 
               FROM outbound_items o
               JOIN order_lines ol ON ol.id = o.order_line_id
               WHERE ol.order_id = ?`
            )
            .bind(existingOrder.id)
            .all<{ variant_id: number; qty: number }>();

          for (const ob of outboundLines || []) {
            statements.push(
              db
                .prepare(
                  `INSERT INTO returns (return_date, store_id, order_no, variant_id, qty, reason, condition, restock_state, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
                )
                .bind(
                  today,
                  store_id,
                  orderNo,
                  ob.variant_id,
                  ob.qty,
                  'Pembatalan marketplace saat barang sudah keluar',
                  'bagus',
                  'belum',
                  now
                )
            );
          }
          canceledNeedsReturn++;
        }
        updatedOrders++;
      }
      // If already exists and not status change, skip creating duplicate order_lines
      continue;
    }

    // New order: Insert into orders
    const orderId = Number(`${now}${Math.floor(Math.random() * 899 + 100)}`);
    statements.push(
      db
        .prepare(
          `INSERT INTO orders (id, store_id, order_no, ordered_at, order_date, status, raw_status, buyer_note, stock_state, import_batch_id, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          orderId,
          store_id,
          orderNo,
          orderedAt,
          orderDate,
          normalizedStatus,
          firstRow.status_raw || null,
          firstRow.buyer_note || null,
          'belum',
          batchId,
          now
        )
    );
    createdOrders++;

    // Insert order lines
    orderRows.forEach((row, lineIdx) => {
      const lineNo = lineIdx + 1;
      const normVar = normalizeVariationKey(row.variation);

      // Mapping lookup:
      // 1. Exact match with store_sku + variation
      // 2. Match with store_sku alone
      const mapping =
        mappingMap.get(`${row.store_sku}:::${normVar}`) || mappingSkuOnlyMap.get(row.store_sku);

      let resolveState = 'perlu_mapping';
      let mappingId: number | null = null;

      if (mapping) {
        mappingId = mapping.id;
        if (mapping.map_type === 'random') {
          resolveState = 'menunggu_fisik';
          resolvedMenungguFisik++;
        } else {
          // Pasti / bundle: check if variant exists in master
          const variant =
            variantLookup.get(`${mapping.product_id}:::${mapping.size}:::${mapping.color}`) ||
            (mapping.size && mapping.color
              ? null
              : (allVariants as DbVariantItem[])?.find(
                  (v) =>
                    v.product_id === mapping.product_id &&
                    (!mapping.size || v.size === mapping.size) &&
                    (!mapping.color || v.color === mapping.color)
                ));

          if (variant) {
            resolveState = 'siap_keluar';
            resolvedSiapKeluar++;
          } else {
            resolveState = 'perlu_mapping';
            resolvedPerluMapping++;
          }
        }
      } else {
        // Fallback: check if store_sku directly matches master product SKU
        const directVariant = (allVariants as DbVariantItem[])?.find((v) => {
          const skuMatch = v.product_sku.toLowerCase() === row.store_sku.toLowerCase();
          if (!skuMatch) return false;
          if (!row.variation) return true;
          const varLower = row.variation.toLowerCase();
          return (
            varLower.includes(v.size.toLowerCase()) && varLower.includes(v.color.toLowerCase())
          );
        });

        if (directVariant) {
          resolveState = 'siap_keluar';
          resolvedSiapKeluar++;
        } else {
          resolveState = 'perlu_mapping';
          resolvedPerluMapping++;
        }
      }

      statements.push(
        db
          .prepare(
            `INSERT INTO order_lines (order_id, line_no, store_sku, variation, qty, mapping_id, resolve_state)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            orderId,
            lineNo,
            row.store_sku,
            row.variation || '',
            row.qty,
            mappingId,
            resolveState
          )
      );
    });
  }

  // Execute batch operations
  if (statements.length > 0) {
    // Split in batches of 50 to respect D1 limits
    for (let i = 0; i < statements.length; i += 50) {
      await db.batch(statements.slice(i, i + 50));
    }
  }

  return c.json({
    batch_id: batchId,
    created_orders: createdOrders,
    updated_orders: updatedOrders,
    lines_count: rows.length,
    resolved: {
      siap_keluar: resolvedSiapKeluar,
      menunggu_fisik: resolvedMenungguFisik,
      perlu_mapping: resolvedPerluMapping,
    },
    canceled_safe: canceledSafe,
    canceled_needs_return: canceledNeedsReturn,
  });
});

// POST /api/orders/process (Batch atomik pengurangan stok & pencatatan HPP snapshot, R-48, R-49)
ordersRoute.post('/process', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = ProcessOrdersSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Parameter proses pesanan tidak valid',
        },
      },
      400
    );
  }

  const { line_ids, all_ready, store_id } = parsed.data;
  const db = c.env.DB;
  const today = getWibDateString();
  const now = Date.now();
  const user = c.get('user');

  const whereClauses = ["ol.resolve_state = 'siap_keluar'", "o.stock_state = 'belum'"];
  const params: unknown[] = [];

  if (!all_ready && line_ids && line_ids.length > 0) {
    const placeholders = line_ids.map(() => '?').join(',');
    whereClauses.push(`ol.id IN (${placeholders})`);
    params.push(...line_ids);
  }

  if (store_id) {
    whereClauses.push('o.store_id = ?');
    params.push(store_id);
  }

  // Fetch ready lines
  const { results: readyLines } = await db
    .prepare(
      `SELECT 
        ol.id as line_id, ol.order_id, ol.qty as order_qty,
        o.order_no, o.store_id,
        m.qty_multiplier, m.size as mapped_size, m.color as mapped_color,
        v.id as variant_id, v.hpp as variant_hpp
      FROM order_lines ol
      JOIN orders o ON o.id = ol.order_id
      LEFT JOIN sku_mappings m ON m.id = ol.mapping_id
      LEFT JOIN variants v ON (
        (m.id IS NOT NULL AND v.product_id = m.product_id AND (m.size IS NULL OR v.size = m.size) AND (m.color IS NULL OR v.color = m.color))
        OR (m.id IS NULL AND v.id = (
          SELECT v2.id FROM variants v2 
          JOIN products pr ON pr.id = v2.product_id 
          WHERE LOWER(pr.sku) = LOWER(ol.store_sku) LIMIT 1
        ))
      )
      WHERE ${whereClauses.join(' AND ')} AND v.id IS NOT NULL`
    )
    .bind(...params)
    .all();

  if (!readyLines || readyLines.length === 0) {
    return c.json(
      {
        processed_lines: 0,
        total_pcs: 0,
        total_cogs: 0,
        message: 'Tidak ada baris pesanan siap keluar yang ditemukan untuk diproses.',
      },
      200
    );
  }

  const statements: D1PreparedStatement[] = [];
  const processedOrders = new Set<number>();
  let totalPcs = 0;
  let totalCogs = 0;

  for (const line of (readyLines || []) as ReadyOrderLine[]) {
    const multiplier = line.qty_multiplier || 1;
    const physicalQty = calculatePhysicalQty(line.order_qty, multiplier);
    const hpp = line.variant_hpp || 0;
    const cogs = Math.round(physicalQty * hpp);

    totalPcs += physicalQty;
    totalCogs += cogs;
    processedOrders.add(line.order_id);

    // 1. Insert into outbound_items
    statements.push(
      db
        .prepare(
          `INSERT INTO outbound_items (out_date, store_id, order_line_id, variant_id, qty, hpp_snapshot, cogs, note, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          today,
          line.store_id,
          line.line_id,
          line.variant_id,
          physicalQty,
          hpp,
          cogs,
          `Pesanan ${line.order_no}`,
          user?.email || 'admin@local',
          now
        )
    );

    // 2. Insert into stock_movements (atomic deduction)
    statements.push(
      db
        .prepare(
          `INSERT INTO stock_movements (variant_id, moved_on, kind, qty_delta, unit_cost, ref_type, ref_id, note, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          line.variant_id,
          today,
          'sale',
          -physicalQty,
          hpp,
          'outbound_item',
          line.line_id,
          `Pesanan ${line.order_no}`,
          user?.email || 'admin@local',
          now
        )
    );

    // 3. Update order line resolve_state
    statements.push(
      db.prepare("UPDATE order_lines SET resolve_state = 'selesai' WHERE id = ?").bind(line.line_id)
    );
  }

  // 4. Update orders stock_state = 'keluar'
  for (const orderId of processedOrders) {
    statements.push(
      db
        .prepare("UPDATE orders SET stock_state = 'keluar', updated_at = ? WHERE id = ?")
        .bind(now, orderId)
    );
  }

  // Execute in batches
  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }

  return c.json({
    success: true,
    processed_lines: readyLines.length,
    processed_orders: processedOrders.size,
    total_pcs: totalPcs,
    total_cogs: totalCogs,
  });
});

// POST /api/orders/lines/:id/resolve-random (R-46)
ordersRoute.post('/lines/:id/resolve-random', async (c) => {
  const lineId = Number(c.req.param('id'));
  if (isNaN(lineId) || lineId <= 0) {
    return c.json({ error: { code: 'VALIDATION', message: 'ID baris tidak valid' } }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = ResolveRandomSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Pilihan varian fisik tidak valid',
          details: parsed.error.format(),
        },
      },
      400
    );
  }

  const db = c.env.DB;
  const line = await db
    .prepare(
      `SELECT ol.id, ol.order_id, ol.qty, ol.resolve_state, m.qty_multiplier
       FROM order_lines ol
       LEFT JOIN sku_mappings m ON m.id = ol.mapping_id
       WHERE ol.id = ?`
    )
    .bind(lineId)
    .first<{
      id: number;
      order_id: number;
      qty: number;
      resolve_state: string;
      qty_multiplier: number | null;
    }>();

  if (!line) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Baris pesanan tidak ditemukan' } }, 404);
  }

  const requiredPcs = calculatePhysicalQty(line.qty, line.qty_multiplier || 1);
  const totalPickedPcs = parsed.data.picks.reduce((sum, p) => sum + p.qty, 0);

  if (totalPickedPcs !== requiredPcs) {
    return c.json(
      {
        error: {
          code: 'MISMATCH',
          message: `Total varian yang dipilih (${totalPickedPcs} pcs) harus sama persis dengan total fisik pesanan (${requiredPcs} pcs).`,
        },
      },
      400
    );
  }

  // Update line to 'siap_keluar'
  await db
    .prepare("UPDATE order_lines SET resolve_state = 'siap_keluar' WHERE id = ?")
    .bind(lineId)
    .run();

  return c.json({
    success: true,
    message: 'Varian fisik random berhasil dialokasikan. Baris siap diproses.',
  });
});
