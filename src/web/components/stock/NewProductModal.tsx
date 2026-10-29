import React, { useState } from 'react';
import {
  X,
  Plus,
  Package,
  AlertCircle,
  ClipboardPaste,
  FileSpreadsheet,
  CheckCircle2,
} from 'lucide-react';
import { useMaster } from '../../lib/masterStore';
import { formatRupiah } from '../../../shared/rules/units';

interface NewProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedExcelRow {
  productName: string;
  sku: string;
  color: string;
  size: string;
  hpp: number;
}

export const NewProductModal: React.FC<NewProductModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { productList, sync } = useMaster();
  const [tab, setTab] = useState<'manual' | 'excel'>('manual');

  // Manual Form State
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Pakaian');
  const [sizesStr, setSizesStr] = useState('S, M, L, XL');
  const [colorsStr, setColorsStr] = useState('Hitam, Navy, Mocca, Abu');
  const [hpp, setHpp] = useState('15000');
  const [minStock, setMinStock] = useState('20');

  // Excel Paste State
  const [excelText, setExcelText] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const normalizeText = (str: string) => str.toLowerCase().replace(/[\s-_]+/g, '');

  // Parse Manual Form combinations
  const parsedSizes = sizesStr
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const parsedColors = colorsStr
    .split(/[,;\n]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  const totalVariantsManual = parsedSizes.length * parsedColors.length;

  // Parse Excel text
  const parseExcelData = (): ParsedExcelRow[] => {
    const lines = excelText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const results: ParsedExcelRow[] = [];

    for (const line of lines) {
      const lower = line.toLowerCase();
      // Skip header row if copied
      if (
        lower.includes('produk') ||
        lower.includes('sku') ||
        lower.includes('warna') ||
        lower.includes('size')
      ) {
        continue;
      }

      const cols = line.includes('\t')
        ? line.split('\t').map((c) => c.trim())
        : line.split(',').map((c) => c.trim());

      if (cols.length === 0 || !cols[0]) continue;

      const pName = cols[0];
      let pColor = 'Default';
      let pSize = 'AllSize';
      let pHpp = 0;

      if (cols.length >= 4) {
        // [Produk] [Warna] [Size] [HPP]
        pColor = cols[1] || 'Default';
        pSize = cols[2] || 'AllSize';
        pHpp = Number(cols[3].replace(/[^0-9.-]+/g, '')) || 0;
      } else if (cols.length === 3) {
        // [Produk] [Warna] [Size]
        pColor = cols[1] || 'Default';
        pSize = cols[2] || 'AllSize';
      } else if (cols.length === 2) {
        // [Produk Warna Size] [HPP]
        pHpp = Number(cols[1].replace(/[^0-9.-]+/g, '')) || 0;
      }

      const autoSku = pName
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      results.push({
        productName: pName,
        sku: autoSku || 'PRODUK',
        color: pColor,
        size: pSize,
        hpp: pHpp,
      });
    }

    return results;
  };

  const parsedExcelRows = parseExcelData();
  const uniqueExcelProducts = Array.from(new Set(parsedExcelRows.map((r) => r.productName)));

  // Submit Manual Form
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim() || !name.trim()) {
      setErrorMsg('SKU dan Nama Produk wajib diisi');
      return;
    }

    if (parsedSizes.length === 0 || parsedColors.length === 0) {
      setErrorMsg('Minimal masukkan 1 size dan 1 warna');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const variantsPayload = [];
    const hppNum = Number(hpp) || 0;
    const minStockNum = Number(minStock) || 0;

    for (const size of parsedSizes) {
      for (const color of parsedColors) {
        variantsPayload.push({
          size,
          color,
          hpp: hppNum,
          sell_price: 0,
          min_stock: minStockNum,
        });
      }
    }

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: sku.trim().toUpperCase(),
          name: name.trim(),
          category: category.trim() || null,
          variants: variantsPayload,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || 'Gagal menyimpan produk baru');
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

  // Submit Excel Paste
  const handleExcelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedExcelRows.length === 0) {
      setErrorMsg('Harap tempel data spreadsheet yang valid');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const prodMap = new Map<string, ParsedExcelRow[]>();
      for (const row of parsedExcelRows) {
        if (!prodMap.has(row.productName)) {
          prodMap.set(row.productName, []);
        }
        prodMap.get(row.productName)!.push(row);
      }

      for (const [prodName, rows] of prodMap.entries()) {
        const norm = normalizeText(prodName);
        const existingProd = productList.find(
          (p) =>
            normalizeText(p.sku) === norm ||
            normalizeText(p.name) === norm ||
            norm.includes(normalizeText(p.sku)) ||
            normalizeText(p.name).includes(norm)
        );

        if (existingProd) {
          const uniqueSizes = Array.from(new Set(rows.map((r) => r.size)));
          const uniqueColors = Array.from(new Set(rows.map((r) => r.color)));
          const avgHpp = rows[0]?.hpp || 0;

          await fetch('/api/products/variants/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              product_id: existingProd.id,
              sizes: uniqueSizes,
              colors: uniqueColors,
              hpp: avgHpp,
              sell_price: 0,
              min_stock: 0,
            }),
          });
        } else {
          const autoSku = prodName
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

          const variantMap = new Map<string, { size: string; color: string; hpp: number }>();
          for (const r of rows) {
            const key = `${r.size}_${r.color}`;
            if (!variantMap.has(key)) {
              variantMap.set(key, {
                size: r.size,
                color: r.color,
                hpp: r.hpp,
              });
            }
          }

          const res = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sku: autoSku || 'PRODUK',
              name: prodName,
              category: 'Pakaian',
              variants: Array.from(variantMap.values()).map((v) => ({
                ...v,
                sell_price: 0,
                min_stock: 0,
              })),
            }),
          });

          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson?.error?.message || `Gagal membuat produk ${prodName}`);
          }
        }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col z-10 animate-in fade-in-0 zoom-in-95 duration-150 max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">
                Tambah Produk & Varian Baru
              </h3>
              <p className="text-xs text-slate-500">
                Buat master produk satuan atau paste langsung dari tabel Excel
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

        {/* Tab Switcher */}
        <div className="px-5 pt-3 border-b border-slate-100 dark:border-slate-800 flex gap-2 bg-slate-50/50 dark:bg-slate-800/30 shrink-0">
          <button
            type="button"
            onClick={() => setTab('manual')}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              tab === 'manual'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Form Matriks (Kombinasi)
          </button>
          <button
            type="button"
            onClick={() => setTab('excel')}
            className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all ${
              tab === 'excel'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            Tempel dari Excel (Bulk)
          </button>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-600 dark:text-red-400 flex items-center gap-2 border border-red-200 dark:border-red-800 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Tab 1: Manual Matriks Form */}
        {tab === 'manual' && (
          <form onSubmit={handleManualSubmit} className="p-6 space-y-4 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  SKU Induk (Kunci Bisnis)
                </label>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  placeholder="CONTOH: LEGGING-SHORT"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono font-bold uppercase focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Kategori
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Celana, Kaos, Gamis, dll"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nama Produk
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Legging Short Anak"
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Daftar Size (Pisahkan koma)
                </label>
                <input
                  type="text"
                  value={sizesStr}
                  onChange={(e) => setSizesStr(e.target.value)}
                  placeholder="S, M, L, XL, XXL, XXXL"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Daftar Warna (Pisahkan koma)
                </label>
                <input
                  type="text"
                  value={colorsStr}
                  onChange={(e) => setColorsStr(e.target.value)}
                  placeholder="Hitam, Navy, Putih"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  HPP / Harga Pokok (Rp)
                </label>
                <input
                  type="number"
                  value={hpp}
                  onChange={(e) => setHpp(e.target.value)}
                  placeholder="15000"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Batas Min. Stok
                </label>
                <input
                  type="number"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  placeholder="20"
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 font-mono"
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-400">
              💡 Harga jual tidak perlu dicatat karena dinamis mengikuti diskon & kampanye toko
              online. Keuntungan dihitung dari rekap penjualan bersih marketplace.
            </p>

            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300 flex items-center justify-between">
              <span>Akan membuat:</span>
              <strong className="font-mono">{totalVariantsManual} Varian Baru</strong>
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
                disabled={isSubmitting || totalVariantsManual === 0}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{isSubmitting ? 'Menyimpan...' : 'Buat Produk & Varian'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: Excel Bulk Paste Form */}
        {tab === 'excel' && (
          <form onSubmit={handleExcelSubmit} className="p-6 space-y-4 overflow-y-auto">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Tempel Baris dari Excel / Google Sheets
                </span>
                <span className="text-[11px] text-blue-600">Bisa banyak produk sekaligus</span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-[11px] font-mono text-slate-600 dark:text-slate-400 space-y-1">
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  Format Kolom yang Didukung:
                </p>
                <p>Produk / SKU [Tab] Warna [Tab] Size [Tab] HPP (opsional)</p>
              </div>

              <textarea
                rows={7}
                value={excelText}
                onChange={(e) => setExcelText(e.target.value)}
                placeholder={`Contoh tempel dari Excel:\nLEGGING SHORT\tHitam\tS\t11500\nLEGGING SHORT\tHitam\tM\t11500\nLEGGING SHORT\tPutih\tL\t11500\nMANSET POLOS\tNavy\tXL\t18000`}
                className="w-full p-3 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Live Preview Card */}
            {parsedExcelRows.length > 0 && (
              <div className="space-y-2">
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>
                      Terdeteksi <strong>{uniqueExcelProducts.length} Produk</strong> (total{' '}
                      <strong>{parsedExcelRows.length} Varian</strong>)
                    </span>
                  </div>
                  <span className="font-mono font-medium">
                    {uniqueExcelProducts.slice(0, 2).join(', ')}
                    {uniqueExcelProducts.length > 2 ? '...' : ''}
                  </span>
                </div>

                {/* Mini Preview Table */}
                <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg text-xs">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 sticky top-0">
                      <tr>
                        <th className="py-1 px-2.5">Produk</th>
                        <th className="py-1 px-2.5">Warna</th>
                        <th className="py-1 px-2.5 text-center">Size</th>
                        <th className="py-1 px-2.5 text-right">HPP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {parsedExcelRows.slice(0, 15).map((r, i) => (
                        <tr key={i}>
                          <td className="py-1 px-2.5 font-medium">{r.productName}</td>
                          <td className="py-1 px-2.5">{r.color}</td>
                          <td className="py-1 px-2.5 text-center font-mono">{r.size}</td>
                          <td className="py-1 px-2.5 text-right font-mono">
                            {formatRupiah(r.hpp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedExcelRows.length > 15 && (
                    <div className="p-1.5 text-center text-[10px] text-slate-400 bg-slate-50 dark:bg-slate-800">
                      ...dan {parsedExcelRows.length - 15} baris lainnya
                    </div>
                  )}
                </div>
              </div>
            )}

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
                disabled={isSubmitting || parsedExcelRows.length === 0}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'Mengimpor Produk...'
                    : `Import ${parsedExcelRows.length} Varian ke Master`}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
