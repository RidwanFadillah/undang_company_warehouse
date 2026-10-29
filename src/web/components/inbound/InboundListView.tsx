import React, { useState, useEffect, useCallback } from 'react';
import { Search, Calendar, Eye, RefreshCw, AlertCircle } from 'lucide-react';
import type { InboundDoc } from '../../../shared/types';
import { formatRupiah, pcsToLusin } from '../../../shared/rules/units';
import { getWibDateString } from '../../../shared/rules/date';
import { useMaster } from '../../lib/masterStore';
import { InboundDetailModal } from './InboundDetailModal';

export const InboundListView: React.FC = () => {
  const { partnerList } = useMaster();

  // Current month default in WIB
  const currentMonth = getWibDateString(Date.now()).slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [docs, setDocs] = useState<InboundDoc[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Selected doc for detail modal
  const [detailDocId, setDetailDocId] = useState<number | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fetchDocs = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      if (selectedMonth) params.set('month', selectedMonth);
      if (selectedSource !== 'all') params.set('source', selectedSource);
      if (selectedPartnerId !== 'all') params.set('partner_id', selectedPartnerId);
      params.set('limit', '100');

      const res = await fetch(`/api/inbound?${params.toString()}`);
      if (!res.ok) throw new Error('Gagal mengambil daftar dokumen');
      const data = await res.json();
      setDocs(data.docs || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth, selectedSource, selectedPartnerId]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Client-side search filter
  const filteredDocs = docs.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (d.doc_no && d.doc_no.toLowerCase().includes(q)) ||
      (d.partner_name && d.partner_name.toLowerCase().includes(q)) ||
      (d.note && d.note.toLowerCase().includes(q))
    );
  });

  // Calculate monthly summary
  const activeDocs = filteredDocs.filter((d) => !d.voided_at);
  const totalQtyPcs = activeDocs.reduce((sum, d) => sum + (d.total_qty || 0), 0);
  const totalAmount = activeDocs.reduce((sum, d) => sum + (d.total_amount || 0), 0);

  return (
    <div className="space-y-4">
      {errorMsg && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {/* Bulan Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-slate-900 dark:text-white font-mono focus:outline-none"
              />
            </div>

            {/* Sumber Filter */}
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none font-medium"
            >
              <option value="all">Semua Sumber</option>
              <option value="beli">Beli / Supplier</option>
              <option value="maklun">Maklun / Konveksi</option>
            </select>

            {/* Mitra Filter */}
            <select
              value={selectedPartnerId}
              onChange={(e) => setSelectedPartnerId(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none font-medium max-w-[200px]"
            >
              <option value="all">Semua Mitra</option>
              {partnerList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari no. dokumen, mitra..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-52"
              />
            </div>

            <button
              type="button"
              onClick={fetchDocs}
              className="p-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors"
              title="Segarkan daftar"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Monthly Summary Strip */}
        <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div>
            <span className="text-slate-500">Dokumen Aktif:</span>{' '}
            <strong className="text-slate-900 dark:text-white font-mono">
              {activeDocs.length} dokumen
            </strong>
          </div>

          <div>
            <span className="text-slate-500">Total Barang Masuk:</span>{' '}
            <strong className="text-slate-900 dark:text-white font-mono">
              {totalQtyPcs} pcs ({pcsToLusin(totalQtyPcs)} lusin)
            </strong>
          </div>

          <div>
            <span className="text-slate-500">Total Nilai Kulakan:</span>{' '}
            <strong className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
              {formatRupiah(totalAmount)}
            </strong>
          </div>
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="py-2.5 px-3">No. Dokumen</th>
                <th className="py-2.5 px-3">Tanggal</th>
                <th className="py-2.5 px-3">Sumber</th>
                <th className="py-2.5 px-3">Mitra</th>
                <th className="py-2.5 px-3 text-right">Jml Item</th>
                <th className="py-2.5 px-3 text-right">Total Qty</th>
                <th className="py-2.5 px-3 text-right">Total Nilai</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Memuat daftar dokumen barang masuk...
                  </td>
                </tr>
              ) : filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Tidak ada dokumen barang masuk pada periode ini.
                  </td>
                </tr>
              ) : (
                filteredDocs.map((d) => {
                  const isVoided = Boolean(d.voided_at);

                  return (
                    <tr
                      key={d.id}
                      onClick={() => {
                        setDetailDocId(d.id);
                        setIsDetailOpen(true);
                      }}
                      className={`cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors ${
                        isVoided ? 'opacity-60 bg-red-50/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900 dark:text-white">
                        <span className={isVoided ? 'line-through text-red-500' : ''}>
                          {d.doc_no}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                        {d.doc_date}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                            d.source === 'beli'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                          }`}
                        >
                          {d.source}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 font-medium">
                        {d.partner_name || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                        {d.line_count || 0}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-900 dark:text-white">
                        {d.total_qty || 0} pcs{' '}
                        <span className="text-[11px] text-slate-400 font-normal">
                          ({pcsToLusin(d.total_qty || 0)} lusin)
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatRupiah(d.total_amount || 0)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isVoided ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                            VOID
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                            AKTIF
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailDocId(d.id);
                            setIsDetailOpen(true);
                          }}
                          className="p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition-colors"
                          title="Lihat rincian"
                        >
                          <Eye className="w-3.5 h-3.5" />
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

      {/* Detail Modal */}
      <InboundDetailModal
        docId={detailDocId}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onVoidSuccess={() => {
          fetchDocs();
        }}
      />
    </div>
  );
};
