import React, { useState, useRef } from 'react';
import { Upload, X, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useMaster } from '../../lib/masterStore';
import type { ImportOrderRow } from '../../../shared/schema';

interface ImportOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ImportResultData {
  batch_id: number;
  created_orders: number;
  updated_orders: number;
  lines_count: number;
  resolved: {
    siap_keluar: number;
    menunggu_fisik: number;
    perlu_mapping: number;
  };
  canceled_safe: number;
  canceled_needs_return: number;
}

interface SheetJSLibrary {
  read: (
    data: ArrayBuffer,
    opts: { type: string }
  ) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: {
    sheet_to_json: (sheet: unknown, opts: { header: number; defval: string }) => string[][];
  };
}

export const ImportOrdersModal: React.FC<ImportOrdersModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { storeList } = useMaster();
  const [selectedStoreId, setSelectedStoreId] = useState<number | ''>(storeList[0]?.id || '');
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ImportOrderRow[]>([]);
  const [pasteText, setPasteText] = useState<string>('');
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResultData | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  // Auto detect columns from header row
  const detectAndParseData = (matrix: unknown[][], sourceName: string) => {
    if (matrix.length < 2) {
      throw new Error('Data terlalu pendek atau tidak memiliki baris header.');
    }

    const headers = matrix[0].map((h) =>
      String(h ?? '')
        .toLowerCase()
        .trim()
        .replace(/[\s\-_]+/g, ' ')
    );

    const findColIdx = (keywords: string[]) => {
      return headers.findIndex((h) => keywords.some((k) => h.includes(k)));
    };

    const orderNoIdx = findColIdx([
      'no pesanan',
      'order id',
      'nomor pesanan',
      'order no',
      'order number',
      'no. pesanan',
    ]);
    const dateIdx = findColIdx([
      'waktu pembuatan',
      'waktu pesanan',
      'order time',
      'tanggal',
      'creation time',
      'created time',
      'waktu pembayaran',
    ]);
    const statusIdx = findColIdx(['status pesanan', 'status', 'order status', 'status pengiriman']);
    const skuIdx = findColIdx([
      'sku toko',
      'nomor referensi sku',
      'sku induk',
      'parent sku',
      'seller sku',
      'sku',
    ]);
    const varIdx = findColIdx(['nama variasi', 'variasi', 'variation', 'warna', 'size', 'opsi']);
    const qtyIdx = findColIdx(['jumlah', 'qty', 'quantity', 'kuantitas', 'pcs']);
    const noteIdx = findColIdx(['catatan pembeli', 'pesan pembeli', 'buyer note', 'catatan']);

    if (orderNoIdx === -1) {
      throw new Error('Kolom No. Pesanan / Order ID tidak ditemukan di baris header file.');
    }
    if (skuIdx === -1 && varIdx === -1) {
      throw new Error('Kolom SKU Toko atau Variasi tidak ditemukan di file.');
    }

    const rows: ImportOrderRow[] = [];

    for (let i = 1; i < matrix.length; i++) {
      const row = matrix[i];
      if (row.length === 0 || row.every((c) => !String(c ?? '').trim())) continue;

      const orderNo = String(row[orderNoIdx] ?? '').trim();
      if (!orderNo) continue;

      const storeSku =
        skuIdx !== -1 && row[skuIdx] !== undefined && row[skuIdx] !== null
          ? String(row[skuIdx]).trim()
          : 'UNSPECIFIED-SKU';
      const variation =
        varIdx !== -1 && row[varIdx] !== undefined && row[varIdx] !== null
          ? String(row[varIdx]).trim()
          : '';
      const rawQtyStr =
        qtyIdx !== -1 && row[qtyIdx] !== undefined && row[qtyIdx] !== null
          ? String(row[qtyIdx]).replace(/[^0-9.-]+/g, '')
          : '1';
      const rawQty = Number(rawQtyStr);
      const qty = isNaN(rawQty) || rawQty <= 0 ? 1 : Math.round(rawQty);
      const orderedAt =
        dateIdx !== -1 && row[dateIdx] !== undefined && row[dateIdx] !== null
          ? String(row[dateIdx]).trim() || null
          : null;
      const statusRaw =
        statusIdx !== -1 && row[statusIdx] !== undefined && row[statusIdx] !== null
          ? String(row[statusIdx]).trim() || null
          : null;
      const buyerNote =
        noteIdx !== -1 && row[noteIdx] !== undefined && row[noteIdx] !== null
          ? String(row[noteIdx]).trim() || null
          : null;

      rows.push({
        order_no: orderNo,
        ordered_at: orderedAt,
        status_raw: statusRaw,
        store_sku: storeSku,
        variation: variation,
        qty: qty,
        buyer_note: buyerNote,
      });
    }

    if (rows.length === 0) {
      throw new Error('Tidak ada baris pesanan yang valid untuk diimpor.');
    }

    setFileName(sourceName);
    setParsedRows(rows);
    setErrorMsg(null);
  };

  // Parse CSV/TSV
  const parseDelimitedText = (text: string, sourceName = 'Clipboard') => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;

    // Detect delimiter
    const firstLine = lines[0];
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;

    let delimiter = '\t';
    if (commaCount > tabCount && commaCount > semicolonCount) delimiter = ',';
    else if (semicolonCount > tabCount && semicolonCount > commaCount) delimiter = ';';

    const matrix = lines.map((l) => {
      // Simple CSV split (supporting quoted values)
      const res: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < l.length; i++) {
        const char = l[i];
        if (char === '"' && (i === 0 || l[i - 1] !== '\\')) {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          res.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      res.push(current.trim().replace(/^"|"$/g, ''));
      return res;
    });

    detectAndParseData(matrix, sourceName);
  };

  // Handle file input (.csv, .txt, or .xlsx via lazy CDN)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setErrorMsg(null);

    try {
      if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
        const text = await file.text();
        parseDelimitedText(text, file.name);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        // Lazy load SheetJS from CDN without bloating initial shell JS bundle
        const win = window as unknown as { XLSX?: SheetJSLibrary };
        let xlsxLib = win.XLSX;
        if (!xlsxLib) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
            script.onload = () => resolve();
            script.onerror = () =>
              reject(
                new Error(
                  'Gagal memuat modul pembaca Excel (SheetJS). Periksa koneksi internet atau gunakan format CSV.'
                )
              );
            document.head.appendChild(script);
          });
          xlsxLib = win.XLSX;
        }

        if (!xlsxLib) throw new Error('SheetJS gagal diinisialisasi.');

        const buffer = await file.arrayBuffer();
        const workbook = xlsxLib.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const matrix = xlsxLib.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][];

        detectAndParseData(matrix, file.name);
      } else {
        throw new Error('Format file tidak didukung. Harap unggah file .xlsx atau .csv');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses file.');
    } finally {
      setIsParsing(false);
    }
  };

  // Submit to API
  const handleImportSubmit = async () => {
    if (!selectedStoreId) {
      setErrorMsg('Pilih toko tujuan terlebih dahulu.');
      return;
    }
    if (parsedRows.length === 0) {
      setErrorMsg('Belum ada data pesanan yang dimuat.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/orders/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: Number(selectedStoreId),
          filename: fileName || 'import_pesanan',
          rows: parsedRows,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Gagal mengimpor pesanan');
      }

      setImportResult(data);
      onSuccess();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan sistem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-2xl w-full p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                Import Pesanan Marketplace (Shopee / TikTok Shop / Baku)
              </h3>
              <p className="text-[11px] text-slate-400">
                Parsing aman di browser, idempoten (anti ganda), dan resolusi otomatis mapping SKU
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

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Modal / Result View */}
        {importResult ? (
          <div className="space-y-4 py-2">
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Import Pesanan Berhasil!</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 bg-white/60 dark:bg-slate-900/60 rounded-lg">
                  <p className="text-slate-500 text-[10px]">Pesanan Baru</p>
                  <p className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                    {importResult.created_orders}
                  </p>
                </div>
                <div className="p-2.5 bg-white/60 dark:bg-slate-900/60 rounded-lg">
                  <p className="text-emerald-600 font-medium text-[10px]">Siap Keluar</p>
                  <p className="text-base font-bold text-emerald-600 mt-0.5">
                    {importResult.resolved?.siap_keluar || 0}
                  </p>
                </div>
                <div className="p-2.5 bg-white/60 dark:bg-slate-900/60 rounded-lg">
                  <p className="text-amber-600 font-medium text-[10px]">Antrean Random</p>
                  <p className="text-base font-bold text-amber-600 mt-0.5">
                    {importResult.resolved?.menunggu_fisik || 0}
                  </p>
                </div>
                <div className="p-2.5 bg-white/60 dark:bg-slate-900/60 rounded-lg">
                  <p className="text-red-600 font-medium text-[10px]">Perlu Mapping</p>
                  <p className="text-base font-bold text-red-600 mt-0.5">
                    {importResult.resolved?.perlu_mapping || 0}
                  </p>
                </div>
              </div>
              {importResult.updated_orders > 0 && (
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  ℹ️ {importResult.updated_orders} pesanan lama diperbarui statusnya (Aman / Cek
                  Retur: {importResult.canceled_safe + importResult.canceled_needs_return}).
                </p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setImportResult(null);
                  setParsedRows([]);
                  onClose();
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Lihat di Antrean Pesanan
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Toko Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Toko / Marketplace Tujuan <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {storeList.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.channel.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {/* File Dropzone & Paste Section */}
            {parsedRows.length === 0 ? (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.txt"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer transition-colors space-y-2 bg-slate-50/50 dark:bg-slate-800/40"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 mx-auto flex items-center justify-center">
                    {isParsing ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <Upload className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Klik untuk upload file Excel (.xlsx) atau CSV
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Mendukung file ekspor resmi pesanan Shopee & TikTok Shop
                    </p>
                  </div>
                </div>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                  <span className="shrink-0 mx-4 text-[11px] text-slate-400">
                    atau tempel data baris (salin dari Excel/Sheets)
                  </span>
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
                </div>

                <textarea
                  rows={4}
                  value={pasteText}
                  onChange={(e) => {
                    setPasteText(e.target.value);
                    if (e.target.value.includes('\t') && e.target.value.includes('\n')) {
                      parseDelimitedText(e.target.value);
                      setPasteText('');
                    }
                  }}
                  placeholder="Tempel baris tabel pesanan di sini (termasuk baris header kolom)..."
                  className="w-full p-2.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            ) : (
              /* Preview Table */
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    📄 {fileName} —{' '}
                    <span className="text-blue-600 font-bold">{parsedRows.length} baris</span>{' '}
                    terdeteksi
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setParsedRows([]);
                      setFileName('');
                    }}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Ganti File
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-400">
                      <tr>
                        <th className="py-2 px-3">No. Pesanan</th>
                        <th className="py-2 px-3">SKU Toko</th>
                        <th className="py-2 px-3">Variasi</th>
                        <th className="py-2 px-3 text-right">Qty</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                      {parsedRows.slice(0, 10).map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                          <td className="py-1.5 px-3 font-semibold text-blue-600">{r.order_no}</td>
                          <td className="py-1.5 px-3 text-slate-800 dark:text-slate-200">
                            {r.store_sku}
                          </td>
                          <td className="py-1.5 px-3 text-slate-500">{r.variation || '-'}</td>
                          <td className="py-1.5 px-3 text-right font-bold">{r.qty}</td>
                          <td className="py-1.5 px-3 text-slate-600 dark:text-slate-400 font-sans">
                            {r.status_raw || 'Perlu Dikirim'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedRows.length > 10 && (
                  <p className="text-[11px] text-slate-400 italic">
                    + {parsedRows.length - 10} baris pesanan lainnya...
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSubmitting || parsedRows.length === 0}
                onClick={handleImportSubmit}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengimpor...</span>
                  </>
                ) : (
                  <span>Konfirmasi & Simpan Pesanan</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
