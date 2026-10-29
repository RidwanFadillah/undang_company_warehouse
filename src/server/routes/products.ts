import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import {
  CreateProductSchema,
  BulkCreateVariantsSchema,
  UpdateVariantSchema,
  SetHppBySizeSchema,
} from '../../shared/schema';

export const productsRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/products (Create product + initial variants)
productsRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateProductSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Invalid product payload',
          details: parsed.error.format(),
        },
      },
      400
    );
  }

  const db = c.env.DB;
  const now = Date.now();
  const { sku, name, category, variants } = parsed.data;

  // Insert product
  const productRes = await db
    .prepare(
      'INSERT INTO products (sku, name, category, is_active, updated_at) VALUES (?, ?, ?, 1, ?) RETURNING id'
    )
    .bind(sku, name, category || null, now)
    .first<{ id: number }>();

  if (!productRes?.id) {
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create product' } }, 500);
  }

  const productId = productRes.id;

  // Insert variants if provided
  if (variants && variants.length > 0) {
    const stmts = variants.map((v) =>
      db
        .prepare(
          `INSERT INTO variants (product_id, size, color, hpp, sell_price, min_stock, is_active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)
           ON CONFLICT(product_id, size, color) DO UPDATE SET
             hpp = excluded.hpp,
             sell_price = excluded.sell_price,
             min_stock = excluded.min_stock,
             is_active = 1,
             updated_at = excluded.updated_at`
        )
        .bind(productId, v.size, v.color, v.hpp, v.sell_price, v.min_stock, now)
    );
    await db.batch(stmts);
  }

  return c.json({
    success: true,
    product: {
      id: productId,
      sku,
      name,
      category: category || null,
      updated_at: now,
    },
  });
});

// POST /api/products/variants/bulk (Bulk create variants for a product)
productsRoute.post('/variants/bulk', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = BulkCreateVariantsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Invalid bulk variants payload',
          details: parsed.error.format(),
        },
      },
      400
    );
  }

  const db = c.env.DB;
  const now = Date.now();
  const { product_id, sizes, colors, hpp, sell_price, min_stock } = parsed.data;

  const stmts = [];
  for (const size of sizes) {
    for (const color of colors) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO variants (product_id, size, color, hpp, sell_price, min_stock, is_active, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?)
             ON CONFLICT(product_id, size, color) DO UPDATE SET
               hpp = excluded.hpp,
               sell_price = excluded.sell_price,
               min_stock = excluded.min_stock,
               is_active = 1,
               updated_at = excluded.updated_at`
          )
          .bind(product_id, size, color, hpp, sell_price, min_stock, now)
      );
    }
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return c.json({
    success: true,
    count: stmts.length,
    updated_at: now,
  });
});

// POST /api/products/:id/hpp-by-size ("Atur HPP per size")
productsRoute.post('/:id/hpp-by-size', async (c) => {
  const productId = Number(c.req.param('id'));
  if (isNaN(productId)) {
    return c.json({ error: { code: 'VALIDATION', message: 'Invalid product ID' } }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = SetHppBySizeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Invalid hpp-by-size payload',
          details: parsed.error.format(),
        },
      },
      400
    );
  }

  const db = c.env.DB;
  const now = Date.now();
  const { hpp_by_size } = parsed.data;

  const stmts = Object.entries(hpp_by_size).map(([size, hpp]) =>
    db
      .prepare('UPDATE variants SET hpp = ?, updated_at = ? WHERE product_id = ? AND size = ?')
      .bind(hpp, now, productId, size)
  );

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return c.json({
    success: true,
    updated_sizes: Object.keys(hpp_by_size).length,
    updated_at: now,
  });
});

// PATCH /api/products/variants/:id (Update single variant)
productsRoute.patch('/variants/:id', async (c) => {
  const variantId = Number(c.req.param('id'));
  if (isNaN(variantId)) {
    return c.json({ error: { code: 'VALIDATION', message: 'Invalid variant ID' } }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = UpdateVariantSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Invalid variant update payload',
          details: parsed.error.format(),
        },
      },
      400
    );
  }

  const db = c.env.DB;
  const now = Date.now();
  const updates: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (parsed.data.hpp !== undefined) {
    updates.push('hpp = ?');
    params.push(parsed.data.hpp);
  }
  if (parsed.data.sell_price !== undefined) {
    updates.push('sell_price = ?');
    params.push(parsed.data.sell_price);
  }
  if (parsed.data.min_stock !== undefined) {
    updates.push('min_stock = ?');
    params.push(parsed.data.min_stock);
  }
  if (parsed.data.is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(parsed.data.is_active);
  }

  params.push(variantId);
  await db
    .prepare(`UPDATE variants SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return c.json({
    success: true,
    variant_id: variantId,
    updated_at: now,
  });
});
