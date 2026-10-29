export type UserRole = 'owner' | 'admin' | 'viewer';

export interface User {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  is_active: number;
  created_at: number;
}

export interface ApiError {
  error: {
    code:
      | 'VALIDATION'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'FORBIDDEN'
      | 'UNAUTHORIZED'
      | 'LIMIT'
      | 'INTERNAL_ERROR';
    message: string;
    details?: unknown;
  };
}

// Master Entities for Sync
export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  is_active: number;
  updated_at: number;
}

export interface Variant {
  id: number;
  product_id: number;
  size: string;
  color: string;
  hpp: number;
  sell_price: number;
  min_stock: number;
  is_active: number;
  updated_at: number;
}

export interface StockBalance {
  variant_id: number;
  qty: number;
  updated_at: number;
}

export type StoreChannel = 'shopee' | 'tiktok' | 'tokopedia' | 'lazada' | 'offline' | 'reseller';

export interface Store {
  id: number;
  code: string;
  name: string;
  channel: StoreChannel;
  is_active: number;
  updated_at: number;
}

export type PartnerType = 'konveksi' | 'supplier' | 'reseller' | 'toko_online';

export interface Partner {
  id: number;
  code: string | null;
  name: string;
  type: PartnerType;
  pic: string | null;
  phone: string | null;
  note: string | null;
  is_active: number;
  updated_at: number;
}

export type MappingType = 'pasti' | 'random' | 'bundle' | 'setelan';

export interface SkuMapping {
  id: number;
  store_id: number;
  store_sku: string;
  variation_key: string;
  product_id: number;
  size: string | null;
  color: string | null;
  qty_multiplier: number;
  map_type: MappingType;
  note: string | null;
  updated_at: number;
}

export interface FeeProfile {
  id: number;
  name: string;
  admin_pct: number;
  service_pct: number;
  payment_pct: number;
  updated_at: number;
}

export interface Setting {
  key: string;
  value: string;
  updated_at: number;
}

export interface SyncResponse {
  cursor: number;
  products: Product[];
  variants: Variant[];
  stock: StockBalance[];
  stores: Store[];
  partners: Partner[];
  mappings: SkuMapping[];
  fee_profiles: FeeProfile[];
  settings: Setting[];
}

export interface MasterState {
  cursor: number;
  lastSyncedAt: number;
  products: Record<number, Product>;
  variants: Record<number, Variant>;
  stock: Record<number, StockBalance>;
  stores: Record<number, Store>;
  partners: Record<number, Partner>;
  mappings: Record<number, SkuMapping>;
  fee_profiles: Record<number, FeeProfile>;
  settings: Record<string, Setting>;
}
