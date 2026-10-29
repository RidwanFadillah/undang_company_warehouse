import React, { useState } from 'react';
import { X, ShieldCheck, ArrowRight, AlertTriangle } from 'lucide-react';
import type { Variant, Product, StockBalance } from '../../../shared/types';
import { calculateOpnameDelta } from '../../../shared/rules/stock';
import { lusinToPcs } from '../../../shared/rules/units';

interface OpnameModalProps {
  variant: Variant | null;
  product?: Product;
  stockBalance?: StockBalance;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const OpnameModal: React.FC<OpnameModalProps> = ({
  variant,
  product,
  stockBalance,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [countedQty, setCountedQty] = useState('');
  const [unitMode, setUnitMode] = useState<'pcs' | 'lusin'>('pcs');
  const [note, setNote] = useState('Stock Opname Fisik');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !variant) return null;

  const currentQty = stockBalance?.qty ?? 0;
  const countedNum = Number(countedQty) || 0;
  const countedPcs = unitMode === 'lusin' ? lusinToPcs(countedNum) : countedNum;
  const delta = calculateOpnameDelta(currentQty, countedPcs);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (countedQty === '') {
      setErrorMsg('Masukkan jumlah stok fisik hasil hitungan');
      return;
    }

    if (delta === 0) {
      setErrorMsg(
        'Stok fisik sama dengan stok sistem (selisih 0 pcs). Tidak ada pergerakan koreksi.'
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/stock/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ variant_id: variant.id, counted_qty: countedPcs }],
          note: note.trim() || 'Stock Opname Fisik',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || 'Gagal menyimpan stock opname');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col z-10 animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                Koreksi / Stock Opname Fisik
              </h3>
              <p className="text-xs text-slate-500">
                {product?.sku} • {variant.size} • {variant.color}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Current vs Counted Comparison */}
          <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center">
            <div>
              <p className="text-[11px] text-slate-400">Stok Sistem</p>
              <p className="text-lg font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                {currentQty} <span className="text-[10px] font-normal">pcs</span>
              </p>
            </div>
            <div className="flex items-center justify-center text-slate-300">
              <ArrowRight className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Selisih Movement</p>
              <p
                className={`text-lg font-bold mt-0.5 ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-slate-400'}`}
              >
                {delta > 0 ? `+${delta}` : delta}{' '}
                <span className="text-[10px] font-normal">pcs</span>
              </p>
            </div>
          </div>

          {/* Input Counted Qty */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Hitungan Fisik Nyata (Opname)
              </label>
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setUnitMode('pcs')}
                  className={`px-2 py-0.5 rounded ${unitMode === 'pcs' ? 'bg-blue-600 text-white font-medium' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  Pcs
                </button>
                <button
                  type="button"
                  onClick={() => setUnitMode('lusin')}
                  className={`px-2 py-0.5 rounded ${unitMode === 'lusin' ? 'bg-blue-600 text-white font-medium' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  Lusin
                </button>
              </div>
            </div>
            <input
              type="number"
              step={unitMode === 'lusin' ? '0.1' : '1'}
              value={countedQty}
              onChange={(e) => setCountedQty(e.target.value)}
              placeholder={unitMode === 'lusin' ? 'Contoh: 5 (lusin)' : 'Contoh: 60 (pcs)'}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              autoFocus
            />
            {unitMode === 'lusin' && countedNum > 0 && (
              <p className="text-[11px] text-slate-400 mt-1">= {countedPcs} pcs fisik</p>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Alasan / Catatan Opname
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: Stock Opname Akhir Bulan, Selisih Rusak, dll"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>{isSubmitting ? 'Menyimpan...' : 'Terapkan Koreksi Stok'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
