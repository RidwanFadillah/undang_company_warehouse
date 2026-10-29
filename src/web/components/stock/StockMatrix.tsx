import React from 'react';
import type { Product, Variant, StockBalance } from '../../../shared/types';
import { formatQty, formatRupiah } from '../../../shared/rules/units';
import { getStockStatus } from '../../../shared/rules/stock';

interface StockMatrixProps {
  product: Product;
  variants: Variant[];
  stock: Record<number, StockBalance>;
  unit: 'pcs' | 'lusin';
  filterStatus: 'all' | 'minus' | 'low';
  onSelectVariant: (variant: Variant) => void;
}

export const StockMatrix: React.FC<StockMatrixProps> = ({
  product,
  variants,
  stock,
  unit,
  filterStatus,
  onSelectVariant,
}) => {
  // Extract all unique sizes and colors for this product
  const sizes = Array.from(new Set(variants.map((v) => v.size))).sort();
  const colors = Array.from(new Set(variants.map((v) => v.color))).sort();

  // Map (color -> size -> variant)
  const matrixMap = new Map<string, Map<string, Variant>>();
  for (const v of variants) {
    if (!matrixMap.has(v.color)) {
      matrixMap.set(v.color, new Map());
    }
    matrixMap.get(v.color)!.set(v.size, v);
  }

  // Filter rows if filterStatus is active
  const filteredColors = colors.filter((color) => {
    if (filterStatus === 'all') return true;
    const colorMap = matrixMap.get(color);
    if (!colorMap) return false;

    for (const size of sizes) {
      const v = colorMap.get(size);
      if (!v) continue;
      const qty = stock[v.id]?.qty ?? 0;
      const status = getStockStatus(qty, v.min_stock);
      if (filterStatus === 'minus' && status === 'negative') return true;
      if (filterStatus === 'low' && status === 'low') return true;
    }
    return false;
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold select-none">
            <th className="py-3 px-4 w-44 sticky left-0 bg-slate-50 dark:bg-slate-800/90 z-10">
              Warna \ Size
            </th>
            {sizes.map((s) => (
              <th key={s} className="py-3 px-3 text-center min-w-[70px]">
                <span className="font-mono px-2 py-0.5 rounded bg-slate-200/60 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200">
                  {s}
                </span>
              </th>
            ))}
            <th className="py-3 px-4 text-right min-w-[90px]">Total Qty</th>
            <th className="py-3 px-4 text-right min-w-[120px]">Nilai Modal (HPP)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
          {filteredColors.length === 0 ? (
            <tr>
              <td colSpan={sizes.length + 3} className="py-8 text-center text-slate-400">
                Tidak ada baris warna yang cocok dengan filter.
              </td>
            </tr>
          ) : (
            filteredColors.map((color) => {
              const colorMap = matrixMap.get(color);
              let rowTotalQty = 0;
              let rowTotalAsset = 0;

              return (
                <tr
                  key={color}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                >
                  {/* Sticky Color Name Header */}
                  <td className="py-2.5 px-4 font-semibold text-slate-800 dark:text-slate-200 sticky left-0 bg-white dark:bg-slate-900 z-10 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                    <span>{color}</span>
                  </td>

                  {/* Size Matrix Cells */}
                  {sizes.map((size) => {
                    const v = colorMap?.get(size);
                    if (!v) {
                      return (
                        <td
                          key={size}
                          className="py-2.5 px-3 text-center text-slate-300 dark:text-slate-700 select-none"
                        >
                          —
                        </td>
                      );
                    }

                    const qty = stock[v.id]?.qty ?? 0;
                    const status = getStockStatus(qty, v.min_stock);
                    rowTotalQty += qty;
                    if (qty > 0) {
                      rowTotalAsset += qty * v.hpp;
                    }

                    // Styling based on status
                    let cellStyle =
                      'bg-slate-50/50 text-slate-700 dark:text-slate-300 hover:border-blue-400';
                    if (status === 'negative') {
                      cellStyle =
                        'bg-red-50 text-red-600 dark:bg-red-950/70 dark:text-red-400 border border-red-200 dark:border-red-900 font-bold';
                    } else if (status === 'low') {
                      cellStyle =
                        'bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-400 border border-amber-200 dark:border-amber-900 font-semibold';
                    } else if (status === 'zero') {
                      cellStyle = 'text-slate-400 bg-slate-50/40 dark:bg-slate-900/40';
                    }

                    return (
                      <td key={size} className="py-1 px-1.5 text-center">
                        <button
                          onClick={() => onSelectVariant(v)}
                          title={`Klik untuk buka kartu stok ${product.sku} ${size} ${color} (Stok: ${qty} pcs)`}
                          className={`w-full py-1.5 px-1 rounded-md text-xs font-mono transition-all duration-100 hover:scale-[1.03] active:scale-95 cursor-pointer ${cellStyle}`}
                        >
                          {formatQty(qty, unit).replace(' pcs', '').replace(' lsn', '')}
                        </button>
                      </td>
                    );
                  })}

                  {/* Row Total Qty */}
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                    {formatQty(rowTotalQty, unit)}
                  </td>

                  {/* Row Total Asset */}
                  <td className="py-2.5 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                    {formatRupiah(rowTotalAsset)}
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
