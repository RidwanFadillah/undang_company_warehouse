import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  Send,
  Layers,
  Link2,
  CheckCircle2,
  AlertTriangle,
  Shuffle,
  RefreshCw,
  Search,
  Filter,
  Check,
} from 'lucide-react';
import { useMaster } from '../../lib/masterStore';
import { ImportOrdersModal } from './ImportOrdersModal';
import { InlineMappingModal } from './InlineMappingModal';
import { ResolveRandomModal } from './ResolveRandomModal';
import { ManualOutboundModal } from './ManualOutboundModal';
import { formatRupiah } from '../../../shared/rules/units';

interface OrderLineItem {
  line_id: number;
  order_id: number;
  line_no: number;
  store_sku: string;
  variation: string;
  order_qty: number;
  resolve_state: 'siap_keluar' | 'menunggu_fisik' | 'perlu_mapping' | 'selesai';
  mapping_id: number | null;
  order_no: string;
  store_id: number;
  order_date: string;
  ordered_at: string;
  order_status: string;
  stock_state: string;
  buyer_note: string | null;
  store_name: string;
  store_code: string;
  qty_multiplier: number | null;
  map_type: string | null;
  mapped_size: string | null;
  mapped_color: string | null;
  variant_id: number | null;
  variant_size: string | null;
  variant_color: string | null;
  variant_hpp: number | null;
  product_id: number | null;
  product_sku: string | null;
  product_name: string | null;
}

interface QueueSummary {
  siap_keluar: number;
  menunggu_fisik: number;
  perlu_mapping: number;
  selesai: number;
  total_lines: number;
}

interface MappingItem {
  id: number;
  store_id: number;
  store_name: string;
  store_sku: string;
  variation_key: string;
  product_id: number;
  product_sku: string;
  product_name: string;
  size: string | null;
  color: string | null;
  qty_multiplier: number;
  map_type: string;
}

interface OutboundLogItem {
  id: number;
  out_date: string;
  store_id: number | null;
  store_name: string | null;
  product_name: string;
  size: string;
  color: string;
  qty: number;
  hpp_snapshot: number;
  cogs: number;
  note: string | null;
}

interface MappingPrefillData {
  store_id: number;
  store_name?: string;
  store_sku: string;
  variation?: string;
}

