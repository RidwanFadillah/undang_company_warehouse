import React, { useState } from 'react';
import { X, Link2, Check, AlertCircle } from 'lucide-react';
import { useMaster } from '../../lib/masterStore';

interface InlineMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  prefill?: {
    store_id: number;
    store_name?: string;
    store_sku: string;
    variation?: string;
  } | null;
}

export const InlineMappingModal: React.FC<InlineMappingModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  prefill,
}) => {
  const { productList, variantList, storeList, sync } = useMaster();

  const [storeId, setStoreId] = useState<number>(prefill?.store_id || storeList[0]?.id || 1);
  const [storeSku, setStoreSku] = useState<string>(prefill?.store_sku || '');
  const [variationKey, setVariationKey] = useState<string>(prefill?.variation || '');
  const [productId, setProductId] = useState<number>(productList[0]?.id || 1);
  const [size, setSize] = useState<string>('');
  const [color, setColor] = useState<string>('');
  const [qtyMultiplier, setQtyMultiplier] = useState<number>(1);
  const [mapType, setMapType] = useState<'pasti' | 'random' | 'bundle'>('pasti');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const productVariants = variantList.filter((v) => v.product_id === productId);
  const availableSizes = Array.from(new Set(productVariants.map((v) => v.size))).sort();
  const availableColors = Array.from(new Set(productVariants.map((v) => v.color))).sort();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeSku.trim()) {
      setErrorMsg('SKU Toko tidak boleh kosong.');
      return;
    }
    if (!productId) {
      setErrorMsg('Pilih produk master.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: Number(storeId),
          store_sku: storeSku.trim(),
          variation_key: variationKey.trim(),
          product_id: Number(productId),
          size: size ? size.trim() : null,
          color: color ? color.trim() : null,
          qty_multiplier: Number(qtyMultiplier) || 1,
          map_type: mapType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Gagal menyimpan mapping SKU');
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
            <Link2 className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                Hubungkan SKU Toko $\rightarrow$ Master Gudang
              </h3>
              <p className="text-[11px] text-slate-400">
                Sekali mapping, semua baris pesanan sejenis akan otomatis ter-resolve
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

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          {/* Toko & SKU Toko */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Toko Marketplace
              </label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {storeList.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                SKU Toko (Marketplace)
              </label>
              <input
                type="text"
                required
                value={storeSku}
                onChange={(e) => setStoreSku(e.target.value)}
                className="w-full px-2.5 py-1.5 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Teks Variasi Asli Toko (Opsional / Kosongkan jika berlaku umum)
            </label>
            <input
              type="text"
              value={variationKey}
              onChange={(e) => setVariationKey(e.target.value)}
              placeholder="Mis: Hitam, L"
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-xl space-y-3">
            <p className="font-semibold text-blue-900 dark:text-blue-300">Target Produk Gudang:</p>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Pilih Produk Master
              </label>
              <select
                value={productId}
                onChange={(e) => {
                  setProductId(Number(e.target.value));
                  setSize('');
                  setColor('');
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                {productList.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.sku}] {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Size
                </label>
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                >
                  <option value="">-- Semua / Pilih Bebas --</option>
                  {availableSizes.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Warna
                </label>
                <select
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="">-- Semua / Pilih saat Fisik --</option>
                  {availableColors.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tipe Mapping
                </label>
                <select
                  value={mapType}
                  onChange={(e) => setMapType(e.target.value as 'pasti' | 'random' | 'bundle')}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="pasti">Pasti (Varian Tetap)</option>
                  <option value="bundle">Bundle (Paket Banyak Pcs)</option>
                  <option value="random">Random (Pilih Fisik saat Packing)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Pengali Fisik (pcs per 1 pesanan)
                </label>
                <input
                  type="number"
                  min="1"
                  value={qtyMultiplier}
                  onChange={(e) => setQtyMultiplier(Math.max(1, Number(e.target.value)))}
                  className="w-full px-2.5 py-1.5 font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
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
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Simpan & Terapkan Mapping</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
