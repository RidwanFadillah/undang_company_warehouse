import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Warehouse, User as UserIcon, ShieldCheck, Database, Zap, RefreshCw } from 'lucide-react';
import type { MeResponse } from '../../../shared/schema';

export const Shell: React.FC = () => {
  const { data, isLoading, error, refetch, isFetching } = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await fetch('/api/me');
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `HTTP ${res.status}`);
      }
      return res.json();
    },
  });

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 font-sans overflow-hidden">
      {/* Sidebar - Kosong sesuai prompt Fase 0 */}
      <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shrink-0">
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-200 dark:border-slate-800">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
            <Warehouse className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-tight text-slate-900 dark:text-white">
              Gudang Cepat
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">ERP Toko Online</p>
          </div>
        </div>

        {/* Sidebar Navigation - Kosong untuk Fase 0 */}
        <div className="flex-1 p-4 flex flex-col justify-center items-center text-center text-slate-400 dark:text-slate-600">
          <div className="border border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-6 w-full">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Sidebar Menu</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              Kosong (Siap untuk Fase 1)
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span>v0.1.0 • Fase 0</span>
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Online
          </span>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
              Fondasi & Auth
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              title="Perbarui data auth"
              className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-blue-600' : ''}`} />
            </button>

            {/* User Profile Badge */}
            <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200 dark:border-slate-800">
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                <UserIcon className="w-4 h-4" />
              </div>
              <div className="text-left text-xs">
                {isLoading ? (
                  <span className="text-slate-400">Memuat...</span>
                ) : error ? (
                  <span className="text-red-500 font-medium">Tidak terautentikasi</span>
                ) : (
                  <>
                    <p className="font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                      {data?.user?.email ?? 'Unknown User'}
                    </p>
                    <p className="text-[11px] text-slate-500 capitalize leading-tight">
                      Role:{' '}
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        {data?.user?.role}
                      </span>
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-950">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <Zap className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Fase 0 Berhasil Disiapkan
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Scaffold frontend SPA (Vite + React + Tailwind + shadcn) dan backend Worker
                    (Hono + Cloudflare D1) telah terhubung dan aktif.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <div className="text-xs text-slate-500">Autentikasi</div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      CF Access + Dev Bypass
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <div>
                    <div className="text-xs text-slate-500">Database</div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Cloudflare D1 (SQLite)
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                  <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <div className="text-xs text-slate-500">Anggaran Shell</div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      &lt; 150 KB Gzip (Lolos)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Status API /me */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                Status Respons Endpoint{' '}
                <code className="text-xs font-mono text-blue-600 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded">
                  GET /api/me
                </code>
              </h3>
              {isLoading ? (
                <div className="text-sm text-slate-500 animate-pulse">
                  Menghubungi Worker API...
                </div>
              ) : error ? (
                <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/50 p-3 rounded-lg border border-red-200 dark:border-red-900">
                  {error.message}
                </div>
              ) : (
                <pre className="text-xs font-mono bg-slate-50 dark:bg-slate-950 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 overflow-x-auto">
                  {JSON.stringify(data, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
