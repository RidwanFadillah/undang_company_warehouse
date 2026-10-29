import React, { useState, useEffect, useRef } from 'react';
import { Search, Package, ArrowRight, X } from 'lucide-react';
import { useMaster } from '../../lib/masterStore';
import type { IndexedItem } from '../../lib/searchIndex';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVariant?: (item: IndexedItem) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectVariant,
}) => {
  const [query, setQuery] = useState('');
  const { searchVariants } = useMaster();
  const inputRef = useRef<HTMLInputElement>(null);

  const results = searchVariants(query, 8);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Palette Modal */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col z-10 animate-in fade-in-0 zoom-in-95 duration-150">
        {/* Search Header */}
        <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari SKU, nama produk, size, warna... (misal: 'CD Hitam', 'M')"
            className="w-full bg-transparent border-0 text-sm focus:outline-none focus:ring-0 text-slate-900 dark:text-slate-100 placeholder-slate-400"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-400 bg-slate-50 dark:bg-slate-800">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/60">
          {results.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              Tidak ada varian SKU yang cocok dengan &quot;{query}&quot;
            </div>
          ) : (
            results.map((item) => (
              <div
                key={item.variantId}
                onClick={() => {
                  onSelectVariant?.(item);
                  onClose();
                }}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-xs text-blue-600 dark:text-blue-400">
                        {item.sku}
                      </span>
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                        {item.productName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                      <span>
                        Size:{' '}
                        <strong className="text-slate-700 dark:text-slate-300">{item.size}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Warna:{' '}
                        <strong className="text-slate-700 dark:text-slate-300">{item.color}</strong>
                      </span>
                      <span>•</span>
                      <span>HPP: Rp {item.hpp.toLocaleString('id-ID')}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 pl-3">
                  <div className="text-right">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {item.stockQty} pcs
                    </span>
                    <p className="text-[10px] text-slate-400">Stok</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between text-[11px] text-slate-400">
          <span>Pencarian in-memory instan (&lt; 16 ms)</span>
          <span>{results.length} hasil ditampilkan</span>
        </div>
      </div>
    </div>
  );
};
