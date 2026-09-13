import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Page } from '../types';
import { api } from '../services/api';
import { ConfirmModal } from '../components/ConfirmModal';
import { useProjectScopeContext } from '../hooks/useAppShellContext';

function parseElements(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const EMPTY_FORM = { name: '', path: '/', description: '', requiresAuth: false };

export function ProjectOverviewPage() {
  const { activeProject, onToast } = useProjectScopeContext();

  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);

  const loadPages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getPages(activeProject.id);
      setPages(res.pages);
    } catch (err) {
      onToast('error', 'Failed to load pages', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeProject.id, onToast]);

  useEffect(() => { loadPages(); }, [loadPages]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (page: Page) => {
    setForm({ name: page.name, path: page.path, description: page.description || '', requiresAuth: page.requiresAuth });
    setEditingId(page.id);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        path: form.path.trim() || '/',
        description: form.description.trim() || undefined,
        requiresAuth: form.requiresAuth,
      };
      if (editingId) {
        const res = await api.updatePage(editingId, payload);
        setPages(prev => prev.map(p => p.id === editingId ? res.page : p));
        onToast('success', 'Halaman diperbarui', res.page.name);
      } else {
        const res = await api.createPage({ projectId: activeProject.id, ...payload });
        setPages(prev => [...prev, res.page]);
        onToast('success', 'Halaman ditambahkan', res.page.name);
      }
      setShowModal(false);
      setEditingId(null);
    } catch (err) {
      onToast('error', editingId ? 'Gagal update halaman' : 'Gagal tambah halaman', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      await api.deletePage(deleteId);
      setPages(prev => prev.filter(p => p.id !== deleteId));
      onToast('success', 'Halaman dihapus');
      setDeleteId(null);
    } catch (err) {
      onToast('error', 'Gagal hapus halaman', (err as Error).message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleScan = async (page: Page) => {
    setScanningId(page.id);
    try {
      await api.scanPage(page.id);
      await loadPages();
      onToast('success', 'Scan selesai', page.name);
    } catch (err) {
      onToast('error', 'Scan belum bisa jalan', (err as Error).message);
    } finally {
      setScanningId(null);
    }
  };

  const pageToDelete = pages.find(p => p.id === deleteId);

  return (
    <div className="space-y-5">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Kembali ke Projects
      </Link>

      {/* ── Project info card ── */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900">{activeProject.name}</h2>
            {activeProject.description && (
              <p className="text-sm text-gray-500 mt-1">{activeProject.description}</p>
            )}
            {activeProject.projectUrl && (
              <a
                href={activeProject.projectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-700 mt-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                {activeProject.projectUrl}
              </a>
            )}
          </div>
          <p className="text-xs text-gray-400 flex-shrink-0">
            {activeProject._count?.testCaseSets ?? 0} test set{(activeProject._count?.testCaseSets ?? 0) !== 1 ? 's' : ''} ·
            {' '}Dibuat {new Date(activeProject.createdAt).toLocaleDateString('id-ID')}
          </p>
        </div>
      </div>

      {/* ── Pages catalog ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Pages</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Katalog halaman project ini — jadi referensi (opsional) saat generate automation script
            </p>
          </div>
          <button onClick={openCreate} className="btn-primary text-sm flex items-center gap-1.5 flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Tambah Halaman
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
            <svg className="w-5 h-5 animate-spin text-blue-500 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Memuat halaman...
          </div>
        ) : pages.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">Belum ada halaman yang didokumentasikan</p>
            <p className="text-xs mt-1">Tambah halaman biar ada konteks nyata pas generate automation</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pages.map(page => {
              const elementCount = parseElements(page.elements).length;
              return (
                <div key={page.id} className="border border-gray-200 rounded-lg p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-gray-900">{page.name}</h4>
                        <code className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{page.path}</code>
                        {page.requiresAuth && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-700">
                            Butuh login
                          </span>
                        )}
                      </div>
                      {page.description && (
                        <p className="text-xs text-gray-500 mt-1">{page.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {elementCount > 0
                          ? `${elementCount} elemen ditemukan${page.lastScannedAt ? ` · terakhir di-scan ${new Date(page.lastScannedAt).toLocaleDateString('id-ID')}` : ''}`
                          : 'Belum pernah di-scan'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      <button
                        onClick={() => handleScan(page)}
                        disabled={scanningId === page.id}
                        className="text-xs px-2 py-1 border border-gray-200 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {scanningId === page.id ? 'Scanning...' : 'Scan'}
                      </button>
                      <button
                        onClick={() => openEdit(page)}
                        className="text-xs px-2 py-1 border border-gray-200 text-gray-700 rounded hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteId(page.id)}
                        className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add/Edit modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{editingId ? 'Edit Halaman' : 'Tambah Halaman'}</h2>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                  Nama Halaman <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Login Page"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Path</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="/login"
                  value={form.path}
                  onChange={e => setForm(f => ({ ...f, path: e.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-1">Digabung dengan Project URL saat scan (misal: app.example.com + /login)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Deskripsi</label>
                <textarea
                  className="input-field"
                  rows={3}
                  placeholder='misal: "Form login dengan field email, password, tombol Masuk"'
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={form.requiresAuth}
                  onChange={e => setForm(f => ({ ...f, requiresAuth: e.target.checked }))}
                />
                Halaman ini butuh login dulu
              </label>
              {form.requiresAuth && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                  Scan otomatis untuk halaman yang butuh login belum didukung — isi deskripsi manual dulu di atas.
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditingId(null); }}
                  className="btn-secondary flex-1"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.name.trim()}
                  className="btn-primary flex-1"
                >
                  {saving ? 'Menyimpan...' : editingId ? 'Update' : 'Tambah'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteId && (
        <ConfirmModal
          title="Hapus Halaman"
          message={`Hapus "${pageToDelete?.name}"? Tindakan ini tidak bisa dibatalkan.`}
          confirmLabel="Hapus"
          variant="danger"
          loading={deleteLoading}
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
