import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layers, Store, Search, Package, ArrowRight, Sparkles, TrendingUp } from 'lucide-react';
import type { MeResponse } from '../../../shared/schema';
import { useMaster } from '../../lib/masterStore';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CommandPalette } from './CommandPalette';

export const Shell: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [skuSearchQuery, setSkuSearchQuery] = useState('');

  // Fetch current user
  const { data: userData } = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await fetch('/api/me');
      if (!res.ok) throw new Error('Unauthenticated');
      return res.json();
    },
  });

  // Local-first Master Store
  const {
    productList,
    variantList,
    storeList,
    partnerList,
    stock,
    isSyncing,
    lastSyncedAt,
    syncError,
    sync,
    searchVariants,
  } = useMaster();

  // Global Ctrl+K / Cmd+K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Compute live metrics
  const totalStockQty = Object.values(stock).reduce((sum, s) => sum + s.qty, 0);
  const totalAssetValue = variantList.reduce((sum, v) => {
    const qty = stock[v.id]?.qty ?? 0;
    return sum + (qty > 0 ? qty * v.hpp : 0);
  }, 0);

  // Quick SKU search results in dashboard
  const searchResults = searchVariants(skuSearchQuery, 10);

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 font-sans overflow-hidden">
      {/* Sidebar Nav */}
      <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} variantCount={variantList.length} />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header
          user={userData?.user}
          isSyncing={isSyncing}
          lastSyncedAt={lastSyncedAt}
          syncError={syncError}
          onManualSync={() => sync(true)}
          onOpenCommandPalette={() => setIsPaletteOpen(true)}
        />

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50 dark:bg-slate-950">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Top Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Total Varian */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Total Varian Master
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    {variantList.length.toLocaleString('id-ID')}
                  </p>
                  <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1 font-medium">
                    <Layers className="w-3 h-3" />
                    <span>{productList.length} Produk Induk</span>
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Package className="w-5 h-5" />
                </div>
              </div>

              {/* Card 2: Saldo Stok */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Total Fisik Stok
                  </p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {totalStockQty.toLocaleString('id-ID')}{' '}
                    <span className="text-xs font-normal text-slate-400">pcs</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    ≈ {Math.floor(totalStockQty / 12).toLocaleString('id-ID')} lusin
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>

              {/* Card 3: Nilai Aset Stok */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Nilai Aset HPP Stok
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    Rp {(totalAssetValue / 1000000).toFixed(1)} jt
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Rp {Math.round(totalAssetValue).toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
              </div>

              {/* Card 4: Toko & Mitra */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Toko & Mitra
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    {storeList.length}{' '}
                    <span className="text-xs font-normal text-slate-400">Toko</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {partnerList.length} Mitra (Konveksi/Supplier)
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Store className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Quick In-Memory SKU Search Section */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Search className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Pencarian SKU In-Memory (Lokal)</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Data di-cache di IndexedDB, pencarian &lt; 16 ms tanpa round-trip jaringan.
                  </p>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={skuSearchQuery}
                    onChange={(e) => setSkuSearchQuery(e.target.value)}
                    placeholder="Ketik SKU / nama / warna..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Table of Variants */}
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-medium">
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Nama Produk</th>
                      <th className="py-2.5 px-3">Size</th>
                      <th className="py-2.5 px-3">Warna</th>
                      <th className="py-2.5 px-3 text-right">Stok Fisik</th>
                      <th className="py-2.5 px-3 text-right">HPP / pcs</th>
                      <th className="py-2.5 px-3 text-right">Harga Jual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                    {searchResults.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          {variantList.length === 0
                            ? 'Menyinkronkan data master dari server...'
                            : 'Tidak ada varian yang cocok dengan pencarian.'}
                        </td>
                      </tr>
                    ) : (
                      searchResults.map((item) => (
                        <tr
                          key={item.variantId}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-2.5 px-3 font-mono font-semibold text-blue-600 dark:text-blue-400">
                            {item.sku}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                            {item.productName}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                              {item.size}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                            {item.color}
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-slate-900 dark:text-white">
                            {item.stockQty} pcs
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600 dark:text-slate-400">
                            Rp {item.hpp.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                            Rp {item.sellPrice.toLocaleString('id-ID')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  Menampilkan {searchResults.length} dari {variantList.length} varian
                </span>
                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                  Tekan{' '}
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono">
                    Ctrl + K
                  </kbd>{' '}
                  untuk modal pencarian cepat
                </span>
              </div>
            </div>

            {/* Ready for Fase 2 Banner */}
            <div className="bg-gradient-to-r from-blue-900/10 via-slate-900/5 to-emerald-900/10 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Fase 1 Selesai: Sync Delta, Cache IndexedDB & Indeks SKU Aktif
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Seluruh master dan saldo stok tersimpan di browser. Siap lanjut ke{' '}
                  <strong>Fase 2: Stok Master (Matriks Size × Warna, Kartu Stok, Opname)</strong>.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('stock')}
                className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors shrink-0 shadow-sm"
              >
                <span>Lihat Modul Stok</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onSelectVariant={(item) => {
          setSkuSearchQuery(item.sku);
        }}
      />
    </div>
  );
};
