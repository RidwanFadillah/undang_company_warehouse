import React, { useState } from 'react';
import { X, Shuffle, Check, AlertCircle } from 'lucide-react';
import { useMaster } from '../../lib/masterStore';

interface ResolveRandomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  line: {
    line_id: number;
    order_no: string;
    store_sku: string;
    variation: string;
    order_qty: number;
    qty_multiplier: number | null;
    product_id: number | null;
    product_name?: string;
  } | null;
}

export const ResolveRandomModal: React.FC<ResolveRandomModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  line,
}) => {
  const { variantList, stock } = useMaster();
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !line) return null;

  const requiredPcs = line.order_qty * (line.qty_multiplier || 1);
  const availableVariants = variantList.filter(
    (v) => !line.product_id || v.product_id === line.product_id
  );

  const totalPickedPcs = Object.values(picks).reduce((sum, q) => sum + (q || 0), 0);
  const remainingPcs = requiredPcs - totalPickedPcs;

  const handlePickChange = (variantId: number, val: number) => {
    setPicks((prev) => {
      const next = { ...prev };
      if (val <= 0) {
        delete next[variantId];
      } else {
        next[variantId] = val;
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (totalPickedPcs !== requiredPcs) {
      setErrorMsg(
        `Total alokasi varian (${totalPickedPcs} pcs) harus sama dengan target pesanan (${requiredPcs} pcs).`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const pickPayload = Object.entries(picks).map(([vId, qty]) => ({
        variant_id: Number(vId),
        qty,
      }));

      const res = await fetch(`/api/orders/lines/${line.line_id}/resolve-random`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          picks: pickPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Gagal menyimpan varian fisik');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Shuffle className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                Alokasi Varian Fisik (Antrean Random)
              </h3>
              <p className="text-[11px] text-slate-400">
                Pesanan: #{line.order_no} — SKU: {line.store_sku}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Counter Info Banner */}
        <div className="p-3 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-center justify-between text-xs">
          <div>
            <p className="text-amber-800 dark:text-amber-300 font-medium">Target Fisik Pesanan:</p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {totalPickedPcs} / <span className="text-blue-600">{requiredPcs} pcs</span>
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              remainingPcs === 0
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
            }`}
          >
            {remainingPcs === 0 ? '✓ Alokasi Pas' : `Sisa ${remainingPcs} pcs`}
          </span>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Variant Picker Table */}
        <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium">
              <tr>
                <th className="py-2 px-3">Size</th>
                <th className="py-2 px-3">Warna</th>
                <th className="py-2 px-3 text-right">Stok Fisik</th>
                <th className="py-2 px-3 text-right w-24">Pcs Dikirim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {availableVariants.map((v) => {
                const currentStock = stock[v.id]?.qty ?? 0;
                const pickedQty = picks[v.id] || 0;

                return (
                  <tr key={v.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="py-1.5 px-3 font-mono font-semibold">{v.size}</td>
                    <td className="py-1.5 px-3 text-slate-700 dark:text-slate-300">{v.color}</td>
                    <td className="py-1.5 px-3 text-right font-mono text-slate-500">
                      {currentStock} pcs
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <input
                        type="number"
                        min="0"
                        max={requiredPcs}
                        value={pickedQty === 0 ? '' : pickedQty}
                        placeholder="0"
                        onChange={(e) =>
                          handlePickChange(v.id, Number(e.target.value.replace(/[^0-9]/g, '')))
                        }
                        className="w-16 px-2 py-1 text-right text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isSubmitting || totalPickedPcs !== requiredPcs}
            onClick={handleSave}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Simpan & Siap Dikirim</span>
          </button>
        </div>
      </div>
    </div>
  );
};
