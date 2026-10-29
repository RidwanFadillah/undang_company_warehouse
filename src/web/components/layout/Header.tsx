import React, { useState, useEffect } from 'react';
import {
  Search,
  RefreshCw,
  Sun,
  Moon,
  User as UserIcon,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { MeResponse } from '../../../shared/schema';

interface HeaderProps {
  user?: MeResponse['user'];
  isSyncing: boolean;
  lastSyncedAt: number;
  syncError: string | null;
  onManualSync: () => void;
  onOpenCommandPalette: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  isSyncing,
  lastSyncedAt,
  syncError,
  onManualSync,
  onOpenCommandPalette,
}) => {
  const [isDark, setIsDark] = useState(() => {
    return (
      localStorage.getItem('theme') === 'dark' ||
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  // Relative time for lastSyncedAt
  const [timeAgo, setTimeAgo] = useState('baru saja');
  useEffect(() => {
    const updateTimeAgo = () => {
      if (!lastSyncedAt) {
        setTimeAgo('belum pernah');
        return;
      }
      const diffSec = Math.floor((Date.now() - lastSyncedAt) / 1000);
      if (diffSec < 10) setTimeAgo('baru saja');
      else if (diffSec < 60) setTimeAgo(`${diffSec} dtk lalu`);
      else setTimeAgo(`${Math.floor(diffSec / 60)} mnt lalu`);
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 5000);
    return () => clearInterval(interval);
  }, [lastSyncedAt]);

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between shrink-0">
      {/* Quick Search Button (opens Ctrl+K) */}
      <button
        onClick={onOpenCommandPalette}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs transition-colors w-64 justify-between"
      >
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5" />
          <span>Cari SKU, varian...</span>
        </div>
        <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400">
          Ctrl K
        </kbd>
      </button>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        {/* Sync Indicator */}
        <div className="flex items-center gap-2 text-xs">
          {isSyncing ? (
            <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Menyinkronkan...</span>
            </span>
          ) : syncError ? (
            <span
              className="flex items-center gap-1.5 text-red-600 dark:text-red-400 font-medium"
              title={syncError}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Sync Gagal</span>
            </span>
          ) : (
            <span
              className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"
              title={`Sinkronisasi terakhir: ${timeAgo}`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline">Tersinkron ({timeAgo})</span>
            </span>
          )}

          <button
            onClick={onManualSync}
            disabled={isSyncing}
            title="Sinkronkan sekarang"
            className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={() => setIsDark((prev) => !prev)}
          title={isDark ? 'Beralih ke mode terang' : 'Beralih ke mode gelap'}
          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* User Profile Badge */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200 dark:border-slate-800">
          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            <UserIcon className="w-4 h-4" />
          </div>
          <div className="text-left text-xs hidden sm:block">
            <p className="font-semibold text-slate-800 dark:text-slate-200 leading-tight">
              {user?.email ?? 'Memuat...'}
            </p>
            <p className="text-[11px] text-slate-500 capitalize leading-tight">
              Role:{' '}
              <span className="font-medium text-blue-600 dark:text-blue-400">
                {user?.role ?? '-'}
              </span>
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
