import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, RotateCcw, AlertCircle } from 'lucide-react';
import type { InboundDetail } from '../../../shared/types';
import { formatRupiah, pcsToLusin } from '../../../shared/rules/units';
import { useMaster } from '../../lib/masterStore';

interface InboundDetailModalProps {
  docId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onVoidSuccess: () => void;
}

export const InboundDetailModal: React.FC<InboundDetailModalProps> = ({
  docId,
  isOpen,
  onClose,
  onVoidSuccess,
}) => {
  const { sync } = useMaster();
  const [doc, setDoc] = useState<InboundDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isVoidConfirmOpen, setIsVoidConfirmOpen] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);

  useEffect(() => {
    if (isOpen && docId) {
      setIsLoading(true);
      setErrorMsg(null);
      setIsVoidConfirmOpen(false);

      fetch(`/api/inbound/${docId}`)
        .then((res) => {
          if (!res.ok) throw new Error('Gagal memuat rincian dokumen');
          return res.json();
        })
        .then((data) => {
          setDoc(data.doc);
        })
        .catch((err) => {
          setErrorMsg(err.message || 'Terjadi kesalahan sistem');
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setDoc(null);
    }
  }, [isOpen, docId]);

  if (!isOpen) return null;

  const handleVoid = async () => {
    if (!docId) return;
    setIsVoiding(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/inbound/${docId}/void`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Gagal membatalkan dokumen');
      }

      await sync(true);
      onVoidSuccess();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setIsVoiding(false);
    }
  };

  const isVoided = Boolean(doc?.voided_at);
  const totalPcs = doc?.lines?.reduce((sum, l) => sum + l.qty, 0) || 0;
  const totalAmount = doc?.lines?.reduce((sum, l) => sum + Math.round(l.qty * l.unit_cost), 0) || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                isVoided
                  ? 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400'
                  : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {isVoided ? 'VOID' : 'IN'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-base font-mono">
                  {doc?.doc_no || 'Dokumen Masuk'}
                </h3>
                {isVoided && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
                    DIBATALKAN (VOID)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {doc?.doc_date} · Sumber:{' '}
                <span className="uppercase font-medium">{doc?.source}</span>
                {doc?.partner_name ? ` · Mitra: ${doc.partner_name}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-xs text-red-600 dark:text-red-400 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-xs">Memuat rincian dokumen...</div>
        ) : (
          <>
            {/* Meta info */}
            {doc?.note && (
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-700 dark:text-slate-200">Catatan:</span>{' '}
                {doc.note}
              </div>
            )}

            {/* Items Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden flex-1 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="py-2 px-3 w-10 text-center">#</th>
                    <th className="py-2 px-3">Produk / Varian</th>
                    <th className="py-2 px-3 text-center">Size</th>
                    <th className="py-2 px-3">Warna</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                    <th className="py-2 px-3 text-right">Harga Beli</th>
                    <th className="py-2 px-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {doc?.lines?.map((line, idx) => (
                    <tr key={line.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-900 dark:text-white">
                        {line.product_name || line.sku}
                      </td>
                      <td className="py-2 px-3 text-center font-mono">{line.size}</td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{line.color}</td>
                      <td className="py-2 px-3 text-right font-mono font-medium">{line.qty} pcs</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                        {formatRupiah(line.unit_cost)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                        {formatRupiah(Math.round(line.qty * line.unit_cost))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer Summary */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg flex items-center justify-between text-xs font-mono shrink-0">
              <div className="space-x-4">
                <span className="text-slate-500">Total Baris: {doc?.lines?.length || 0}</span>
                <span className="text-slate-500">
                  Total Qty:{' '}
                  <strong className="text-slate-900 dark:text-white">{totalPcs} pcs</strong> (
                  {pcsToLusin(totalPcs)} lusin)
                </span>
              </div>
              <div>
                <span className="text-slate-500">Total Nilai: </span>
                <strong className="text-sm text-emerald-600 dark:text-emerald-400">
                  {formatRupiah(totalAmount)}
                </strong>
              </div>
            </div>

            {/* Void Confirmation Bar */}
            {!isVoided && isVoidConfirmOpen && (
              <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg space-y-2 text-xs shrink-0">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-300 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Yakin ingin membatalkan (void) dokumen ini? Stok sejumlah {totalPcs} pcs akan
                    otomatis dikembalikan.
                  </span>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsVoidConfirmOpen(false)}
                    className="px-3 py-1 bg-white dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700 font-medium text-slate-700 dark:text-slate-300"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={isVoiding}
                    onClick={handleVoid}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-medium disabled:opacity-50"
                  >
                    {isVoiding ? 'Memproses...' : 'Ya, Batalkan Dokumen (Void)'}
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <div>
                {!isVoided && !isVoidConfirmOpen && (
                  <button
                    type="button"
                    onClick={() => setIsVoidConfirmOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Batalkan Dokumen (Void)
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 transition-colors"
              >
                Tutup
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
