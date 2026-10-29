import React, { useState, useEffect } from 'react';
import { X, DollarSign, AlertCircle, Check } from 'lucide-react';
import type { Product, Variant } from '../../../shared/types';
import { formatRupiah } from '../../../shared/rules/units';

interface HppBySizeModalProps {
  product: Product | null;
  variants: Variant[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const HppBySizeModal: React.FC<HppBySizeModalProps> = ({
  product,
  variants,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [hppValues, setHppValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Extract unique sizes for this product
  const sizes = React.useMemo(
    () => Array.from(new Set(variants.map((v) => v.size))).sort(),
    [variants]
  );

  useEffect(() => {
    if (product && variants.length > 0) {
      const initialMap: Record<string, string> = {};
      for (const s of sizes) {
        const v = variants.find((item) => item.size === s);
        initialMap[s] = v ? String(v.hpp) : '0';
      }
      setHppValues(initialMap);
    }
  }, [product, variants, isOpen, sizes]);

  if (!isOpen || !product) return null;

  const handleValueChange = (size: string, val: string) => {
    setHppValues((prev) => ({ ...prev, [size]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    const payload: Record<string, number> = {};
    for (const [size, val] of Object.entries(hppValues)) {
      const num = Number(val);
      if (isNaN(num) || num < 0) {
        setErrorMsg(`Nilai HPP untuk size ${size} tidak valid`);
        setIsSubmitting(false);
        return;
      }
      payload[size] = num;
    }

    try {
      const res = await fetch(`/api/products/${product.id}/hpp-by-size`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hpp_by_size: payload }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || 'Gagal menyimpan HPP per size');
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
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col z-10 animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                Atur HPP per Size (R-20)
              </h3>
              <p className="text-xs text-slate-500">
                {product.sku} • {product.name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 text-xs text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{errorMsg}</span>
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Nilai HPP akan otomatis diterapkan ke seluruh warna varian pada size yang bersangkutan.
          </p>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {sizes.map((s) => {
              const currentVal = Number(hppValues[s]) || 0;
              const lusinVal = currentVal * 12;
              return (
                <div
                  key={s}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-3"
                >
                  <div className="w-16">
                    <span className="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                      {s}
                    </span>
                  </div>

                  <div className="flex-1">
                    <label className="text-[10px] text-slate-400 block mb-0.5">
                      HPP per pcs (Rp)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={hppValues[s] || ''}
                      onChange={(e) => handleValueChange(s, e.target.value)}
                      placeholder="0"
                      className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono focus:ring-1 focus:ring-purple-500"
                    />
                  </div>

                  <div className="w-28 text-right">
                    <span className="text-[10px] text-slate-400 block">Per lusin</span>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {formatRupiah(lusinVal)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-sm flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan HPP per Size'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
