import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { CreateInboundSchema, InboundQuerySchema } from '../../shared/schema';
import { getWibDateString } from '../../shared/rules/date';

export const inboundRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/inbound
inboundRoute.get('/', async (c) => {
  const db = c.env.DB;
  const parsed = InboundQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION', message: 'Parameter query tidak valid' } }, 400);
  }

  const { month, partner_id, source, limit } = parsed.data;

  let sql = `
    SELECT 
      d.id, d.doc_no, d.doc_date, d.source, d.partner_id, p.name as partner_name,
      d.batch_id, d.invoice_id, d.note, d.voided_at, d.created_by, d.created_at,
      COUNT(l.id) as line_count,
      COALESCE(SUM(l.qty), 0) as total_qty,
      COALESCE(SUM(ROUND(l.qty * l.unit_cost)), 0) as total_amount
    FROM inbound_docs d
    LEFT JOIN partners p ON p.id = d.partner_id
    LEFT JOIN inbound_lines l ON l.doc_id = d.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (month) {
    sql += ' AND d.doc_date LIKE ?';
    params.push(`${month}%`);
  }
  if (partner_id) {
    sql += ' AND d.partner_id = ?';
    params.push(partner_id);
  }
  if (source) {
    sql += ' AND d.source = ?';
    params.push(source);
  }

  sql += ' GROUP BY d.id ORDER BY d.doc_date DESC, d.id DESC LIMIT ?';
  params.push(limit);

  const stmt = db.prepare(sql).bind(...params);
  const { results } = await stmt.all();

  return c.json({ docs: results || [] });
});

// GET /api/inbound/:id
inboundRoute.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id) || id <= 0) {
    return c.json({ error: { code: 'VALIDATION', message: 'ID dokumen tidak valid' } }, 400);
  }

  const db = c.env.DB;

  const doc = await db
    .prepare(
      `SELECT 
        d.id, d.doc_no, d.doc_date, d.source, d.partner_id, p.name as partner_name,
        d.batch_id, d.invoice_id, d.note, d.voided_at, d.created_by, d.created_at
      FROM inbound_docs d
      LEFT JOIN partners p ON p.id = d.partner_id
      WHERE d.id = ?`
    )
    .bind(id)
    .first();

  if (!doc) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Dokumen tidak ditemukan' } }, 404);
  }

  const { results: lines } = await db
    .prepare(
      `SELECT 
        l.id, l.doc_id, l.variant_id, l.qty, l.unit_cost,
        ROUND(l.qty * l.unit_cost) as total_cost,
        pr.sku, pr.name as product_name, v.size, v.color
      FROM inbound_lines l
      JOIN variants v ON v.id = l.variant_id
      JOIN products pr ON pr.id = v.product_id
      WHERE l.doc_id = ?
      ORDER BY l.id ASC`
    )
    .bind(id)
    .all();

  return c.json({
    doc: {
      ...doc,
      lines: lines || [],
    },
  });
});

// POST /api/inbound
inboundRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateInboundSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Data dokumen masuk tidak valid',
          details: parsed.error.format(),
        },
      },
      400
    );
  }

  const db = c.env.DB;
  const userEmail = c.get('userEmail') || 'system';
  const now = Date.now();
  const { doc_date, source, partner_id, batch_id, note, create_invoice, due_date, lines } =
    parsed.data;

  // Allocate next doc_id
  const nextDoc = await db
    .prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM inbound_docs')
    .first<{ next_id: number }>();
  const docId = nextDoc?.next_id || 1;

  // Generate doc_no if not provided
  const docNo =
    parsed.data.doc_no && parsed.data.doc_no.trim() !== ''
      ? parsed.data.doc_no.trim()
      : `INB-${doc_date.replace(/-/g, '')}-${String(docId).padStart(4, '0')}`;

  // Check unique doc_no
  const existingDocNo = await db
    .prepare('SELECT id FROM inbound_docs WHERE doc_no = ?')
    .bind(docNo)
    .first();
  if (existingDocNo) {
    return c.json(
      {
        error: {
          code: 'CONFLICT',
          message: `Nomor dokumen "${docNo}" sudah ada`,
        },
      },
      409
    );
  }

  // Handle supplier invoice creation if requested
  let invoiceId: number | null = null;
  const statements: D1PreparedStatement[] = [];

  if (create_invoice && partner_id) {
    const totalAmount = lines.reduce((acc, l) => acc + Math.round(l.qty * l.unit_cost), 0);
    if (totalAmount > 0) {
      const nextInv = await db
        .prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM supplier_invoices')
        .first<{ next_id: number }>();
      invoiceId = nextInv?.next_id || 1;

      statements.push(
        db
          .prepare(
            `INSERT INTO supplier_invoices (id, invoice_no, invoice_date, partner_id, amount, due_date, note, voided_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`
          )
          .bind(
            invoiceId,
            docNo,
            doc_date,
            partner_id,
            totalAmount,
            due_date || null,
            `Tagihan dari dokumen ${docNo}`,
            now
          )
      );
    }
  }

  // Insert inbound_docs
  statements.push(
    db
      .prepare(
        `INSERT INTO inbound_docs (id, doc_no, doc_date, source, partner_id, batch_id, invoice_id, note, voided_at, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
      )
      .bind(
        docId,
        docNo,
        doc_date,
        source,
        partner_id || null,
        batch_id || null,
        invoiceId,
        note || null,
        userEmail,
        now
      )
  );

  // Insert lines and movements
  const movementKind = source === 'beli' ? 'purchase' : 'maklun_in';

  for (const line of lines) {
    // 1. Line
    statements.push(
      db
        .prepare(
          `INSERT INTO inbound_lines (doc_id, variant_id, qty, unit_cost)
           VALUES (?, ?, ?, ?)`
        )
        .bind(docId, line.variant_id, line.qty, line.unit_cost)
    );

    // 2. Stock Movement (append-only)
    statements.push(
      db
        .prepare(
          `INSERT INTO stock_movements (variant_id, moved_on, kind, qty_delta, unit_cost, ref_type, ref_id, note, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, 'inbound_doc', ?, ?, ?, ?)`
        )
        .bind(
          line.variant_id,
          doc_date,
          movementKind,
          line.qty,
          line.unit_cost,
          docId,
          `${docNo} - ${source.toUpperCase()}`,
          userEmail,
          now
        )
    );
  }

  // Execute atomically
  await db.batch(statements);

  return c.json(
    {
      doc: {
        id: docId,
        doc_no: docNo,
        doc_date,
        source,
        partner_id: partner_id || null,
        invoice_id: invoiceId,
        line_count: lines.length,
      },
      message: 'Dokumen barang masuk berhasil disimpan',
    },
    201
  );
});

