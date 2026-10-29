import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { SyncQuerySchema } from '../../shared/schema';
import type {
  Product,
  Variant,
  StockBalance,
  Store,
  Partner,
  SkuMapping,
  FeeProfile,
  Setting,
  SyncResponse,
} from '../../shared/types';

export const syncRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

syncRoute.get('/', async (c) => {
  const query = c.req.query();
  const parsed = SyncQuerySchema.safeParse(query);
  const since = parsed.success ? parsed.data.since : 0;

  const db = c.env.DB;

  // Single atomic batch query for all 8 entities per AGENTS.md
  const [
    productsRes,
    variantsRes,
    stockRes,
    storesRes,
    partnersRes,
    mappingsRes,
    feeProfilesRes,
    settingsRes,
  ] = await db.batch([
    db
      .prepare(
        'SELECT id, sku, name, category, is_active, updated_at FROM products WHERE updated_at > ? ORDER BY updated_at ASC'
      )
      .bind(since),
    db
      .prepare(
        'SELECT id, product_id, size, color, hpp, sell_price, min_stock, is_active, updated_at FROM variants WHERE updated_at > ? ORDER BY updated_at ASC'
      )
      .bind(since),
    db
      .prepare(
        'SELECT variant_id, qty, updated_at FROM stock_balance WHERE updated_at > ? ORDER BY updated_at ASC'
      )
      .bind(since),
    db
      .prepare(
        'SELECT id, code, name, channel, is_active, updated_at FROM stores WHERE updated_at > ? ORDER BY updated_at ASC'
      )
      .bind(since),
    db
      .prepare(
        'SELECT id, code, name, type, pic, phone, note, is_active, updated_at FROM partners WHERE updated_at > ? ORDER BY updated_at ASC'
      )
      .bind(since),
    db
      .prepare(
        'SELECT id, store_id, store_sku, variation_key, product_id, size, color, qty_multiplier, map_type, note, updated_at FROM sku_mappings WHERE updated_at > ? ORDER BY updated_at ASC'
      )
      .bind(since),
    db
      .prepare(
        'SELECT id, name, admin_pct, service_pct, payment_pct, updated_at FROM fee_profiles WHERE updated_at > ? ORDER BY updated_at ASC'
      )
      .bind(since),
    db
      .prepare(
        'SELECT key, value, updated_at FROM settings WHERE updated_at > ? ORDER BY updated_at ASC'
      )
      .bind(since),
  ]);

  const products = (productsRes.results || []) as unknown as Product[];
  const variants = (variantsRes.results || []) as unknown as Variant[];
  const stock = (stockRes.results || []) as unknown as StockBalance[];
  const stores = (storesRes.results || []) as unknown as Store[];
  const partners = (partnersRes.results || []) as unknown as Partner[];
  const mappings = (mappingsRes.results || []) as unknown as SkuMapping[];
  const fee_profiles = (feeProfilesRes.results || []) as unknown as FeeProfile[];
  const settings = (settingsRes.results || []) as unknown as Setting[];

  // Find max updated_at across all returned rows to advance the cursor
  let maxUpdated = since;
  const updateMax = (items: Array<{ updated_at: number }>) => {
    for (const item of items) {
      if (item.updated_at > maxUpdated) {
        maxUpdated = item.updated_at;
      }
    }
  };

  updateMax(products);
  updateMax(variants);
  updateMax(stock);
  updateMax(stores);
  updateMax(partners);
  updateMax(mappings);
  updateMax(fee_profiles);
  updateMax(settings);

  const etag = `W/"sync-${maxUpdated}"`;
  const ifNoneMatch = c.req.header('if-none-match');

  // If no rows have changed and ETag matches, return 304 Not Modified
  const totalChanged =
    products.length +
    variants.length +
    stock.length +
    stores.length +
    partners.length +
    mappings.length +
    fee_profiles.length +
    settings.length;

  if (ifNoneMatch === etag && totalChanged === 0) {
    return c.body(null, 304);
  }

  const responseBody: SyncResponse = {
    cursor: maxUpdated,
    products,
    variants,
    stock,
    stores,
    partners,
    mappings,
    fee_profiles,
    settings,
  };

  c.header('ETag', etag);
  c.header('Cache-Control', 'private, no-cache');
  return c.json(responseBody);
});
