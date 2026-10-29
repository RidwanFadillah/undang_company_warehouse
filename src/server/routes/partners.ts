import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { CreatePartnerSchema, UpdatePartnerSchema } from '../../shared/schema';

export const partnersRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/partners
partnersRoute.get('/', async (c) => {
  const db = c.env.DB;
  const type = c.req.query('type');
  const all = c.req.query('all') === '1';

  let sql =
    'SELECT id, code, name, type, pic, phone, note, is_active, updated_at FROM partners WHERE 1=1';
  const params: unknown[] = [];

  if (!all) {
    sql += ' AND is_active = 1';
  }
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  sql += ' ORDER BY name ASC';

  const stmt = params.length > 0 ? db.prepare(sql).bind(...params) : db.prepare(sql);
  const { results } = await stmt.all();

  return c.json({ partners: results || [] });
});

// POST /api/partners
partnersRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreatePartnerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Data mitra tidak valid',
          details: parsed.error.format(),
        },
      },
      400
    );
  }

  const db = c.env.DB;
  const now = Date.now();
  const { code, name, type, pic, phone, note } = parsed.data;

  // Check code uniqueness if provided
  if (code) {
    const existing = await db
      .prepare('SELECT id FROM partners WHERE code = ?')
      .bind(code)
      .first<{ id: number }>();
    if (existing) {
      return c.json(
        {
          error: {
            code: 'CONFLICT',
            message: `Kode mitra "${code}" sudah digunakan`,
          },
        },
        409
      );
    }
  }

  const res = await db
    .prepare(
      `INSERT INTO partners (code, name, type, pic, phone, note, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    )
    .bind(code || null, name, type, pic || null, phone || null, note || null, now)
    .run();

  const partnerId = res.meta?.last_row_id;
  const partner = await db
    .prepare(
      'SELECT id, code, name, type, pic, phone, note, is_active, updated_at FROM partners WHERE id = ?'
    )
    .bind(partnerId)
    .first();

  return c.json({ partner }, 201);
});

// PUT /api/partners/:id
partnersRoute.put('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id) || id <= 0) {
    return c.json({ error: { code: 'VALIDATION', message: 'ID mitra tidak valid' } }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = UpdatePartnerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Data pembaruan mitra tidak valid',
          details: parsed.error.format(),
        },
      },
      400
    );
  }

  const db = c.env.DB;
  const existing = await db.prepare('SELECT id FROM partners WHERE id = ?').bind(id).first();
  if (!existing) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Mitra tidak ditemukan' } }, 404);
  }

  const { code, name, type, pic, phone, note, is_active } = parsed.data;
  const now = Date.now();

  const updates: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (code !== undefined) {
    updates.push('code = ?');
    params.push(code || null);
  }
  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }
  if (type !== undefined) {
    updates.push('type = ?');
    params.push(type);
  }
  if (pic !== undefined) {
    updates.push('pic = ?');
    params.push(pic || null);
  }
  if (phone !== undefined) {
    updates.push('phone = ?');
    params.push(phone || null);
  }
  if (note !== undefined) {
    updates.push('note = ?');
    params.push(note || null);
  }
  if (is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(is_active);
  }

  params.push(id);
  const sql = `UPDATE partners SET ${updates.join(', ')} WHERE id = ?`;
  await db
    .prepare(sql)
    .bind(...params)
    .run();

  const updated = await db
    .prepare(
      'SELECT id, code, name, type, pic, phone, note, is_active, updated_at FROM partners WHERE id = ?'
    )
    .bind(id)
    .first();

  return c.json({ partner: updated });
});
