import React, { useState } from 'react';
import { AlertTriangle, ShieldCheck, CheckCircle2, RotateCcw, AlertCircle } from 'lucide-react';
import type { Product, Variant, StockBalance } from '../../../shared/types';
import { formatQty } from '../../../shared/rules/units';

interface StockIssuesViewProps {
  products: Record<number, Product>;
  variants: Variant[];
  stock: Record<number, StockBalance>;
  unit: 'pcs' | 'lusin';
  onOpenOpname: (variant: Variant) => void;
}

export const StockIssuesView: React.FC<StockIssuesViewProps> = ({
  products,
  variants,
  stock,
  unit,
  onOpenOpname,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'negative' | 'low' | 'integrity'>('negative');
  const [integrityState, setIntegrityState] = useState<{
    tested: boolean;
    loading: boolean;
    isConsistent: boolean;
    anomalies: unknown[];
  }>({
    tested: false,
    loading: false,
    isConsistent: true,
    anomalies: [],
  });

  // Calculate negative & low stock variants
  const negativeList = variants.filter((v) => (stock[v.id]?.qty ?? 0) < 0);
  const lowList = variants.filter((v) => {
    const qty = stock[v.id]?.qty ?? 0;
    return v.min_stock > 0 && qty >= 0 && qty <= v.min_stock;
  });

  const runIntegrityCheck = async () => {
    setIntegrityState((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch('/api/stock/integrity');
      const data = (await res.json()) as { is_consistent: boolean; anomalies: unknown[] };
      setIntegrityState({
        tested: true,
        loading: false,
        isConsistent: data.is_consistent,
        anomalies: data.anomalies,
      });
    } catch {
      setIntegrityState((prev) => ({ ...prev, loading: false }));
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveSubTab('negative')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeSubTab === 'negative'
              ? 'bg-red-50 text-red-700 dark:bg-red-950/70 dark:text-red-400 border border-red-200 dark:border-red-900'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Stok Minus</span>
          <span className="px-1.5 py-0.2 rounded-full bg-red-200 dark:bg-red-900/60 text-[10px] font-mono">
            {negativeList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('low')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeSubTab === 'low'
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-400 border border-amber-200 dark:border-amber-900'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Stok Rendah (&le; Min)</span>
          <span className="px-1.5 py-0.2 rounded-full bg-amber-200 dark:bg-amber-900/60 text-[10px] font-mono">
            {lowList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('integrity')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeSubTab === 'integrity'
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-400 border border-blue-200 dark:border-blue-900'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Integritas Saldo & Ledger</span>
        </button>
      </div>

      {/* Negative Stock Table */}
      {activeSubTab === 'negative' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-red-50/50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold">
                Aturan Bisnis R-12: Stok Minus Diperbolehkan, Namun Harus Dikoreksi
              </p>
              <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                Stok minus terjadi saat penjualan dicatat sebelum barang masuk diinput. Selesaikan
                melalui Stock Opname fisik atau input dokumen barang masuk.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <th className="py-3 px-4">SKU & Produk</th>
                  <th className="py-3 px-3">Size</th>
                  <th className="py-3 px-3">Warna</th>
                  <th className="py-3 px-4 text-right">Stok Minus Saat Ini</th>
                  <th className="py-3 px-4 text-right">Aksi Koreksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {negativeList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Luar biasa! Tidak ada varian dengan stok minus.
                    </td>
                  </tr>
                ) : (
                  negativeList.map((v) => {
                    const p = products[v.product_id];
                    const qty = stock[v.id]?.qty ?? 0;
                    return (
                      <tr key={v.id} className="hover:bg-red-50/30 transition-colors">
                        <td className="py-2.5 px-4">
                          <span className="font-mono font-bold text-blue-600 mr-2">{p?.sku}</span>
                          <span className="text-slate-800 dark:text-slate-200">{p?.name}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                          {v.size}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                          {v.color}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-red-600 text-sm">
                          {formatQty(qty, unit)}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={() => onOpenOpname(v)}
                            className="px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm"
                          >
                            Opname Fisik
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Low Stock Table */}
      {activeSubTab === 'low' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                <th className="py-3 px-4">SKU & Produk</th>
                <th className="py-3 px-3">Size</th>
                <th className="py-3 px-3">Warna</th>
                <th className="py-3 px-4 text-right">Sisa Stok</th>
                <th className="py-3 px-4 text-right">Batas Min</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {lowList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Semua stok berada di atas batas minimum.
                  </td>
                </tr>
              ) : (
                lowList.map((v) => {
                  const p = products[v.product_id];
                  const qty = stock[v.id]?.qty ?? 0;
                  return (
                    <tr key={v.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="py-2.5 px-4">
                        <span className="font-mono font-bold text-blue-600 mr-2">{p?.sku}</span>
                        <span className="text-slate-800 dark:text-slate-200">{p?.name}</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">{v.size}</td>
                      <td className="py-2.5 px-3 text-slate-600">{v.color}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-600">
                        {formatQty(qty, unit)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-slate-400">
                        {v.min_stock} pcs
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() => onOpenOpname(v)}
                          className="px-3 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium"
                        >
                          Cek Fisik
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Integrity Check View */}
      {activeSubTab === 'integrity' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <div>
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
              Pemeriksaan Integritas Buku Besar Stok (Ledger Integrity)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Membandingkan jumlah historis seluruh transaksi di{' '}
              <code className="font-mono text-blue-600">stock_movements</code> dengan saldo
              denormalisasi di <code className="font-mono text-blue-600">stock_balance</code>.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Status Integritas Database
              </p>
              {integrityState.tested ? (
                integrityState.isConsistent ? (
                  <p className="text-xs font-medium text-emerald-600 flex items-center gap-1.5 mt-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>100% Konsisten — 0 Anomali Ditemukan</span>
                  </p>
                ) : (
                  <p className="text-xs font-medium text-red-600 flex items-center gap-1.5 mt-1">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Ditemukan {integrityState.anomalies.length} Anomali!</span>
                  </p>
                )
              ) : (
                <p className="text-xs text-slate-400 mt-1">Belum dijalankan pada sesi ini</p>
              )}
            </div>

            <button
              onClick={runIntegrityCheck}
              disabled={integrityState.loading}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm flex items-center gap-2"
            >
              <RotateCcw
                className={`w-3.5 h-3.5 ${integrityState.loading ? 'animate-spin' : ''}`}
              />
              <span>{integrityState.loading ? 'Memeriksa...' : 'Jalankan Audit Integritas'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
