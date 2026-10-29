import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Trash2, Plus, ClipboardPaste, Check, X, AlertTriangle, Sparkles } from 'lucide-react';
import { useMaster } from '../../lib/masterStore';
import { formatRupiah, pcsToLusin, lusinToPcs } from '../../../shared/rules/units';
import type { IndexedItem } from '../../lib/searchIndex';

export interface EntryGridRow {
  id: string;
  variant_id: number | null;
  product_id?: number | null;
  sku: string;
  product_name: string;
  size: string;
  color: string;
  qty: number | '';
  unit: 'pcs' | 'lusin';
  unit_cost: number | '';
}

interface EntryGridProps {
  rows: EntryGridRow[];
  onChangeRows: (rows: EntryGridRow[]) => void;
  defaultUnit: 'pcs' | 'lusin';
  onSave?: () => void;
}

export const EntryGrid: React.FC<EntryGridProps> = ({
  rows,
  onChangeRows,
  defaultUnit,
  onSave,
}) => {
  const { searchVariants, variants, products, productList, variantList, sync } = useMaster();
  const [activeSearchRowId, setActiveSearchRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<IndexedItem[]>([]);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const normalizeText = (str: string) => str.toLowerCase().replace(/[\s-_]+/g, '');

  // Search variants when searchQuery changes
  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      const results = searchVariants(searchQuery, 10);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, searchVariants]);

  // Auto-relink rows whenever variantList or productList updates
  useEffect(() => {
    let changed = false;
    const updated = rows.map((r) => {
      if (r.variant_id) return r;

      const normProd = normalizeText(r.product_name || r.sku);
      if (!normProd) return r;

      // Find product
      const p = productList.find(
        (prod) =>
          normalizeText(prod.sku) === normProd ||
          normalizeText(prod.name) === normProd ||
          normProd.includes(normalizeText(prod.sku)) ||
          normalizeText(prod.name).includes(normProd)
      );

      const pId = r.product_id || p?.id;
      if (!pId) return r;

      // Find variant
      const v = variantList.find(
        (item) =>
          item.product_id === pId &&
          item.size.toLowerCase() === r.size.toLowerCase() &&
          item.color.toLowerCase() === r.color.toLowerCase()
      );

      if (v) {
        changed = true;
        return {
          ...r,
          variant_id: v.id,
          product_id: pId,
          sku: p?.sku || r.sku,
          product_name: p?.name || r.product_name,
          size: v.size,
          color: v.color,
          unit_cost: v.hpp || 0,
        };
      } else if (!r.product_id && p) {
        changed = true;
        return {
          ...r,
          product_id: p.id,
          sku: p.sku,
          product_name: p.name,
        };
      }
      return r;
    });

    if (changed) {
      onChangeRows(updated);
    }
  }, [variantList, productList, rows, onChangeRows]);

  // Add new empty row
  const addRow = useCallback(() => {
    const newRowId = `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newRow: EntryGridRow = {
      id: newRowId,
      variant_id: null,
      product_id: null,
      sku: '',
      product_name: '',
      size: '-',
      color: '-',
      qty: 1,
      unit: defaultUnit,
      unit_cost: 0,
    };
    onChangeRows([...rows, newRow]);

    setTimeout(() => {
      inputRefs.current[`${newRowId}_sku`]?.focus();
    }, 50);
  }, [rows, defaultUnit, onChangeRows]);

  // Remove row
  const removeRow = (id: string) => {
    if (rows.length <= 1) {
      onChangeRows([
        {
          id: `row_${Date.now()}`,
          variant_id: null,
          product_id: null,
          sku: '',
          product_name: '',
          size: '-',
          color: '-',
          qty: '',
          unit: defaultUnit,
          unit_cost: '',
        },
      ]);
      return;
    }
    onChangeRows(rows.filter((r) => r.id !== id));
  };

  // Update specific field
  const updateRow = (id: string, updates: Partial<EntryGridRow>) => {
    onChangeRows(rows.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  // Select variant from search dropdown
  const selectVariant = (rowId: string, item: IndexedItem) => {
    const v = variants[item.variantId];
    const p = products[item.productId];

    updateRow(rowId, {
      variant_id: item.variantId,
      product_id: item.productId,
      sku: p?.sku || item.productName,
      product_name: p?.name || item.productName,
      size: v?.size || item.size,
      color: v?.color || item.color,
      unit_cost: v?.hpp || item.hpp || 0,
    });

    setActiveSearchRowId(null);
    setSearchQuery('');
    setSearchResults([]);

    setTimeout(() => {
      inputRefs.current[`${rowId}_qty`]?.focus();
      inputRefs.current[`${rowId}_qty`]?.select();
    }, 50);
  };

  // Switch color or size directly for a selected product
  const handleColorChange = (row: EntryGridRow, newColor: string) => {
    const pId = row.product_id || (row.variant_id ? variants[row.variant_id]?.product_id : null);
    if (!pId) return;

    const productVariants = variantList.filter((v) => v.product_id === pId);
    const matched =
      productVariants.find((v) => v.color === newColor && v.size === row.size) ||
      productVariants.find((v) => v.color === newColor);

    if (matched) {
      updateRow(row.id, {
        variant_id: matched.id,
        product_id: pId,
        color: matched.color,
        size: matched.size,
        unit_cost: matched.hpp || 0,
      });
    } else {
      updateRow(row.id, {
        variant_id: null,
        product_id: pId,
        color: newColor,
      });
    }
  };

  const handleSizeChange = (row: EntryGridRow, newSize: string) => {
    const pId = row.product_id || (row.variant_id ? variants[row.variant_id]?.product_id : null);
    if (!pId) return;

    const productVariants = variantList.filter((v) => v.product_id === pId);
    const matched =
      productVariants.find((v) => v.size === newSize && v.color === row.color) ||
      productVariants.find((v) => v.size === newSize);

    if (matched) {
      updateRow(row.id, {
        variant_id: matched.id,
        product_id: pId,
        color: matched.color,
        size: matched.size,
        unit_cost: matched.hpp || 0,
      });
    } else {
      updateRow(row.id, {
        variant_id: null,
        product_id: pId,
        size: newSize,
      });
    }
  };

  // Keyboard navigation
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowId: string,
    field: 'sku' | 'qty',
    rowIndex: number
  ) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      onSave?.();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'sku') {
        if (searchResults.length > 0) {
          selectVariant(rowId, searchResults[0]);
        } else {
          inputRefs.current[`${rowId}_qty`]?.focus();
          inputRefs.current[`${rowId}_qty`]?.select();
        }
      } else if (field === 'qty') {
        if (rowIndex === rows.length - 1) {
          addRow();
        } else {
          const nextRow = rows[rowIndex + 1];
          inputRefs.current[`${nextRow.id}_sku`]?.focus();
        }
      }
    }
  };

  // Register all new variants & new products in unregistered rows
  const handleRegisterAllNewVariants = async () => {
    setIsRegistering(true);
    try {
      // 1. Group completely new products (no product_id)
      const newProdGroups: Record<string, EntryGridRow[]> = {};
      // 2. Group new variants of existing products (has product_id)
      const existingProdGroups: Record<
        number,
        { sizes: Set<string>; colors: Set<string>; hpp: number }
      > = {};

      for (const r of unregisteredRows) {
        if (!r.product_id) {
          const pName = r.product_name || r.sku;
          if (!newProdGroups[pName]) {
            newProdGroups[pName] = [];
          }
          newProdGroups[pName].push(r);
        } else {
          if (!existingProdGroups[r.product_id]) {
            existingProdGroups[r.product_id] = {
              sizes: new Set(),
              colors: new Set(),
              hpp: Number(r.unit_cost) || 0,
            };
          }
          if (r.size && r.size !== '-') existingProdGroups[r.product_id].sizes.add(r.size);
          if (r.color && r.color !== '-') existingProdGroups[r.product_id].colors.add(r.color);
        }
      }

      // Create new products with their variants
      for (const [prodName, prodRows] of Object.entries(newProdGroups)) {
        const sku = prodName.toUpperCase().replace(/\s+/g, '-');
        const variantMap = new Map<
          string,
          { size: string; color: string; hpp: number; sell_price: number; min_stock: number }
        >();

        for (const pr of prodRows) {
          const sizeVal = pr.size && pr.size !== '-' ? pr.size : 'AllSize';
          const colorVal = pr.color && pr.color !== '-' ? pr.color : 'Default';
          const key = `${sizeVal}_${colorVal}`;
          if (!variantMap.has(key)) {
            variantMap.set(key, {
              size: sizeVal,
              color: colorVal,
              hpp: Number(pr.unit_cost) || 0,
              sell_price: 0,
              min_stock: 0,
            });
          }
        }

        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sku,
            name: prodName,
            category: 'Pakaian',
            variants: Array.from(variantMap.values()),
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Gagal membuat produk ${prodName}`);
        }
      }

      // Add new variants to existing products
      for (const [pIdStr, g] of Object.entries(existingProdGroups)) {
        if (g.sizes.size > 0 && g.colors.size > 0) {
          await fetch('/api/products/variants/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              product_id: Number(pIdStr),
              sizes: Array.from(g.sizes),
              colors: Array.from(g.colors),
              hpp: g.hpp,
              sell_price: 0,
              min_stock: 0,
            }),
          });
        }
      }

      await sync(true);
    } catch (err) {
      alert('Gagal mendaftarkan data baru: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsRegistering(false);
    }
  };

  // Register single row
  const handleRegisterSingleRow = async (row: EntryGridRow) => {
    setIsRegistering(true);
    try {
      if (!row.product_id) {
        // Create product + variant
        const pName = row.product_name || row.sku;
        const sku = pName.toUpperCase().replace(/\s+/g, '-');
        await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sku,
            name: pName,
            category: 'Pakaian',
            variants: [
              {
                size: row.size && row.size !== '-' ? row.size : 'AllSize',
                color: row.color && row.color !== '-' ? row.color : 'Default',
                hpp: Number(row.unit_cost) || 0,
                sell_price: 0,
                min_stock: 0,
              },
            ],
          }),
        });
      } else {
        await fetch('/api/products/variants/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: row.product_id,
            sizes: [row.size],
            colors: [row.color],
            hpp: Number(row.unit_cost) || 0,
            sell_price: 0,
            min_stock: 0,
          }),
        });
      }
      await sync(true);
    } catch (err) {
      alert('Gagal mendaftarkan: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsRegistering(false);
    }
  };

  // Smart paste handler (from clipboard or text)
  const processPastedText = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;

    const newRows: EntryGridRow[] = [];

    for (const line of lines) {
      const cols = line.includes('\t')
        ? line.split('\t').map((c) => c.trim())
        : line.split(',').map((c) => c.trim());

      if (cols.length === 0) continue;

      let rawProd = '';
      let rawColor = '-';
      let rawSize = '-';
      let rawQty = 1;
      let rawCost: number | null = null;

      if (cols.length >= 5) {
        // 5 Kolom: [Produk] [Warna] [Size] [Qty] [Harga] (opsional jika dicantumkan)
        rawProd = cols[0];
        rawColor = cols[1];
        rawSize = cols[2];
        rawQty = Number(cols[3].replace(/[^0-9.-]+/g, '')) || 1;
        rawCost = Number(cols[4].replace(/[^0-9.-]+/g, '')) || null;
      } else if (cols.length === 4) {
        // 4 Kolom standar tanpa harga: [Produk] [Warna] [Size] [Qty]
        rawProd = cols[0];
        rawColor = cols[1];
        rawSize = cols[2];
        rawQty = Number(cols[3].replace(/[^0-9.-]+/g, '')) || 1;
      } else if (cols.length === 3) {
        // 3 Kolom: [Produk] [Warna/Size] [Qty]
        rawProd = cols[0];
        rawColor = cols[1];
        rawQty = Number(cols[2].replace(/[^0-9.-]+/g, '')) || 1;
      } else {
        // 1-2 Kolom: [SKU / Produk Lengkap] [Qty]
        rawProd = cols[0];
        rawQty = cols.length > 1 ? Number(cols[1].replace(/[^0-9.-]+/g, '')) || 1 : 1;
      }

      // 1. Try finding matching product in master products
      const normProd = normalizeText(rawProd);
      const matchedProduct = productList.find(
        (p) =>
          normalizeText(p.sku) === normProd ||
          normalizeText(p.name) === normProd ||
          normProd.includes(normalizeText(p.sku)) ||
          normalizeText(p.name).includes(normProd)
      );

      if (matchedProduct) {
        const existingVariant = variantList.find(
          (v) =>
            v.product_id === matchedProduct.id &&
            v.size.toLowerCase() === rawSize.toLowerCase() &&
            v.color.toLowerCase() === rawColor.toLowerCase()
        );

        if (existingVariant) {
          newRows.push({
            id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            variant_id: existingVariant.id,
            product_id: matchedProduct.id,
            sku: matchedProduct.sku,
            product_name: matchedProduct.name,
            size: existingVariant.size,
            color: existingVariant.color,
            qty: isNaN(rawQty) || rawQty <= 0 ? 1 : rawQty,
            unit: defaultUnit,
            unit_cost: rawCost !== null && !isNaN(rawCost) ? rawCost : existingVariant.hpp || 0,
          });
        } else {
          newRows.push({
            id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            variant_id: null,
            product_id: matchedProduct.id,
            sku: matchedProduct.sku,
            product_name: matchedProduct.name,
            size: rawSize,
            color: rawColor,
            qty: isNaN(rawQty) || rawQty <= 0 ? 1 : rawQty,
            unit: defaultUnit,
            unit_cost: rawCost !== null && !isNaN(rawCost) ? rawCost : 0,
          });
        }
        continue;
      }

      // 2. If not matched by product, try global searchVariants
      const fullSearch = `${rawProd} ${rawColor} ${rawSize}`.trim();
      const matches = searchVariants(fullSearch, 1);
      if (matches.length > 0) {
        const item = matches[0];
        const v = variants[item.variantId];
        const p = products[item.productId];
        newRows.push({
          id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          variant_id: item.variantId,
          product_id: item.productId,
          sku: p?.sku || item.productName,
          product_name: p?.name || item.productName,
          size: v?.size || item.size,
          color: v?.color || item.color,
          qty: isNaN(rawQty) || rawQty <= 0 ? 1 : rawQty,
          unit: defaultUnit,
          unit_cost: rawCost !== null && !isNaN(rawCost) ? rawCost : v?.hpp || item.hpp || 0,
        });
      } else {
        // Completely unmatched product
        newRows.push({
          id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          variant_id: null,
          product_id: null,
          sku: rawProd,
          product_name: rawProd,
          size: rawSize,
          color: rawColor,
          qty: isNaN(rawQty) || rawQty <= 0 ? 1 : rawQty,
          unit: defaultUnit,
          unit_cost: rawCost !== null && !isNaN(rawCost) ? rawCost : 0,
        });
      }
    }

    if (newRows.length > 0) {
      if (rows.length === 1 && rows[0].variant_id === null && rows[0].sku === '') {
        onChangeRows(newRows);
      } else {
        onChangeRows([...rows, ...newRows]);
      }
    }
  };

  const handleTablePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    if (text && (text.includes('\t') || text.includes('\n'))) {
      e.preventDefault();
      processPastedText(text);
    }
  };

  // Running totals & unregistered count
  const totalRows = rows.filter((r) => r.variant_id !== null).length;
  const unregisteredRows = rows.filter(
    (r) => r.variant_id === null && r.sku && r.sku.trim() !== ''
  );
  const unrecognizedProducts = Array.from(
    new Set(unregisteredRows.filter((r) => !r.product_id).map((r) => r.product_name || r.sku))
  );

  const totalPcs = rows.reduce((sum, r) => {
    if (r.variant_id === null || r.qty === '') return sum;
    const pcs = r.unit === 'lusin' ? lusinToPcs(Number(r.qty)) : Number(r.qty);
    return sum + pcs;
  }, 0);
  const totalLusin = pcsToLusin(totalPcs);
  const totalAmount = rows.reduce((sum, r) => {
    if (r.variant_id === null || r.qty === '' || r.unit_cost === '') return sum;
    const pcs = r.unit === 'lusin' ? lusinToPcs(Number(r.qty)) : Number(r.qty);
    return sum + Math.round(pcs * Number(r.unit_cost));
  }, 0);

  return (
    <div className="space-y-3" onPaste={handleTablePaste}>
      {/* Banner if there are unregistered products or variants */}
      {unregisteredRows.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Ditemukan <strong>{unregisteredRows.length} baris</strong> yang belum terdaftar di
              master data
              {unrecognizedProducts.length > 0 && (
                <>
                  {' '}
                  (termasuk produk baru: <strong>{unrecognizedProducts.join(', ')}</strong>)
                </>
              )}
              .
            </span>
          </div>

          <button
            type="button"
            disabled={isRegistering}
            onClick={handleRegisterAllNewVariants}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isRegistering
              ? 'Mendaftarkan ke Master...'
              : `Daftarkan ${unregisteredRows.length} Item ke Master Data`}
          </button>
        </div>
      )}

      {/* Action Bar Above Table */}
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Daftar Baris Barang Masuk ({rows.length} baris)
          </span>
          <span className="text-slate-400">·</span>
          <span>
            Tekan{' '}
            <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono border">
              Enter
            </kbd>{' '}
            untuk pindah/tambah baris
          </span>
          <span className="text-slate-400">·</span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono border">
              Ctrl+S
            </kbd>{' '}
            untuk simpan
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsPasteModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded border border-blue-200 dark:border-blue-800 transition-colors"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          Tempel dari Excel / Sheets
        </button>
      </div>

      {/* Spreadsheet Grid */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
        <div className="overflow-x-auto max-h-[480px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 select-none">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center font-semibold">#</th>
                <th className="py-2.5 px-3 min-w-[260px] font-semibold">
                  SKU / Nama Produk (Autocomplete)
                </th>
                <th className="py-2.5 px-3 w-28 text-center font-semibold">Size</th>
                <th className="py-2.5 px-3 w-36 font-semibold">Warna</th>
                <th className="py-2.5 px-3 w-24 text-right font-semibold">Qty</th>
                <th className="py-2.5 px-3 w-20 text-center font-semibold">Satuan</th>
                <th className="py-2.5 px-3 w-32 text-right font-semibold">HPP (Master)</th>
                <th className="py-2.5 px-3 w-32 text-right font-semibold">Subtotal (Rp)</th>
                <th className="py-2.5 px-2 w-20 text-center font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row, index) => {
                const rowPcs =
                  row.qty === ''
                    ? 0
                    : row.unit === 'lusin'
                      ? lusinToPcs(Number(row.qty))
                      : Number(row.qty);
                const subtotal =
                  row.unit_cost === '' ? 0 : Math.round(rowPcs * Number(row.unit_cost));
                const isSearchActive = activeSearchRowId === row.id;

                const pId =
                  row.product_id || (row.variant_id ? variants[row.variant_id]?.product_id : null);
                const productVariants = pId ? variantList.filter((v) => v.product_id === pId) : [];
                const availableSizes = Array.from(
                  new Set(productVariants.map((v) => v.size))
                ).sort();
                const availableColors = Array.from(
                  new Set(productVariants.map((v) => v.color))
                ).sort();

                const isUnlinked = row.variant_id === null && Boolean(row.sku);

                return (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    {/* Index */}
                    <td className="py-1.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                      {index + 1}
                    </td>

                    {/* SKU Autocomplete Cell */}
                    <td className="py-1.5 px-3 relative">
                      <div className="relative">
                        <input
                          ref={(el) => {
                            inputRefs.current[`${row.id}_sku`] = el;
                          }}
                          type="text"
                          value={isSearchActive ? searchQuery : row.sku || ''}
                          placeholder="Ketik SKU, nama produk, warna, atau size..."
                          onFocus={() => {
                            setActiveSearchRowId(row.id);
                            setSearchQuery(row.sku || '');
                          }}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, row.id, 'sku', index)}
                          className={`w-full px-2 py-1 text-xs rounded border transition-colors ${
                            row.variant_id
                              ? 'border-slate-200 dark:border-slate-700 font-medium text-slate-900 dark:text-white'
                              : 'border-amber-300 dark:border-amber-600 bg-amber-50/40 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
                          } focus:outline-none focus:ring-1 focus:ring-blue-500`}
                        />
                        {row.variant_id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500 absolute right-2 top-2 pointer-events-none" />
                        ) : isUnlinked ? (
                          <span className="absolute right-2 top-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                            {!row.product_id ? 'Produk Baru' : 'Varian Baru'}
                          </span>
                        ) : null}
                      </div>

                      {/* Dropdown Search Results */}
                      {isSearchActive && searchResults.length > 0 && (
                        <div className="absolute left-3 right-3 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                          {searchResults.map((item) => (
                            <button
                              key={item.variantId}
                              type="button"
                              onMouseDown={() => selectVariant(row.id, item)}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-950/50 flex items-center justify-between text-xs transition-colors"
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <span className="font-semibold text-slate-900 dark:text-white">
                                  {item.productName}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium text-[11px]">
                                  {item.color}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-mono font-medium text-[11px]">
                                  {item.size}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 ml-2">
                                <span className="text-[11px] text-slate-400">
                                  Stok: {item.stockQty} pcs
                                </span>
                                <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                                  HPP: {formatRupiah(item.hpp)}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Size Selector */}
                    <td className="py-1.5 px-3 text-center">
                      {availableSizes.length > 0 && availableSizes.includes(row.size) ? (
                        <select
                          value={row.size}
                          onChange={(e) => handleSizeChange(row, e.target.value)}
                          className="px-2 py-1 text-xs font-mono font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {availableSizes.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-xs">
                          {row.size}
                        </span>
                      )}
                    </td>

                    {/* Color Selector */}
                    <td className="py-1.5 px-3">
                      {availableColors.length > 0 && availableColors.includes(row.color) ? (
                        <select
                          value={row.color}
                          onChange={(e) => handleColorChange(row, e.target.value)}
                          className="w-full px-2 py-1 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {availableColors.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-700 dark:text-slate-300 font-medium">
                          {row.color}
                        </span>
                      )}
                    </td>

                    {/* Qty */}
                    <td className="py-1.5 px-3 text-right">
                      <input
                        ref={(el) => {
                          inputRefs.current[`${row.id}_qty`] = el;
                        }}
                        type="number"
                        min="0.1"
                        step={row.unit === 'lusin' ? '0.1' : '1'}
                        value={row.qty}
                        onChange={(e) =>
                          updateRow(row.id, {
                            qty: e.target.value === '' ? '' : Number(e.target.value),
                          })
                        }
                        onKeyDown={(e) => handleKeyDown(e, row.id, 'qty', index)}
                        className="w-20 px-2 py-1 text-right text-xs rounded border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono font-medium"
                      />
                    </td>

                    {/* Unit Toggle (pcs / lusin) */}
                    <td className="py-1.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          updateRow(row.id, {
                            unit: row.unit === 'pcs' ? 'lusin' : 'pcs',
                          })
                        }
                        className={`px-2 py-0.5 text-[11px] font-semibold rounded uppercase tracking-wider transition-colors ${
                          row.unit === 'lusin'
                            ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                        }`}
                        title="Klik untuk ubah satuan (pcs/lusin)"
                      >
                        {row.unit}
                      </button>
                    </td>

                    {/* HPP (Auto-synced from Master SKU) */}
                    <td className="py-1.5 px-3 text-right font-mono">
                      {row.variant_id ? (
                        <div
                          className="flex items-center justify-end gap-1.5 text-slate-700 dark:text-slate-300"
                          title="Tersinkronisasi otomatis dari master SKU"
                        >
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                            ✓
                          </span>
                          <span>{formatRupiah(Number(row.unit_cost) || 0)}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">-</span>
                      )}
                    </td>

                    {/* Subtotal */}
                    <td className="py-1.5 px-3 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {formatRupiah(subtotal)}
                    </td>

                    {/* Action */}
                    <td className="py-1.5 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {isUnlinked && (
                          <button
                            type="button"
                            disabled={isRegistering}
                            onClick={() => handleRegisterSingleRow(row)}
                            className="px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded border border-blue-200 dark:border-blue-800 transition-colors"
                            title="Daftarkan ke master data"
                          >
                            + Buat
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeRow(row.id)}
                          className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                          title="Hapus baris"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Summary Bar */}
        <div className="bg-slate-50 dark:bg-slate-800/90 border-t border-slate-200 dark:border-slate-700 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Baris (Enter)
          </button>

          <div className="flex items-center gap-6 text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Total Baris Valid:</span>{' '}
              <span className="font-semibold font-mono text-slate-800 dark:text-white">
                {totalRows} item
              </span>
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400">Total Qty:</span>{' '}
              <span className="font-semibold font-mono text-slate-800 dark:text-white">
                {totalPcs} pcs{' '}
                <span className="text-slate-400 font-normal">({totalLusin} lusin)</span>
              </span>
            </div>

            <div className="pl-4 border-l border-slate-300 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400">Total Nilai:</span>{' '}
              <span className="font-bold font-mono text-sm text-emerald-600 dark:text-emerald-400">
                {formatRupiah(totalAmount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Paste from Excel/Sheets Dialog */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ClipboardPaste className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                  Tempel Data dari Excel / Google Sheets
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-2">
              <p>
                Salin baris langsung dari tabel Excel / Google Sheets lalu tempel ke bawah. HPP akan{' '}
                <strong>otomatis tersinkronisasi</strong> dari data master SKU.
              </p>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg font-mono text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
                <p className="font-semibold text-blue-600 dark:text-blue-400">
                  Format Standar (4 Kolom):
                </p>
                <p>Nama Produk / SKU [Tab] Warna [Tab] Size [Tab] Qty</p>
                <p className="font-semibold text-purple-600 dark:text-purple-400 pt-1">
                  Format Ringkas (2 Kolom):
                </p>
                <p>SKU Lengkap / Varian [Tab] Qty</p>
              </div>
            </div>

            <textarea
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`Contoh 4 kolom:\nLEGGING SHORT\tHitam\tM\t50\nLEGGING SHORT\tPutih\tS\t24\n\nContoh 2 kolom:\nLEGGING-PANJANG-HITAM-L\t120`}
              className="w-full p-3 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={pasteText.trim().length === 0}
                onClick={() => {
                  processPastedText(pasteText);
                  setPasteText('');
                  setIsPasteModalOpen(false);
                }}
                className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 transition-colors"
              >
                Proses & Masukkan ke Grid
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
