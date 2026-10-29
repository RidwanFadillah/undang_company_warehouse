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

// Stock & Product Schemas
export const AdjustStockSchema = z.object({
  items: z
    .array(
      z.object({
        variant_id: z.number().int().positive(),
        counted_qty: z.number().int(),
      })
    )
    .min(1),
  note: z.string().optional().default('Stock Opname Fisik'),
});

export const CreateProductSchema = z.object({
  sku: z.string().min(1).toUpperCase(),
  name: z.string().min(1),
  category: z.string().optional().nullable(),
  variants: z
    .array(
      z.object({
        size: z.string().default('-'),
        color: z.string().default('-'),
        hpp: z.number().nonnegative().default(0),
        sell_price: z.number().int().nonnegative().default(0),
        min_stock: z.number().int().nonnegative().default(0),
      })
    )
    .optional(),
});

export const BulkCreateVariantsSchema = z.object({
  product_id: z.number().int().positive(),
  sizes: z.array(z.string().min(1)).min(1),
  colors: z.array(z.string().min(1)).min(1),
  hpp: z.number().nonnegative().default(0),
  sell_price: z.number().int().nonnegative().default(0),
  min_stock: z.number().int().nonnegative().default(0),
});

export const UpdateVariantSchema = z.object({
  hpp: z.number().nonnegative().optional(),
  sell_price: z.number().int().nonnegative().optional(),
  min_stock: z.number().int().nonnegative().optional(),
  is_active: z.number().int().min(0).max(1).optional(),
});

export const SetHppBySizeSchema = z.object({
  hpp_by_size: z.record(z.string(), z.number().nonnegative()),
});

// Inbound Schemas
export const InboundLineItemSchema = z.object({
  variant_id: z.number().int().positive(),
  qty: z.number().int().positive(),
  unit_cost: z.number().nonnegative().default(0),
});

export const CreateInboundSchema = z.object({
  doc_no: z.string().optional().nullable(),
  doc_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD'),
  source: z.enum(['beli', 'maklun']).default('beli'),
  partner_id: z.number().int().positive().optional().nullable(),
  batch_id: z.number().int().positive().optional().nullable(),
  note: z.string().optional().nullable(),
  create_invoice: z.boolean().optional().default(false),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  lines: z.array(InboundLineItemSchema).min(1, 'Minimal 1 baris barang masuk'),
});

export const InboundQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  partner_id: z.coerce.number().int().positive().optional(),
  source: z.enum(['beli', 'maklun']).optional(),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

// Partner Schemas
export const CreatePartnerSchema = z.object({
  code: z.string().optional().nullable(),
  name: z.string().min(1, 'Nama mitra wajib diisi'),
  type: z.enum(['konveksi', 'supplier', 'reseller', 'toko_online']),
  pic: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

export const UpdatePartnerSchema = CreatePartnerSchema.partial().extend({
  is_active: z.number().int().min(0).max(1).optional(),
});

// Orders & Outbound Schemas
export const ImportOrderRowSchema = z.object({
  order_no: z.string().min(1, 'No. Pesanan wajib ada'),
  ordered_at: z.string().optional().nullable(),
  status_raw: z.string().optional().nullable(),
  store_sku: z.string().min(1, 'SKU Toko wajib ada'),
  variation: z.string().optional().nullable().default(''),
  qty: z.number().int().positive('Qty harus lebih besar dari 0'),
  buyer_note: z.string().optional().nullable(),
});

export const ImportOrdersSchema = z.object({
  store_id: z.number().int().positive(),
  filename: z.string().optional().nullable(),
  rows: z.array(ImportOrderRowSchema).min(1, 'Minimal 1 baris pesanan').max(1000),
});

export const ProcessOrdersSchema = z.object({
  line_ids: z.array(z.number().int().positive()).optional(),
  all_ready: z.boolean().optional().default(false),
  store_id: z.number().int().positive().optional().nullable(),
});

export const ResolveRandomSchema = z.object({
  picks: z
    .array(
      z.object({
        variant_id: z.number().int().positive(),
        qty: z.number().int().positive(),
      })
    )
    .min(1),
});

export const CreateOutboundSchema = z.object({
  out_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD'),
  store_id: z.number().int().positive().optional().nullable(),
  note: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        variant_id: z.number().int().positive(),
        qty: z.number().int().positive(),
      })
    )
    .min(1),
});

export const CreateSkuMappingSchema = z.object({
  store_id: z.number().int().positive(),
  store_sku: z.string().min(1),
  variation_key: z.string().default(''),
  product_id: z.number().int().positive(),
  size: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  qty_multiplier: z.number().int().positive().default(1),
  map_type: z.enum(['pasti', 'random', 'bundle', 'setelan']).default('pasti'),
  note: z.string().optional().nullable(),
});

export const BulkCreateSkuMappingSchema = z.object({
  mappings: z.array(CreateSkuMappingSchema).min(1),
});

export type UserRole = z.infer<typeof UserRoleSchema>;
export type User = z.infer<typeof UserSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
export type SyncQuery = z.infer<typeof SyncQuerySchema>;
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
export type AdjustStockInput = z.infer<typeof AdjustStockSchema>;
export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type BulkCreateVariantsInput = z.infer<typeof BulkCreateVariantsSchema>;
export type UpdateVariantInput = z.infer<typeof UpdateVariantSchema>;
export type SetHppBySizeInput = z.infer<typeof SetHppBySizeSchema>;
export type CreateInboundInput = z.infer<typeof CreateInboundSchema>;
export type CreatePartnerInput = z.infer<typeof CreatePartnerSchema>;
export type UpdatePartnerInput = z.infer<typeof UpdatePartnerSchema>;
export type ImportOrderRow = z.infer<typeof ImportOrderRowSchema>;
export type ImportOrdersInput = z.infer<typeof ImportOrdersSchema>;
export type ProcessOrdersInput = z.infer<typeof ProcessOrdersSchema>;
export type ResolveRandomInput = z.infer<typeof ResolveRandomSchema>;
export type CreateOutboundInput = z.infer<typeof CreateOutboundSchema>;
export type CreateSkuMappingInput = z.infer<typeof CreateSkuMappingSchema>;
export type BulkCreateSkuMappingInput = z.infer<typeof BulkCreateSkuMappingSchema>;
