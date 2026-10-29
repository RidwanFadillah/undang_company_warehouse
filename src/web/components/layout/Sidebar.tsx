import React from 'react';
import {
  LayoutDashboard,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  BookOpen,
  Scissors,
  Wallet,
  BarChart3,
  Settings,
  Warehouse,
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Ringkasan', icon: LayoutDashboard },
  { id: 'stock', label: 'Stok Master', icon: Layers },
  { id: 'inbound', label: 'Barang Masuk', icon: ArrowDownLeft },
  { id: 'orders', label: 'Pesanan & Keluar', icon: ArrowUpRight },
  { id: 'returns', label: 'Retur & Batal', icon: RotateCcw },
  { id: 'debt', label: 'Utang Supplier', icon: BookOpen },
  { id: 'maklun', label: 'Maklun', icon: Scissors },
  { id: 'finance', label: 'Keuangan', icon: Wallet },
  { id: 'reports', label: 'Laporan', icon: BarChart3 },
  { id: 'settings', label: 'Pengaturan', icon: Settings },
];

interface SidebarProps {
  activeTab: string;
  onSelectTab: (id: string) => void;
  variantCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab, variantCount = 0 }) => {
  return (
    <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-200 dark:border-slate-800">
        <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
          <Warehouse className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-sm tracking-tight text-slate-900 dark:text-white truncate">
            Gudang Cepat
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">ERP Toko Online</p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`}
                />
                <span>{item.label}</span>
              </div>
              {item.id === 'stock' && variantCount > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                  {variantCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
        <span>Gudang Cepat • v0.1.0</span>
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          IndexedDB
        </span>
      </div>
    </aside>
  );
};
