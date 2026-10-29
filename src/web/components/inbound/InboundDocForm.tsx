import React, { useState, useEffect } from 'react';
import { Save, RotateCcw, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { useMaster } from '../../lib/masterStore';
import { getWibDateString } from '../../../shared/rules/date';
import { lusinToPcs } from '../../../shared/rules/units';
import { EntryGrid, type EntryGridRow } from './EntryGrid';
import { NewPartnerModal } from './NewPartnerModal';

const LAST_PARTNER_KEY = 'stok_last_inbound_partner_id';

export const InboundDocForm: React.FC = () => {
  const { partnerList, sync } = useMaster();

  // Document Header State
  const [docDate, setDocDate] = useState(() => getWibDateString(Date.now()));
  const [source, setSource] = useState<'beli' | 'maklun'>('beli');
  const [partnerId, setPartnerId] = useState<number | ''>(() => {
    const saved = localStorage.getItem(LAST_PARTNER_KEY);
    return saved ? Number(saved) : '';
  });
  const [defaultUnit, setDefaultUnit] = useState<'pcs' | 'lusin'>('pcs');
  const [docNo, setDocNo] = useState('');
  const [note, setNote] = useState('');
  const [createInvoice, setCreateInvoice] = useState(false);
  const [dueDate, setDueDate] = useState('');

  // Grid State
  const [rows, setRows] = useState<EntryGridRow[]>([
    {
      id: `row_${Date.now()}_1`,
      variant_id: null,
      sku: '',
      product_name: '',
      size: '-',
      color: '-',
      qty: 1,
      unit: 'pcs',
      unit_cost: 0,
    },
  ]);

  // Modal State
  const [isNewPartnerModalOpen, setIsNewPartnerModalOpen] = useState(false);

  // Status & Notifications
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter partners by source type
  const activePartners = partnerList.filter((p) => p.is_active === 1);
  const filteredPartners = activePartners.filter((p) => {
    if (source === 'beli') return p.type === 'supplier' || p.type === 'reseller';
    if (source === 'maklun') return p.type === 'konveksi';
    return true;
  });

  // Remember last partner
  useEffect(() => {
    if (partnerId !== '') {
      localStorage.setItem(LAST_PARTNER_KEY, String(partnerId));
    }
  }, [partnerId]);

  // Reset form
  const handleReset = () => {
    setDocNo('');
    setNote('');
    setCreateInvoice(false);
    setDueDate('');
    setRows([
      {
        id: `row_${Date.now()}_1`,
        variant_id: null,
        sku: '',
        product_name: '',
        size: '-',
        color: '-',
        qty: 1,
        unit: defaultUnit,
        unit_cost: 0,
      },
    ]);
  };

  // Submit Handler
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validate rows
    const validRows = rows.filter(
      (r) => r.variant_id !== null && r.qty !== '' && Number(r.qty) > 0
    );
    if (validRows.length === 0) {
      setErrorMsg('Harap masukkan minimal 1 baris barang masuk dengan SKU yang valid.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        doc_no: docNo.trim() || null,
        doc_date: docDate,
        source,
        partner_id: partnerId === '' ? null : Number(partnerId),
        note: note.trim() || null,
        create_invoice: createInvoice,
        due_date: createInvoice && dueDate ? dueDate : null,
        lines: validRows.map((r) => ({
          variant_id: r.variant_id as number,
          qty: r.unit === 'lusin' ? lusinToPcs(Number(r.qty)) : Number(r.qty),
          unit_cost: r.unit_cost === '' ? 0 : Number(r.unit_cost),
        })),
      };

      const res = await fetch('/api/inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Gagal menyimpan dokumen masuk');
      }

      setSuccessMsg(`Dokumen ${data.doc?.doc_no || ''} berhasil disimpan! Stok telah ditambahkan.`);

      // Optimistic refresh
      await sync(true);

      // Reset grid rows, retain date & partner for continuous rapid entry
      setDocNo('');
      setRows([
        {
          id: `row_${Date.now()}_1`,
          variant_id: null,
          sku: '',
          product_name: '',
          size: '-',
          color: '-',
          qty: 1,
          unit: defaultUnit,
          unit_cost: 0,
        },
      ]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Notifications */}
      {errorMsg && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Header Form Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              IN
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white text-sm">
                Catat Dokumen Barang Masuk
              </h2>
              <p className="text-xs text-slate-500">
                Penerimaan stok dari kulakan supplier atau setoran maklun
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Bersihkan
            </button>
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {isSubmitting ? 'Menyimpan...' : 'Simpan Dokumen (Ctrl+S)'}
            </button>
          </div>
        </div>

        {/* Input Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          {/* Tanggal */}
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Tanggal Masuk <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              value={docDate}
              onChange={(e) => setDocDate(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          {/* Sumber */}
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Sumber Barang
            </label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as 'beli' | 'maklun')}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            >
              <option value="beli">Beli / Grosir / Supplier</option>
              <option value="maklun">Maklun / Konveksi</option>
            </select>
          </div>

          {/* Mitra / Supplier */}
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="font-medium text-slate-700 dark:text-slate-300">
                Mitra / Supplier
              </label>
              <button
                type="button"
                onClick={() => setIsNewPartnerModalOpen(true)}
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-[11px] inline-flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" />
                Mitra Baru
              </button>
            </div>
            <select
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            >
              <option value="">-- Pilih Mitra (Opsional) --</option>
              {filteredPartners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `[${p.code}] ` : ''}
                  {p.name} ({p.type})
                </option>
              ))}
            </select>
          </div>

          {/* No. Dokumen (Opsional) */}
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              No. Dokumen (Opsional)
            </label>
            <input
              type="text"
              placeholder="Otomatis jika kosong"
              value={docNo}
              onChange={(e) => setDocNo(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-[11px]"
            />
          </div>

          {/* Satuan Default Grid */}
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Satuan Default Grid
            </label>
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden p-0.5 bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setDefaultUnit('pcs')}
                className={`flex-1 py-1 text-center font-medium rounded-md transition-all ${
                  defaultUnit === 'pcs'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Pcs
              </button>
              <button
                type="button"
                onClick={() => setDefaultUnit('lusin')}
                className={`flex-1 py-1 text-center font-medium rounded-md transition-all ${
                  defaultUnit === 'lusin'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Lusin
              </button>
            </div>
          </div>
        </div>

        {/* Second Row: Notes and Invoice Checkbox */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="md:col-span-2">
            <input
              type="text"
              placeholder="Catatan dokumen (mis: Pembelian kain roll, no surat jalan grosir)..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={createInvoice}
                onChange={(e) => setCreateInvoice(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700"
              />
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Buat tagihan supplier (Buku Utang)
              </span>
            </label>

            {createInvoice && (
              <input
                type="date"
                title="Jatuh tempo pembayaran"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono"
              />
            )}
          </div>
        </div>
      </div>

      {/* Spreadsheet Grid Component */}
      <EntryGrid
        rows={rows}
        onChangeRows={setRows}
        defaultUnit={defaultUnit}
        onSave={() => handleSubmit()}
      />

      {/* Modal Tambah Mitra */}
      <NewPartnerModal
        isOpen={isNewPartnerModalOpen}
        onClose={() => setIsNewPartnerModalOpen(false)}
        defaultType={source === 'beli' ? 'supplier' : 'konveksi'}
        onCreated={(id) => {
          setPartnerId(id);
        }}
      />
    </div>
  );
};
