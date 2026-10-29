import React, { useState } from 'react';
import { X, Send, Plus, Trash2, AlertCircle } from 'lucide-react';
import { useMaster } from '../../lib/masterStore';
import { getWibDateString } from '../../../shared/rules/date';

interface ManualOutboundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface OutboundRow {
  variant_id: number | '';
  qty: number | '';
}

export const ManualOutboundModal: React.FC<ManualOutboundModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { storeList, variantList, products, stock, sync } = useMaster();
  const [outDate, setOutDate] = useState<string>(getWibDateString());
  const [storeId, setStoreId] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [rows, setRows] = useState<OutboundRow[]>([{ variant_id: '', qty: 1 }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddRow = () => {
    setRows([...rows, { variant_id: '', qty: 1 }]);
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length <= 1) {
      setRows([{ variant_id: '', qty: 1 }]);
      return;
    }
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleUpdateRow = (index: number, updates: Partial<OutboundRow>) => {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...updates } : r)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = rows.filter((r) => r.variant_id !== '' && Number(r.qty) > 0);
    if (validItems.length === 0) {
      setErrorMsg('Masukkan minimal 1 varian barang keluar.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          out_date: outDate,
          store_id: storeId ? Number(storeId) : null,
          note: note.trim() || 'Barang keluar manual (WhatsApp/Offline/Reseller)',
          items: validItems.map((r) => ({
            variant_id: Number(r.variant_id),
            qty: Number(r.qty),
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Gagal memproses pengeluaran barang');
      }

      await sync(true);
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
            <Send className="w-5 h-5 text-purple-600" />
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                Catat Barang Keluar Manual (Non-Marketplace)
              </h3>
              <p className="text-[11px] text-slate-400">
                Untuk penjualan via WhatsApp, reseller offline, sample, atau endorse
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

        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tanggal Keluar
              </label>
              <input
                type="date"
                required
                value={outDate}
                onChange={(e) => setOutDate(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tujuan / Channel (Opsional)
              </label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="">-- Non Toko / Umum --</option>
                {storeList.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Catatan Pengeluaran
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: Pesanan WA Kak Nisa / Paket sample selebgram"
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          {/* Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-medium text-slate-700 dark:text-slate-300">
                Daftar Barang yang Dikeluarkan
              </label>
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Baris
              </button>
            </div>

            <div className="max-h-52 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row, index) => {
                const currentStock = row.variant_id
                  ? (stock[Number(row.variant_id)]?.qty ?? 0)
                  : null;

                return (
                  <div
                    key={index}
                    className="p-2 flex items-center gap-2 bg-slate-50/40 dark:bg-slate-800/30"
                  >
                    <div className="flex-1">
                      <select
                        value={row.variant_id}
                        onChange={(e) =>
                          handleUpdateRow(index, {
                            variant_id: e.target.value ? Number(e.target.value) : '',
                          })
                        }
                        className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      >
                        <option value="">-- Pilih Varian Produk --</option>
                        {variantList.map((v) => {
                          const p = products[v.product_id];
                          const s = stock[v.id]?.qty ?? 0;
                          return (
                            <option key={v.id} value={v.id}>
                              [{p?.sku}] {p?.name} - {v.size} / {v.color} (Stok: {s} pcs)
                            </option>
                          );
                        })}
                      </select>
                      {currentStock !== null && (
                        <p className="text-[10px] text-slate-400 mt-0.5 ml-1">
                          Sisa stok fisik di rak:{' '}
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {currentStock} pcs
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="w-20">
                      <input
                        type="number"
                        min="1"
                        value={row.qty}
                        onChange={(e) =>
                          handleUpdateRow(index, {
                            qty: Number(e.target.value.replace(/[^0-9]/g, '')) || '',
                          })
                        }
                        className="w-full px-2 py-1 text-right text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold"
                        placeholder="Qty"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveRow(index)}
                      className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Keluarkan Barang Sekarang</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