// POST /api/inbound/:id/void
inboundRoute.post('/:id/void', async (c) => {
  const id = Number(c.req.param('id'));
  if (isNaN(id) || id <= 0) {
    return c.json({ error: { code: 'VALIDATION', message: 'ID dokumen tidak valid' } }, 400);
  }

  const db = c.env.DB;
  const userEmail = c.get('userEmail') || 'system';
  const now = Date.now();
  const todayWib = getWibDateString(now);

  const doc = await db
    .prepare('SELECT id, doc_no, invoice_id, voided_at FROM inbound_docs WHERE id = ?')
    .bind(id)
    .first<{ id: number; doc_no: string; invoice_id: number | null; voided_at: number | null }>();

  if (!doc) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Dokumen tidak ditemukan' } }, 404);
  }

  if (doc.voided_at) {
    return c.json({ error: { code: 'CONFLICT', message: 'Dokumen sudah pernah di-void' } }, 400);
  }

  // Get lines to create counter movements
  const { results: lines } = await db
    .prepare('SELECT variant_id, qty, unit_cost FROM inbound_lines WHERE doc_id = ?')
    .bind(id)
    .all<{ variant_id: number; qty: number; unit_cost: number }>();

  if (!lines || lines.length === 0) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Baris dokumen tidak ditemukan' } }, 404);
  }

  const statements: D1PreparedStatement[] = [];

  // 1. Mark doc as voided
  statements.push(db.prepare('UPDATE inbound_docs SET voided_at = ? WHERE id = ?').bind(now, id));

  // 2. Mark invoice as voided if exists
  if (doc.invoice_id) {
    statements.push(
      db
        .prepare('UPDATE supplier_invoices SET voided_at = ? WHERE id = ?')
        .bind(now, doc.invoice_id)
    );
  }

  // 3. Append counter movements with kind = 'void' and negative qty_delta
  for (const line of lines) {
    statements.push(
      db
        .prepare(
          `INSERT INTO stock_movements (variant_id, moved_on, kind, qty_delta, unit_cost, ref_type, ref_id, note, created_by, created_at)
           VALUES (?, ?, 'void', ?, ?, 'inbound_doc', ?, ?, ?, ?)`
        )
        .bind(
          line.variant_id,
          todayWib,
          -line.qty,
          line.unit_cost,
          id,
          `Void Dokumen ${doc.doc_no}`,
          userEmail,
          now
        )
    );
  }

  // Execute atomically
  await db.batch(statements);

  return c.json({
    success: true,
    message: `Dokumen ${doc.doc_no} berhasil dibatalkan (void) dan stok telah dikembalikan.`,
  });
});