export const OrdersView: React.FC = () => {
  const { storeList, sync } = useMaster();

  const [activeTab, setActiveTab] = useState<'queue' | 'mappings' | 'outbound'>('queue');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [orders, setOrders] = useState<OrderLineItem[]>([]);
  const [summary, setSummary] = useState<QueueSummary>({
    siap_keluar: 0,
    menunggu_fisik: 0,
    perlu_mapping: 0,
    selesai: 0,
    total_lines: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Modals state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isManualOutboundOpen, setIsManualOutboundOpen] = useState(false);
  const [mappingPrefill, setMappingPrefill] = useState<MappingPrefillData | null>(null);
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [randomLine, setRandomLine] = useState<OrderLineItem | null>(null);
  const [isRandomModalOpen, setIsRandomModalOpen] = useState(false);

  // Mappings and outbound list states
  const [mappings, setMappings] = useState<MappingItem[]>([]);
  const [outboundItems, setOutboundItems] = useState<OutboundLogItem[]>([]);

  // Fetch orders queue
  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedState !== 'all') params.set('state', selectedState);
      if (selectedStoreId) params.set('store_id', selectedStoreId);

      const res = await fetch(`/api/orders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        if (data.summary) setSummary(data.summary);
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedState, selectedStoreId]);

  // Fetch mappings
  const fetchMappings = useCallback(async () => {
    try {
      const res = await fetch('/api/mappings');
      if (res.ok) {
        const data = await res.json();
        setMappings(data.mappings || []);
      }
    } catch (err) {
      console.error('Error fetching mappings:', err);
    }
  }, []);

  // Fetch outbound
  const fetchOutbound = useCallback(async () => {
    try {
      const res = await fetch('/api/outbound?limit=100');
      if (res.ok) {
        const data = await res.json();
        setOutboundItems(data.items || []);
      }
    } catch (err) {
      console.error('Error fetching outbound:', err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'queue') {
      fetchOrders();
    } else if (activeTab === 'mappings') {
      fetchMappings();
    } else if (activeTab === 'outbound') {
      fetchOutbound();
    }
  }, [activeTab, fetchOrders, fetchMappings, fetchOutbound]);

  // Process all ready orders (R-48, R-49)
  const handleProcessAllReady = async () => {
    if (summary.siap_keluar === 0) return;
    if (
      !confirm(
        `Yakin ingin memproses dan memotong stok untuk ${summary.siap_keluar} baris pesanan yang siap keluar?`
      )
    ) {
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/orders/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          all_ready: true,
          store_id: selectedStoreId ? Number(selectedStoreId) : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Gagal memproses pesanan');
      }

      alert(
        `Sukses! ${data.processed_lines} baris pesanan (${data.total_pcs} pcs) berhasil dikeluarkan dan stok dipotong.`
      );
      await sync(true);
      fetchOrders();
    } catch (err) {
      alert('Gagal: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsProcessing(false);
    }
  };

  // Process single line
  const handleProcessSingleLine = async (lineId: number) => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/orders/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_ids: [lineId],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message);

      await sync(true);
      fetchOrders();
    } catch (err) {
      alert('Gagal memproses: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsProcessing(false);
    }
  };

  // Void outbound
  const handleVoidOutbound = async (id: number) => {
    if (!confirm('Batalkan pengeluaran barang ini? Stok akan dikembalikan ke saldo fisik.')) return;
    try {
      const res = await fetch(`/api/outbound/${id}/void`, { method: 'POST' });
      if (!res.ok) throw new Error('Gagal membatalkan pengeluaran');
      await sync(true);
      fetchOutbound();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Terjadi kesalahan');
    }
  };

  // Filtered orders list by search query
  const filteredOrders = orders.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.order_no.toLowerCase().includes(q) ||
      o.store_sku.toLowerCase().includes(q) ||
      (o.variation && o.variation.toLowerCase().includes(q)) ||
      (o.product_name && o.product_name.toLowerCase().includes(q)) ||
      (o.product_sku && o.product_sku.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-600 dark:text-blue-400 rotate-45" />
            <span>Pesanan & Barang Keluar</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Import pesanan marketplace (Shopee / TikTok), mapping SKU gudang, dan pemotongan stok
            otomatis
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsManualOutboundOpen(true)}
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 transition-colors flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Keluar Manual</span>
          </button>

          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Import Pesanan (Excel / CSV)</span>
          </button>
        </div>
      </div>

      {/* Main Subtabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'queue'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Antrean Pesanan</span>
          {summary.siap_keluar > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
              {summary.siap_keluar} siap
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('mappings')}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'mappings'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Link2 className="w-4 h-4" />
          <span>Mapping SKU Toko ({mappings.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('outbound')}
          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'outbound'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Riwayat Barang Keluar</span>
        </button>
      </div>

      {/* TAB 1: ANTREAN PESANAN */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          {/* Summary Badges Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div
              onClick={() => setSelectedState('siap_keluar')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                selectedState === 'siap_keluar'
                  ? 'bg-emerald-50/80 border-emerald-400 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                  Siap Keluar
                </span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {summary.siap_keluar}{' '}
                <span className="text-xs font-normal text-slate-400">baris</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Varian cocok, siap potong stok</p>
            </div>

            <div
              onClick={() => setSelectedState('menunggu_fisik')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                selectedState === 'menunggu_fisik'
                  ? 'bg-amber-50/80 border-amber-400 dark:bg-amber-950/40 ring-2 ring-amber-500/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                  Antrean Random
                </span>
                <Shuffle className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {summary.menunggu_fisik}{' '}
                <span className="text-xs font-normal text-slate-400">baris</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Menunggu alokasi fisik</p>
            </div>

            <div
              onClick={() => setSelectedState('perlu_mapping')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                selectedState === 'perlu_mapping'
                  ? 'bg-red-50/80 border-red-400 dark:bg-red-950/40 ring-2 ring-red-500/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-red-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-red-700 dark:text-red-300 uppercase tracking-wider">
                  Perlu Mapping
                </span>
                <AlertTriangle className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {summary.perlu_mapping}{' '}
                <span className="text-xs font-normal text-slate-400">baris</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">SKU belum terhubung</p>
            </div>

            <div
              onClick={() => setSelectedState('all')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                selectedState === 'all'
                  ? 'bg-blue-50/80 border-blue-400 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                  Semua Baris
                </span>
                <Layers className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                {summary.total_lines}{' '}
                <span className="text-xs font-normal text-slate-400">baris</span>
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Total pesanan diimpor</p>
            </div>
          </div>

          {/* Filter & Batch Actions Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari no. pesanan, SKU, atau varian..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white w-56 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Filter className="w-3.5 h-3.5" />
                <select
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="">Semua Toko</option>
                  {storeList.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={fetchOrders}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                title="Refresh antrean"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Primary Batch Process Button */}
            {summary.siap_keluar > 0 && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleProcessAllReady}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isProcessing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Proses Semua yang Siap ({summary.siap_keluar} Baris)</span>
              </button>
            )}
          </div>

          {/* Orders Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto max-h-[520px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300 select-none">
                  <tr>
                    <th className="py-2.5 px-3">No. Pesanan</th>
                    <th className="py-2.5 px-3">Toko</th>
                    <th className="py-2.5 px-3">SKU Toko / Variasi</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3">Target Gudang</th>
                    <th className="py-2.5 px-3 text-center">Status Resolusi</th>
                    <th className="py-2.5 px-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        {isLoading
                          ? 'Memuat antrean pesanan...'
                          : 'Tidak ada baris pesanan pada antrean / filter ini.'}
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((o) => {
                      const physicalPcs = o.order_qty * (o.qty_multiplier || 1);

                      return (
                        <tr
                          key={o.line_id}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-2 px-3">
                            <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                              #{o.order_no}
                            </span>
                            <p className="text-[10px] text-slate-400">{o.order_date}</p>
                          </td>

                          <td className="py-2 px-3">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {o.store_name}
                            </span>
                          </td>

                          <td className="py-2 px-3">
                            <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                              {o.store_sku}
                            </span>
                            {o.variation && (
                              <p className="text-[11px] text-slate-500">{o.variation}</p>
                            )}
                          </td>

                          <td className="py-2 px-3 text-right font-mono font-bold">
                            <span>{o.order_qty}x</span>
                            {o.qty_multiplier && o.qty_multiplier > 1 && (
                              <span className="text-[10px] text-purple-600 ml-1">
                                ({physicalPcs} pcs)
                              </span>
                            )}
                          </td>

                          <td className="py-2 px-3">
                            {o.product_name ? (
                              <div>
                                <span className="font-medium text-slate-800 dark:text-slate-200">
                                  {o.product_name}
                                </span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {o.variant_size && (
                                    <span className="font-mono text-[10px] px-1 rounded bg-slate-100 dark:bg-slate-800">
                                      {o.variant_size}
                                    </span>
                                  )}
                                  {o.variant_color && (
                                    <span className="text-[10px] text-slate-500">
                                      {o.variant_color}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">-</span>
                            )}
                          </td>

                          <td className="py-2 px-3 text-center">
                            {o.resolve_state === 'siap_keluar' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" /> Siap Keluar
                              </span>
                            ) : o.resolve_state === 'menunggu_fisik' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200">
                                <Shuffle className="w-3 h-3" /> Antrean Random
                              </span>
                            ) : o.resolve_state === 'perlu_mapping' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200">
                                <AlertTriangle className="w-3 h-3" /> Perlu Mapping
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                Selesai
                              </span>
                            )}
                          </td>

                          <td className="py-2 px-3 text-center">
                            {o.resolve_state === 'siap_keluar' ? (
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => handleProcessSingleLine(o.line_id)}
                                className="px-2 py-1 text-[11px] font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                              >
                                Proses
                              </button>
                            ) : o.resolve_state === 'menunggu_fisik' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setRandomLine(o);
                                  setIsRandomModalOpen(true);
                                }}
                                className="px-2 py-1 text-[11px] font-semibold rounded bg-amber-600 hover:bg-amber-700 text-white transition-colors"
                              >
                                Pilih Fisik
                              </button>
                            ) : o.resolve_state === 'perlu_mapping' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setMappingPrefill({
                                    store_id: o.store_id,
                                    store_name: o.store_name,
                                    store_sku: o.store_sku,
                                    variation: o.variation,
                                  });
                                  setIsMappingModalOpen(true);
                                }}
                                className="px-2 py-1 text-[11px] font-semibold rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                              >
                                + Map SKU
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">✓ Keluar</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MAPPING SKU TOKO */}
      {activeTab === 'mappings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Daftar penghubung antara SKU di toko online (Shopee/TikTok) dengan produk & varian
              master gudang.
            </p>
            <button
              type="button"
              onClick={() => {
                setMappingPrefill(null);
                setIsMappingModalOpen(true);
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1.5"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>+ Buat Mapping Baru</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3">Toko</th>
                  <th className="py-2.5 px-3">SKU Toko</th>
                  <th className="py-2.5 px-3">Variasi Toko</th>
                  <th className="py-2.5 px-3">Target Master Gudang</th>
                  <th className="py-2.5 px-3">Size / Warna</th>
                  <th className="py-2.5 px-3 text-center">Tipe</th>
                  <th className="py-2.5 px-3 text-right">Pengali Fisik</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {mappings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      Belum ada mapping SKU yang tersimpan.
                    </td>
                  </tr>
                ) : (
                  mappings.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-medium">{m.store_name}</td>
                      <td className="py-2 px-3 font-mono font-semibold text-blue-600">
                        {m.store_sku}
                      </td>
                      <td className="py-2 px-3 text-slate-500">{m.variation_key || '*'}</td>
                      <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                        [{m.product_sku}] {m.product_name}
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {m.size || '*'} / {m.color || '*'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-100 dark:bg-slate-800">
                          {m.map_type}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold">
                        {m.qty_multiplier} pcs
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: RIWAYAT BARANG KELUAR */}
      {activeTab === 'outbound' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Tujuan / Toko</th>
                  <th className="py-2.5 px-3">Produk & Varian</th>
                  <th className="py-2.5 px-3 text-right">Qty (pcs)</th>
                  <th className="py-2.5 px-3 text-right">HPP Snapshot</th>
                  <th className="py-2.5 px-3 text-right">Total COGS</th>
                  <th className="py-2.5 px-3">Catatan / No. Pesanan</th>
                  <th className="py-2.5 px-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {outboundItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      Belum ada riwayat pengeluaran barang.
                    </td>
                  </tr>
                ) : (
                  outboundItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-mono text-[11px]">{item.out_date}</td>
                      <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                        {item.store_name || 'Umum / Manual'}
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.product_name}
                        </span>
                        <span className="ml-1 text-[11px] text-slate-400">
                          ({item.size} / {item.color})
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-red-600">
                        -{item.qty} pcs
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-500">
                        {formatRupiah(item.hpp_snapshot)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {formatRupiah(item.cogs)}
                      </td>
                      <td className="py-2 px-3 text-slate-500 text-[11px]">{item.note || '-'}</td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleVoidOutbound(item.id)}
                          className="text-[10px] text-red-500 hover:underline"
                        >
                          Void
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <ImportOrdersModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          sync(true);
          fetchOrders();
        }}
      />

      <InlineMappingModal
        isOpen={isMappingModalOpen}
        onClose={() => setIsMappingModalOpen(false)}
        onSuccess={() => {
          sync(true);
          fetchOrders();
          fetchMappings();
        }}
        prefill={mappingPrefill}
      />

      <ResolveRandomModal
        isOpen={isRandomModalOpen}
        onClose={() => setIsRandomModalOpen(false)}
        onSuccess={() => {
          sync(true);
          fetchOrders();
        }}
        line={randomLine}
      />

      <ManualOutboundModal
        isOpen={isManualOutboundOpen}
        onClose={() => setIsManualOutboundOpen(false)}
        onSuccess={() => {
          sync(true);
          fetchOutbound();
        }}
      />
    </div>
  );
};
