import React, { useState } from 'react';
import { Plus, Search, Edit, Check, X } from 'lucide-react';
import { useMaster } from '../../lib/masterStore';
import { NewPartnerModal } from './NewPartnerModal';
import type { Partner } from '../../../shared/types';

export const PartnersView: React.FC = () => {
  const { partnerList, sync } = useMaster();
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  // Edit State
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [editName, setEditName] = useState('');
  const [editPic, setEditPic] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNote, setEditNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const startEdit = (p: Partner) => {
    setEditingPartner(p);
    setEditName(p.name);
    setEditPic(p.pic || '');
    setEditPhone(p.phone || '');
    setEditNote(p.note || '');
  };

  const saveEdit = async () => {
    if (!editingPartner) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/partners/${editingPartner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          pic: editPic.trim() || null,
          phone: editPhone.trim() || null,
          note: editNote.trim() || null,
        }),
      });
      if (!res.ok) throw new Error('Gagal memperbarui data mitra');
      await sync(true);
      setEditingPartner(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Terjadi kesalahan');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleActive = async (p: Partner) => {
    const newActive = p.is_active === 1 ? 0 : 1;
    try {
      await fetch(`/api/partners/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newActive }),
      });
      await sync(true);
    } catch {
      alert('Gagal mengubah status aktif');
    }
  };

  const filteredPartners = partnerList.filter((p) => {
    if (filterType !== 'all' && p.type !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.pic && p.pic.toLowerCase().includes(q)) ||
        (p.phone && p.phone.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Top Filter and Add Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Filter Type */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium"
          >
            <option value="all">Semua Tipe Mitra</option>
            <option value="supplier">Supplier / Grosir</option>
            <option value="konveksi">Konveksi / Maklun</option>
            <option value="reseller">Reseller</option>
            <option value="toko_online">Toko Online</option>
          </select>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari nama mitra, PIC, telepon..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsNewModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Tambah Mitra Baru
        </button>
      </div>

      {/* Partners Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
              <tr>
                <th className="py-2.5 px-3">Kode</th>
                <th className="py-2.5 px-3">Nama Mitra</th>
                <th className="py-2.5 px-3">Tipe</th>
                <th className="py-2.5 px-3">PIC (Kontak)</th>
                <th className="py-2.5 px-3">No. Telepon / WA</th>
                <th className="py-2.5 px-3">Catatan</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredPartners.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Tidak ada mitra ditemukan.
                  </td>
                </tr>
              ) : (
                filteredPartners.map((p) => {
                  const isEditing = editingPartner?.id === p.id;

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors ${
                        p.is_active === 0 ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                        {p.code || '-'}
                      </td>
                      <td className="py-2.5 px-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="px-2 py-1 text-xs border rounded w-full"
                          />
                        ) : (
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {p.name}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 uppercase">
                          {p.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editPic}
                            onChange={(e) => setEditPic(e.target.value)}
                            className="px-2 py-1 text-xs border rounded w-full"
                          />
                        ) : (
                          p.pic || '-'
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            className="px-2 py-1 text-xs border rounded w-full"
                          />
                        ) : (
                          p.phone || '-'
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            className="px-2 py-1 text-xs border rounded w-full"
                          />
                        ) : (
                          p.note || '-'
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleActive(p)}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition-colors ${
                            p.is_active === 1
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                          }`}
                        >
                          {p.is_active === 1 ? 'AKTIF' : 'NONAKTIF'}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={saveEdit}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPartner(null)}
                              className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            className="p-1 text-slate-500 hover:text-blue-600 rounded transition-colors"
                            title="Edit data mitra"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
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

      <NewPartnerModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onCreated={() => {}}
      />
    </div>
  );
};
