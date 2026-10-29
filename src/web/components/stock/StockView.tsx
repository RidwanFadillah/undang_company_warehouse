import React, { useState } from 'react';
import {
  Layers,
  Table as TableIcon,
  AlertTriangle,
  Plus,
  DollarSign,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { useMaster } from '../../lib/masterStore';
import type { Variant } from '../../../shared/types';
import { StockMatrix } from './StockMatrix';
import { StockTable } from './StockTable';
import { StockIssuesView } from './StockIssuesView';
import { StockCardPanel } from './StockCardPanel';
import { OpnameModal } from './OpnameModal';
import { HppBySizeModal } from './HppBySizeModal';
import { NewProductModal } from './NewProductModal';

export const StockView: React.FC = () => {
  const { products, productList, variantList, stock, sync } = useMaster();

  // View state
  const [viewMode, setViewMode] = useState<'matrix' | 'table' | 'issues'>('matrix');
  const [unit, setUnit] = useState<'pcs' | 'lusin'>('pcs');
  const [filterStatus, setFilterStatus] = useState<'all' | 'minus' | 'low'>('all');
  const [tableSearchQuery, setTableSearchQuery] = useState('');

  // Selected product for matrix view
  const [selectedProductId, setSelectedProductId] = useState<number>(() => {
    return productList.length > 0 ? productList[0].id : 1;
  });

  // Modal & Drawer states
  const [activeVariantForCard, setActiveVariantForCard] = useState<Variant | null>(null);
  const [activeVariantForOpname, setActiveVariantForOpname] = useState<Variant | null>(null);
  const [isHppModalOpen, setIsHppModalOpen] = useState(false);
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleMutationSuccess = (msg: string) => {
    showToast(msg);
    sync(true);
  };

  // Ensure selected product is valid
  const currentProduct = products[selectedProductId] || productList[0];
  const currentProductVariants = variantList.filter((v) => v.product_id === currentProduct?.id);

  // Issues counts for badges
  const negativeCount = variantList.filter((v) => (stock[v.id]?.qty ?? 0) < 0).length;
  const lowCount = variantList.filter((v) => {
    const qty = stock[v.id]?.qty ?? 0;
    return v.min_stock > 0 && qty >= 0 && qty <= v.min_stock;
  }).length;

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        {/* Left: View Mode Switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
          <button
            onClick={() => setViewMode('matrix')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              viewMode === 'matrix'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Matriks</span>
          </button>

          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              viewMode === 'table'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Daftar</span>
          </button>

          <button
            onClick={() => setViewMode('issues')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              viewMode === 'issues'
                ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <span>Perlu Koreksi</span>
            {negativeCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 font-mono text-[10px]">
                {negativeCount}
              </span>
            )}
          </button>
        </div>

        {/* Right: Quick Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Unit Toggle [pcs | lusin] */}
          <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 bg-slate-50 dark:bg-slate-800/40 text-xs">
            <button
              onClick={() => setUnit('pcs')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                unit === 'pcs'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Pcs
            </button>
            <button
              onClick={() => setUnit('lusin')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                unit === 'lusin'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Lusin
            </button>
          </div>

          {currentProduct && viewMode === 'matrix' && (
            <button
              onClick={() => setIsHppModalOpen(true)}
              className="px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-900/60 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Atur HPP per Size</span>
            </button>
          )}

          <button
            onClick={() => setIsNewProductModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Produk</span>
          </button>
        </div>
      </div>

      {/* Filter & Selector Bar for Matrix & Table Mode */}
      {viewMode !== 'issues' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Matrix Mode Product Selector */}
          {viewMode === 'matrix' ? (
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Pilih Produk:
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-blue-500"
              >
                {productList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={tableSearchQuery}
                onChange={(e) => setTableSearchQuery(e.target.value)}
                placeholder="Filter nama, SKU, size, warna..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Status Filters */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                filterStatus === 'all'
                  ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setFilterStatus('minus')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                filterStatus === 'minus'
                  ? 'bg-red-600 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-red-600'
              }`}
            >
              <span>Hanya Minus</span>
              {negativeCount > 0 && (
                <span className="font-mono text-[10px]">({negativeCount})</span>
              )}
            </button>
            <button
              onClick={() => setFilterStatus('low')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                filterStatus === 'low'
                  ? 'bg-amber-600 text-white'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-amber-600'
              }`}
            >
              <span>Stok Rendah</span>
              {lowCount > 0 && <span className="font-mono text-[10px]">({lowCount})</span>}
            </button>
          </div>
        </div>
      )}

      {/* View Content */}
      {viewMode === 'matrix' ? (
        currentProduct ? (
          <StockMatrix
            product={currentProduct}
            variants={currentProductVariants}
            stock={stock}
            unit={unit}
            filterStatus={filterStatus}
            onSelectVariant={(v) => setActiveVariantForCard(v)}
          />
        ) : (
          <div className="p-12 text-center text-slate-400">
            Belum ada produk. Tambah produk pertama.
          </div>
        )
      ) : viewMode === 'table' ? (
        <StockTable
          products={products}
          variants={variantList}
          stock={stock}
          unit={unit}
          filterStatus={filterStatus}
          searchQuery={tableSearchQuery}
          onSelectVariant={(v) => setActiveVariantForCard(v)}
        />
      ) : (
        <StockIssuesView
          products={products}
          variants={variantList}
          stock={stock}
          unit={unit}
          onOpenOpname={(v) => setActiveVariantForOpname(v)}
        />
      )}

      {/* Slide-over Stock Card Panel */}
      <StockCardPanel
        variant={activeVariantForCard}
        product={activeVariantForCard ? products[activeVariantForCard.product_id] : undefined}
        stockBalance={activeVariantForCard ? stock[activeVariantForCard.id] : undefined}
        unit={unit}
        onClose={() => setActiveVariantForCard(null)}
        onOpenOpname={(v) => {
          setActiveVariantForOpname(v);
        }}
      />

      {/* Stock Opname Modal */}
      <OpnameModal
        variant={activeVariantForOpname}
        product={activeVariantForOpname ? products[activeVariantForOpname.product_id] : undefined}
        stockBalance={activeVariantForOpname ? stock[activeVariantForOpname.id] : undefined}
        isOpen={!!activeVariantForOpname}
        onClose={() => setActiveVariantForOpname(null)}
        onSuccess={() => handleMutationSuccess('Koreksi stock opname berhasil disimpan')}
      />

      {/* HPP By Size Modal */}
      <HppBySizeModal
        product={currentProduct || null}
        variants={currentProductVariants}
        isOpen={isHppModalOpen}
        onClose={() => setIsHppModalOpen(false)}
        onSuccess={() => handleMutationSuccess('HPP per size berhasil diperbarui')}
      />

      {/* New Product Modal */}
      <NewProductModal
        isOpen={isNewProductModalOpen}
        onClose={() => setIsNewProductModalOpen(false)}
        onSuccess={() => handleMutationSuccess('Produk dan varian baru berhasil dibuat')}
      />
    </div>
  );
};
