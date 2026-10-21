import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Page } from '../types';
import { api } from '../services/api';
import { ConfirmModal } from '../components/ConfirmModal';
import { useProjectScopeContext } from '../hooks/useAppShellContext';

interface ScannedElementItem {
  selector: string;
  tag: string;
  role: string;
  text: string;
}

interface StoredPageAuth {
  loginPath: string;
  username: string;
  password: string;
}

function parseElements(raw: string): ScannedElementItem[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadPageAuth(projectId: string, pageId?: string | null): StoredPageAuth {
  if (pageId) {
    try {
      const raw = localStorage.getItem(`qa_page_auth_${pageId}`);
      if (raw) return JSON.parse(raw) as StoredPageAuth;
    } catch { /* ignore */ }
  }
  try {
    const raw = localStorage.getItem(`qa_project_auth_${projectId}`);
    if (raw) return JSON.parse(raw) as StoredPageAuth;
  } catch { /* ignore */ }
  return {
    loginPath: '/login',
    username: '',
    password: '',
  };
}

function savePageAuth(projectId: string, pageId: string, auth: StoredPageAuth) {
  localStorage.setItem(`qa_page_auth_${pageId}`, JSON.stringify(auth));
  localStorage.setItem(`qa_project_auth_${projectId}`, JSON.stringify(auth));
}

const EMPTY_FORM = {
  name: '',
  path: '/',
  description: '',
  requiresAuth: false,
  loginPath: '/login',
  username: '',
  password: '',
};

export function ProjectOverviewPage() {
  const { activeProject, onToast } = useProjectScopeContext();

  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [expandedPageId, setExpandedPageId] = useState<string | null>(null);

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
    const savedAuth = loadPageAuth(activeProject.id, null);
    setForm({
      ...EMPTY_FORM,
      loginPath: savedAuth.loginPath || '/login',
      username: savedAuth.username || '',
      password: savedAuth.password || '',
    });
    setShowPassword(false);
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (page: Page) => {
    const savedAuth = loadPageAuth(activeProject.id, page.id);
    setForm({
      name: page.name,
      path: page.path,
      description: page.description || '',
      requiresAuth: page.requiresAuth,
      loginPath: savedAuth.loginPath || '/login',
      username: savedAuth.username || '',
      password: savedAuth.password || '',
    });
    setShowPassword(false);
    setEditingId(page.id);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (form.requiresAuth && (!form.username.trim() || !form.password)) {
      onToast('error', 'Kredensial diperlukan', 'Isi Email/Username dan Password untuk halaman yang butuh login.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        path: form.path.trim() || '/',
        description: form.description.trim() || null,
        requiresAuth: form.requiresAuth,
      };
      if (editingId) {
        const res = await api.updatePage(editingId, payload);
        if (form.requiresAuth) {
          savePageAuth(activeProject.id, res.page.id, {
            loginPath: form.loginPath.trim() || '/login',
            username: form.username.trim(),
            password: form.password,
          });
        }
        setPages(prev => prev.map(p => p.id === editingId ? res.page : p));
        onToast('success', 'Halaman diperbarui', res.page.name);
      } else {
        const res = await api.createPage({ projectId: activeProject.id, ...payload });
        if (form.requiresAuth) {
          savePageAuth(activeProject.id, res.page.id, {
            loginPath: form.loginPath.trim() || '/login',
            username: form.username.trim(),
            password: form.password,
          });
        }
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

  const executeScan = async (
    page: Page,
    options?: { username?: string; password?: string; loginPath?: string; showBrowser?: boolean }
  ) => {
    setScanningId(page.id);
    try {
      const res = await api.scanPage(page.id, options);
      await loadPages();
      onToast(
        'success',
        'Scan selesai!',
        `${res.scannedCount ?? parseElements(res.page?.elements || '[]').length} elemen ditemukan di ${page.name}`
      );
    } catch (err) {
      onToast('error', 'Scan belum bisa jalan', (err as Error).message);
    } finally {
      setScanningId(null);
    }
  };

  const handleScanClick = (page: Page) => {
    if (page.requiresAuth) {
      const savedAuth = loadPageAuth(activeProject.id, page.id);
      if (!savedAuth.username || !savedAuth.password) {
        onToast('info', 'Isi akun login dulu', 'Silakan lengkapi Email/Username dan Password pada halaman ini.');
        openEdit(page);
        return;
      }
      void executeScan(page, {
        loginPath: savedAuth.loginPath || '/login',
        username: savedAuth.username,
        password: savedAuth.password,
      });
      return;
    }
    void executeScan(page);
  };

  const pageToDelete = pages.find(p => p.id === deleteId);

  return (
    <div className="space-y-5">
      {/* ── Header Card ── */}
      <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[#f0fbfa] border border-[#b0ece8] flex items-center justify-center text-[#089e9a] flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-900">Pages &amp; Scan</h2>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#e6f9f8] text-[#06807d] border border-[#b0ece8]">
                {activeProject.name}
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {pages.length} Halaman
              </span>
              {activeProject.projectUrl && (
                <a
                  href={activeProject.projectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline font-medium truncate max-w-xs"
                >
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  {activeProject.projectUrl}
                </a>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {activeProject.description
                ? `${activeProject.description} — Kelola katalog halaman dan scan selector elemen otomatis dengan Playwright.`
                : 'Kelola katalog halaman project ini dan scan elemen/selector otomatis menggunakan Playwright untuk referensi AI & Automation.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <Link to="/projects" className="btn-secondary text-xs flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Projects
          </Link>
          <button onClick={openCreate} className="btn-primary text-xs flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Tambah Halaman
          </button>
        </div>
      </div>

      {/* ── Pages catalog ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Daftar Halaman ({pages.length})</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Klik <strong>Scan</strong> pada halaman untuk mengambil daftar selector otomatis dari URL project
            </p>
          </div>
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
              const elements = parseElements(page.elements);
              const elementCount = elements.length;
              const isExpanded = expandedPageId === page.id;
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
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-gray-400">
                          {elementCount > 0
                            ? `${elementCount} elemen ditemukan${page.lastScannedAt ? ` · terakhir di-scan ${new Date(page.lastScannedAt).toLocaleDateString('id-ID')}` : ''}`
                            : 'Belum pernah di-scan'}
                        </p>
                        {elementCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedPageId(isExpanded ? null : page.id)}
                            className="text-xs text-blue-600 hover:underline font-medium"
                          >
                            {isExpanded ? 'Sembunyikan elemen' : 'Lihat selector'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      <button
                        onClick={() => handleScanClick(page)}
                        disabled={scanningId === page.id}
                        className="text-xs px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
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

                  {isExpanded && elementCount > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 max-h-48 overflow-y-auto">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs">
                        {elements.map((el, i) => (
                          <div key={i} className="flex items-center gap-2 bg-gray-50 px-2.5 py-1.5 rounded border border-gray-200">
                            <code className="font-mono text-blue-700 font-medium truncate">{el.selector}</code>
                            {el.text && <span className="text-gray-500 truncate ml-auto">"{el.text}"</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add/Edit modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
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
                  placeholder="e.g. Dashboard Page"
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
                  placeholder="/dashboard"
                  value={form.path}
                  onChange={e => setForm(f => ({ ...f, path: e.target.value }))}
                />
                <p className="text-xs text-gray-400 mt-1">Digabung dengan Project URL saat scan (misal: app.example.com + /dashboard)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Deskripsi</label>
                <textarea
                  className="input-field"
                  rows={3}
                  placeholder='misal: "Halaman utama setelah login dengan tabel transaksi dan tombol tambah"'
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={form.requiresAuth}
                  onChange={e => setForm(f => ({ ...f, requiresAuth: e.target.checked }))}
                />
                Halaman ini butuh login dulu
              </label>

              {/* Muncul langsung di bawah checkbox saat "Halaman ini butuh login dulu" dicentang */}
              {form.requiresAuth && (
                <div className="space-y-3 p-3.5 bg-gray-50 border border-gray-200 rounded-lg">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                      Email / Username <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="input-field bg-white"
                      placeholder="user@example.com"
                      value={form.username}
                      onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                      required={form.requiresAuth}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="input-field bg-white pr-10"
                        placeholder="Masukkan password"
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        required={form.requiresAuth}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(prev => !prev)}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                        title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                      >
                        {showPassword ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">
                      Login Path (Opsional)
                    </label>
                    <input
                      type="text"
                      className="input-field bg-white"
                      placeholder="/login"
                      value={form.loginPath}
                      onChange={e => setForm(f => ({ ...f, loginPath: e.target.value }))}
                    />
                  </div>
                </div>
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
