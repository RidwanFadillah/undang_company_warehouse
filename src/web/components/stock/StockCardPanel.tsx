import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Layers,
  TrendingUp,
  TrendingDown,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import type { Variant, Product, StockBalance } from '../../../shared/types';
import { formatRupiah, formatQty } from '../../../shared/rules/units';
import { getStockStatus } from '../../../shared/rules/stock';

interface StockCardPanelProps {
  variant: Variant | null;
  product?: Product;
  stockBalance?: StockBalance;
  unit: 'pcs' | 'lusin';
  onClose: () => void;
  onOpenOpname: (variant: Variant) => void;
}

interface MovementItem {
  id: number;
  moved_on: string;
  kind: string;
  qty_delta: number;
  unit_cost: number;
  ref_type?: string;
  note?: string;
  created_by?: string;
}

export const StockCardPanel: React.FC<StockCardPanelProps> = ({
  variant,
  product,
  stockBalance,
  unit,
  onClose,
  onOpenOpname,
}) => {
  const variantId = variant?.id;

  const { data, isLoading } = useQuery<{ items: MovementItem[] }>({
    queryKey: ['stock-history', variantId],
    queryFn: async () => {
      if (!variantId) return { items: [] };
      const res = await fetch(`/api/stock/history/${variantId}?limit=30`);
      if (!res.ok) throw new Error('Failed to load history');
      return res.json();
    },
    enabled: !!variantId,
  });

  if (!variant) return null;

  const currentQty = stockBalance?.qty ?? 0;
  const status = getStockStatus(currentQty, variant.min_stock);

  const getKindBadge = (kind: string, delta: number) => {
    switch (kind) {
      case 'opening':
        return (
          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 text-[10px]">
            Stok Awal
          </span>
        );
      case 'purchase':
        return (
          <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 text-[10px] flex items-center gap-1">
            <ArrowDownLeft className="w-3 h-3" /> Beli
          </span>
        );
      case 'maklun_in':
        return (
          <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 text-[10px] flex items-center gap-1">
            <ArrowDownLeft className="w-3 h-3" /> Maklun
          </span>
        );
      case 'sale':
        return (
          <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-600 text-[10px] flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" /> Pesanan
          </span>
        );
      case 'return_in':
        return (
          <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950 text-amber-600 text-[10px] flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Retur
          </span>
        );
      case 'adjust':
        return (
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 ${delta > 0 ? 'bg-purple-50 text-purple-600' : 'bg-red-50 text-red-600'}`}
          >
            Opname ({delta > 0 ? `+${delta}` : delta})
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
            {kind}
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Drawer Header */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between">
        <div className="min-w-0 pr-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
              {product?.sku || 'SKU'}
            </span>
            <span className="text-xs text-slate-500">{product?.category || 'Kategori'}</span>
          </div>
          <h3 className="font-semibold text-base text-slate-900 dark:text-white mt-1 truncate">
            {product?.name || 'Nama Produk'}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Size: <strong className="text-slate-800 dark:text-slate-200">{variant.size}</strong> •
            Warna: <strong className="text-slate-800 dark:text-slate-200">{variant.color}</strong>
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Quick Summary Cards */}
      <div className="p-5 grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
          <p className="text-[11px] text-slate-400">Sisa Fisik Stok</p>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span
              className={`text-xl font-bold ${
                status === 'negative'
                  ? 'text-red-600'
                  : status === 'low'
                    ? 'text-amber-600'
                    : 'text-slate-900 dark:text-white'
              }`}
            >
              {formatQty(currentQty, unit)}
            </span>
            {unit === 'lusin' && (
              <span className="text-[10px] text-slate-400 font-mono">({currentQty} pcs)</span>
            )}
          </div>
          {status === 'negative' && (
            <span className="inline-flex items-center gap-1 text-[10px] text-red-600 font-medium mt-1">
              <AlertTriangle className="w-3 h-3" /> Stok Minus!
            </span>
          )}
          {status === 'low' && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium mt-1">
              <AlertTriangle className="w-3 h-3" /> Di Bawah Min ({variant.min_stock})
            </span>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
          <p className="text-[11px] text-slate-400">HPP / pcs</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
            {formatRupiah(variant.hpp)}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Jual: {formatRupiah(variant.sell_price)}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
        <button
          onClick={() => onOpenOpname(variant)}
          className="flex-1 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Koreksi / Stock Opname</span>
        </button>
      </div>

      {/* Movements History List (Kartu Stok) */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span>Kartu Stok (Riwayat Movement)</span>
          </h4>
          <span className="text-[11px] text-slate-400">{data?.items?.length || 0} entri</span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-400 animate-pulse">
            Memuat riwayat kartu stok...
          </div>
        ) : (data?.items?.length || 0) === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            Belum ada mutasi stok tercatat untuk varian ini.
          </div>
        ) : (
          <div className="space-y-2">
            {data?.items.map((mov) => {
              const isPositive = mov.qty_delta > 0;
              return (
                <div
                  key={mov.id}
                  className="p-3 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {getKindBadge(mov.kind, mov.qty_delta)}
                      <span className="text-[11px] text-slate-400 font-mono">{mov.moved_on}</span>
                    </div>
                    <div
                      className={`font-mono font-bold flex items-center gap-0.5 ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}
                    >
                      {isPositive ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      <span>{isPositive ? `+${mov.qty_delta}` : mov.qty_delta} pcs</span>
                    </div>
                  </div>
                  {mov.note && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 pl-1 border-l-2 border-slate-200 dark:border-slate-700">
                      {mov.note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
