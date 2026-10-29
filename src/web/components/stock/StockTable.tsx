import React, { useState, useMemo } from 'react';
import { ArrowUpDown, AlertTriangle } from 'lucide-react';
import type { Product, Variant, StockBalance } from '../../../shared/types';
import { formatQty, formatRupiah } from '../../../shared/rules/units';
import { getStockStatus } from '../../../shared/rules/stock';

interface StockTableProps {
  products: Record<number, Product>;
  variants: Variant[];
  stock: Record<number, StockBalance>;
  unit: 'pcs' | 'lusin';
  filterStatus: 'all' | 'minus' | 'low';
  searchQuery: string;
  onSelectVariant: (variant: Variant) => void;
}

export const StockTable: React.FC<StockTableProps> = ({
  products,
  variants,
  stock,
  unit,
  filterStatus,
  searchQuery,
  onSelectVariant,
}) => {
  const [sortField, setSortField] = useState<'sku' | 'qty' | 'hpp' | 'asset'>('sku');
  const [sortAsc, setSortAsc] = useState(true);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return variants.filter((v) => {
      const p = products[v.product_id];
      const prodName = p?.name?.toLowerCase() || '';
      const prodSku = p?.sku?.toLowerCase() || '';
      const qty = stock[v.id]?.qty ?? 0;
      const status = getStockStatus(qty, v.min_stock);

      if (filterStatus === 'minus' && status !== 'negative') return false;
      if (filterStatus === 'low' && status !== 'low') return false;

      if (q) {
        const matches =
          prodSku.includes(q) ||
          prodName.includes(q) ||
          v.size.toLowerCase().includes(q) ||
          v.color.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [variants, products, stock, filterStatus, searchQuery]);

  // Sort items
  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      const pA = products[a.product_id]?.sku || '';
      const pB = products[b.product_id]?.sku || '';
      const qtyA = stock[a.id]?.qty ?? 0;
      const qtyB = stock[b.id]?.qty ?? 0;
      const assetA = qtyA > 0 ? qtyA * a.hpp : 0;
      const assetB = qtyB > 0 ? qtyB * b.hpp : 0;

      let res = 0;
      if (sortField === 'sku') res = pA.localeCompare(pB);
      else if (sortField === 'qty') res = qtyA - qtyB;
      else if (sortField === 'hpp') res = a.hpp - b.hpp;
      else if (sortField === 'asset') res = assetA - assetB;

      return sortAsc ? res : -res;
    });
  }, [filteredItems, products, stock, sortField, sortAsc]);

  const handleSort = (field: 'sku' | 'qty' | 'hpp' | 'asset') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold select-none">
            <th
              onClick={() => handleSort('sku')}
              className="py-3 px-4 cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
            >
              <div className="flex items-center gap-1.5">
                <span>SKU & Produk</span>
                <ArrowUpDown className="w-3 h-3" />
              </div>
            </th>
            <th className="py-3 px-3">Size</th>
            <th className="py-3 px-3">Warna</th>
            <th
              onClick={() => handleSort('qty')}
              className="py-3 px-4 text-right cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
            >
              <div className="flex items-center justify-end gap-1.5">
                <span>Stok Fisik</span>
                <ArrowUpDown className="w-3 h-3" />
              </div>
            </th>
            <th
              onClick={() => handleSort('hpp')}
              className="py-3 px-4 text-right cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
            >
              <div className="flex items-center justify-end gap-1.5">
                <span>HPP / pcs</span>
                <ArrowUpDown className="w-3 h-3" />
              </div>
            </th>
            <th className="py-3 px-4 text-right">Harga Jual</th>
            <th
              onClick={() => handleSort('asset')}
              className="py-3 px-4 text-right cursor-pointer hover:text-slate-800 dark:hover:text-slate-200"
            >
              <div className="flex items-center justify-end gap-1.5">
                <span>Total Nilai Aset</span>
                <ArrowUpDown className="w-3 h-3" />
              </div>
            </th>
            <th className="py-3 px-3 text-center">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
          {sortedItems.length === 0 ? (
            <tr>
              <td colSpan={8} className="py-12 text-center text-slate-400">
                Tidak ada varian yang cocok dengan pencarian / filter.
              </td>
            </tr>
          ) : (
            sortedItems.map((v) => {
              const p = products[v.product_id];
              const qty = stock[v.id]?.qty ?? 0;
              const status = getStockStatus(qty, v.min_stock);
              const assetVal = qty > 0 ? qty * v.hpp : 0;

              return (
                <tr
                  key={v.id}
                  onClick={() => onSelectVariant(v)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                        {p?.sku || '-'}
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 truncate max-w-xs">
                        {p?.name || '-'}
                      </span>
                    </div>
                  </td>

                  <td className="py-2.5 px-3">
                    <span className="font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {v.size}
                    </span>
                  </td>

                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{v.color}</td>

                  <td className="py-2.5 px-4 text-right font-mono font-bold">
                    <span
                      className={
                        status === 'negative'
                          ? 'text-red-600'
                          : status === 'low'
                            ? 'text-amber-600'
                            : 'text-slate-900 dark:text-white'
                      }
                    >
                      {formatQty(qty, unit)}
                    </span>
                  </td>

                  <td className="py-2.5 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                    {formatRupiah(v.hpp)}
                  </td>

                  <td className="py-2.5 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                    {formatRupiah(v.sell_price)}
                  </td>

                  <td className="py-2.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300 font-semibold">
                    {formatRupiah(assetVal)}
                  </td>

                  <td className="py-2.5 px-3 text-center">
                    {status === 'negative' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-200 flex items-center justify-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Minus
                      </span>
                    ) : status === 'low' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200">
                        Rendah
                      </span>
                    ) : status === 'zero' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-400">
                        Nol
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-200">
                        Aman
                      </span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
