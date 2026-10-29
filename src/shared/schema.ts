import { z } from 'zod';

export const UserRoleSchema = z.enum(['owner', 'admin', 'viewer']);

export const UserSchema = z.object({
  id: z.number().int(),
  email: z.string().email(),
  name: z.string().nullable(),
  role: UserRoleSchema,
  is_active: z.number().int().min(0).max(1),
  created_at: z.number().int(),
});

export const MeResponseSchema = z.object({
  user: z.object({
    id: z.number().int(),
    email: z.string().email(),
    name: z.string().nullable(),
    role: UserRoleSchema,
  }),
});

export const SyncQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().optional().default(0),
});

export const ProductSchema = z.object({
  id: z.number().int(),
  sku: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  is_active: z.number().int(),
  updated_at: z.number().int(),
});

export const VariantSchema = z.object({
  id: z.number().int(),
  product_id: z.number().int(),
  size: z.string(),
  color: z.string(),
  hpp: z.number(),
  sell_price: z.number().int(),
  min_stock: z.number().int(),
  is_active: z.number().int(),
  updated_at: z.number().int(),
});

export const StockBalanceSchema = z.object({
  variant_id: z.number().int(),
  qty: z.number().int(),
  updated_at: z.number().int(),
});

export const StoreSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  channel: z.enum(['shopee', 'tiktok', 'tokopedia', 'lazada', 'offline', 'reseller']),
  is_active: z.number().int(),
  updated_at: z.number().int(),
});

export const PartnerSchema = z.object({
  id: z.number().int(),
  code: z.string().nullable(),
  name: z.string(),
  type: z.enum(['konveksi', 'supplier', 'reseller', 'toko_online']),
  pic: z.string().nullable(),
  phone: z.string().nullable(),
  note: z.string().nullable(),
  is_active: z.number().int(),
  updated_at: z.number().int(),
});

export const SkuMappingSchema = z.object({
  id: z.number().int(),
  store_id: z.number().int(),
  store_sku: z.string(),
  variation_key: z.string(),
  product_id: z.number().int(),
  size: z.string().nullable(),
  color: z.string().nullable(),
  qty_multiplier: z.number().int(),
  map_type: z.enum(['pasti', 'random', 'bundle', 'setelan']),
  note: z.string().nullable(),
  updated_at: z.number().int(),
});

export const FeeProfileSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  admin_pct: z.number(),
  service_pct: z.number(),
  payment_pct: z.number(),
  updated_at: z.number().int(),
});

export const SettingSchema = z.object({
  key: z.string(),
  value: z.string(),
  updated_at: z.number().int(),
});

export const SyncResponseSchema = z.object({
  cursor: z.number().int(),
  products: z.array(ProductSchema),
  variants: z.array(VariantSchema),
  stock: z.array(StockBalanceSchema),
  stores: z.array(StoreSchema),
  partners: z.array(PartnerSchema),
  mappings: z.array(SkuMappingSchema),
  fee_profiles: z.array(FeeProfileSchema),
  settings: z.array(SettingSchema),
});

export type UserRole = z.infer<typeof UserRoleSchema>;
export type User = z.infer<typeof UserSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
export type SyncQuery = z.infer<typeof SyncQuerySchema>;
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
