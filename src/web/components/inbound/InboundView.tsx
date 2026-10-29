import React, { useState } from 'react';
import { ArrowDownLeft, FileSpreadsheet, Clock, Users } from 'lucide-react';
import { InboundDocForm } from './InboundDocForm';
import { InboundListView } from './InboundListView';
import { PartnersView } from './PartnersView';

export const InboundView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'entry' | 'history' | 'partners'>('entry');

  return (
    <div className="space-y-5">
      {/* Module Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowDownLeft className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Barang Masuk (Inbound)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Pencatatan cepat barang masuk, kulakan grosir supplier, setoran maklun, dan buku utang
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 p-1 bg-slate-100/80 dark:bg-slate-900 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('entry')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'entry'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Catat Barang Masuk
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'history'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Riwayat Dokumen
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('partners')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === 'partners'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            Kelola Mitra
          </button>
        </div>
      </div>

      {/* Tab Contents */}
      {activeTab === 'entry' && <InboundDocForm />}
      {activeTab === 'history' && <InboundListView />}
      {activeTab === 'partners' && <PartnersView />}
    </div>
  );
};
