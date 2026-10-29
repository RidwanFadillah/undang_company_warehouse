import type { Product, Variant, StockBalance } from '../../shared/types';

export interface IndexedItem {
  variantId: number;
  productId: number;
  sku: string;
  productName: string;
  category: string;
  size: string;
  color: string;
  hpp: number;
  sellPrice: number;
  stockQty: number;
  searchStr: string; // Pre-normalized lowercase string for fast substring search
}

export class SkuSearchIndex {
  private items: IndexedItem[] = [];

  public buildIndex(
    products: Record<number, Product>,
    variants: Record<number, Variant>,
    stock: Record<number, StockBalance>
  ): void {
    const list: IndexedItem[] = [];

    for (const v of Object.values(variants)) {
      if (v.is_active !== 1) continue;
      const p = products[v.product_id];
      const prodName = p ? p.name : '';
      const prodSku = p ? p.sku : '';
      const category = p?.category || '';
      const stockQty = stock[v.id]?.qty ?? 0;

      const searchStr = `${prodSku} ${prodName} ${v.size} ${v.color} ${category}`.toLowerCase();

      list.push({
        variantId: v.id,
        productId: v.product_id,
        sku: prodSku,
        productName: prodName,
        category,
        size: v.size,
        color: v.color,
        hpp: v.hpp,
        sellPrice: v.sell_price,
        stockQty,
        searchStr,
      });
    }

    this.items = list;
  }

  public search(query: string, limit: number = 50): IndexedItem[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return this.items.slice(0, limit);
    }

    const tokens = q.split(/\s+/).filter(Boolean);
    const results: IndexedItem[] = [];

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      let matches = true;
      for (let t = 0; t < tokens.length; t++) {
        if (!item.searchStr.includes(tokens[t])) {
          matches = false;
          break;
        }
      }

      if (matches) {
        results.push(item);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  public get size(): number {
    return this.items.length;
  }
}

export const globalSkuIndex = new SkuSearchIndex();
