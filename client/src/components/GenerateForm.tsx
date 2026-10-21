import React, { useState, useEffect } from 'react';
import type { GenerateInput, Project, Page } from '../types';
import { CustomSelect } from './CustomSelect';

interface GenerateFormProps {
  onGenerate: (input: GenerateInput) => void;
  loading: boolean;
  projects: Project[];
  pages?: Page[];
  activeProjectId: string;
  onCreateProject: () => void;
}

const LAST_TESTER_KEY   = 'qa_last_tester';
const LAST_USERNAME_KEY = 'qa_last_username';

function parseElementCount(raw: string): number {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function loadSavedAuth(projectId: string, pageId?: string): { username: string; password: string } {
  if (pageId) {
    try {
      const raw = localStorage.getItem(`qa_page_auth_${pageId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { username: parsed.username || '', password: parsed.password || '' };
      }
    } catch { /* ignore */ }
  }
  try {
    const raw = localStorage.getItem(`qa_project_auth_${projectId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { username: parsed.username || '', password: parsed.password || '' };
    }
  } catch { /* ignore */ }
  return {
    username: localStorage.getItem(LAST_USERNAME_KEY) || '',
    password: '',
  };
}

// ── Reusable styled primitives ───────────────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
      {children}
      {required && <span className="ml-0.5 text-red-400">*</span>}
    </label>
  );
}

function Input({
  value, onChange, placeholder, type = 'text', required, autoComplete, children,
}: {
  value: string; onChange: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string; type?: string; required?: boolean; autoComplete?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <input
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full px-3 py-2 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg
                   focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white
                   placeholder-gray-400 transition pr-9"
      />
      {children}
    </div>
  );
}

function Textarea({
  value, onChange, placeholder, rows = 3,
}: {
  value: string; onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
  placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      rows={rows}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="w-full px-3 py-2 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg
                 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white
                 placeholder-gray-400 transition resize-none"
    />
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export function GenerateForm({ onGenerate, loading, pages = [], activeProjectId }: GenerateFormProps) {
  const [form, setForm] = useState<GenerateInput>({
    feature:        '',
    description:    '',
    userFlow:       '',
    expectedResult: '',
    role:           '',
    testedBy:       '',
    username:       '',
    password:       '',
    projectId:      activeProjectId,
    pageId:         '',
  });
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const lastTester   = localStorage.getItem(LAST_TESTER_KEY) || localStorage.getItem('qa_display_name') || 'Pratama';
    const lastUsername = localStorage.getItem(LAST_USERNAME_KEY);
    setForm(prev => ({
      ...prev,
      ...(lastTester   ? { testedBy: lastTester }   : {}),
      ...(lastUsername ? { username: lastUsername }  : {}),
    }));
  }, []);

  useEffect(() => {
    setForm(prev => ({ ...prev, projectId: activeProjectId, pageId: '' }));
  }, [activeProjectId]);

  const handlePageSelect = (selectedId: string) => {
    if (!selectedId) {
      setForm(prev => ({ ...prev, pageId: '' }));
      return;
    }

    const page = pages.find(p => p.id === selectedId);
    if (!page) return;

    const savedAuth = loadSavedAuth(activeProjectId, page.id);
    setRequiresAuth(page.requiresAuth);

    setForm(prev => ({
      ...prev,
      pageId: page.id,
      feature: page.name,
      description: page.description || prev.description || '',
      username: page.requiresAuth ? (savedAuth.username || prev.username || '') : prev.username,
      password: page.requiresAuth ? (savedAuth.password || prev.password || '') : prev.password,
    }));
  };

  const handleRequiresAuthToggle = (checked: boolean) => {
    setRequiresAuth(checked);
    if (checked && (!form.username || !form.password)) {
      const savedAuth = loadSavedAuth(activeProjectId, form.pageId || undefined);
      setForm(prev => ({
        ...prev,
        username: prev.username || savedAuth.username,
        password: prev.password || savedAuth.password,
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.feature.trim() || !form.testedBy?.trim()) return;
    if (form.testedBy?.trim()) localStorage.setItem(LAST_TESTER_KEY, form.testedBy.trim());
    if (requiresAuth && form.username?.trim()) {
      localStorage.setItem(LAST_USERNAME_KEY, form.username.trim());
    }
    onGenerate({
      ...form,
      projectId: form.projectId || undefined,
      pageId:    form.pageId    || undefined,
      testedBy:  form.testedBy?.trim() || undefined,
      username:  requiresAuth ? (form.username?.trim() || undefined) : undefined,
      password:  requiresAuth ? (form.password?.trim() || undefined) : undefined,
    });
  };

  const set = (field: keyof GenerateInput) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const selectedPage  = pages.find(p => p.id === form.pageId);
  const selectedPageElements = selectedPage ? parseElementCount(selectedPage.elements) : 0;
  const canSubmit = !loading && form.feature.trim() && form.testedBy?.trim() && (!requiresAuth || (form.username?.trim() && form.password));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Row 1: 4 Kolom melebar ke samping */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Col 1: Pilih Menu / Halaman dari Hasil Scraping */}
        <div>
          <Label>Pilih Halaman (Hasil Scan)</Label>
          <CustomSelect
            value={form.pageId || ''}
            onChange={handlePageSelect}
            placeholder="— Input Manual / Tanpa Scan —"
            options={[
              { value: '', label: '— Input Manual / Tanpa Scan —' },
              ...pages.map(p => {
                const count = parseElementCount(p.elements);
                return {
                  value: p.id,
                  label: `${p.name} (${p.path})`,
                  sublabel: count > 0 ? `${count} selector ditemukan` : 'Belum di-scan',
                  dotColor: count > 0 ? '#0ABAB5' : '#cbd5e1',
                };
              }),
            ]}
          />
        </div>

        {/* Col 2: Feature / Module */}
        <div>
          <Label required>Feature / Module</Label>
          <Input
            placeholder="e.g. Login, Checkout, Dashboard"
            value={form.feature}
            onChange={set('feature')}
            required
          />
        </div>

        {/* Col 3: Role / User */}
        <div>
          <Label>Role / User</Label>
          <Input
            placeholder="e.g. Admin, Affiliate, Guest"
            value={form.role || ''}
            onChange={set('role')}
          />
        </div>

        {/* Col 4: Tested By */}
        <div>
          <Label required>Tested By</Label>
          <Input
            placeholder="e.g. Pratama"
            value={form.testedBy || ''}
            onChange={set('testedBy')}
            required
          />
        </div>
      </div>

      {/* Info badge ketika halaman hasil scan dipilih */}
      {selectedPage && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            {selectedPageElements > 0
              ? `${selectedPageElements} selector hasil scrape dari halaman "${selectedPage.name}" (${selectedPage.path}) akan dipakai AI untuk membuat test case & siap dijalankan di Automation.`
              : `Halaman "${selectedPage.name}" belum di-scan. Kamu bisa klik Scan di menu Pages & Scan agar selector-nya ikut terbaca.`}
          </span>
        </div>
      )}

      {/* Row 2: 3 Kolom Textarea melebar ke samping */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Description</Label>
          <Textarea
            rows={3}
            placeholder="Jelaskan fungsi fitur ini secara singkat..."
            value={form.description || ''}
            onChange={set('description')}
          />
        </div>

        <div>
          <Label>User Flow</Label>
          <Textarea
            rows={3}
            placeholder="Contoh: User buka halaman → isi form → klik submit → lihat hasil"
            value={form.userFlow || ''}
            onChange={set('userFlow')}
          />
        </div>

        <div>
          <Label>Expected Result</Label>
          <Textarea
            rows={3}
            placeholder="Apa hasil yang diharapkan dari sistem setelah flow dijalankan?"
            value={form.expectedResult || ''}
            onChange={set('expectedResult')}
          />
        </div>
      </div>

      {/* Conditional Auth Row: 2 Kolom melebar jika butuh login */}
      {requiresAuth && (
        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>Email / Username Login</Label>
            <Input
              placeholder="user@example.com"
              value={form.username || ''}
              onChange={set('username')}
              required={requiresAuth}
              autoComplete="off"
            />
          </div>
          <div>
            <Label required>Password Login</Label>
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Masukkan password"
              value={form.password || ''}
              onChange={set('password')}
              required={requiresAuth}
              autoComplete="off"
            >
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </Input>
          </div>
        </div>
      )}

      {/* Row 3: Footer Bar — Auth Toggle di kiri, Tombol Generate di kanan */}
      <div className="pt-2 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg cursor-pointer select-none hover:bg-gray-100 transition-colors">
          <input
            type="checkbox"
            className="rounded"
            checked={requiresAuth}
            onChange={e => handleRequiresAuthToggle(e.target.checked)}
          />
          <span>Halaman / fitur ini butuh login dulu</span>
        </label>

        <div className="flex items-center gap-3 ml-auto">
          {!form.testedBy?.trim() && form.feature.trim() && (
            <span className="text-xs text-red-400">Isi "Tested By" untuk generate</span>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-primary px-6 py-2.5 text-xs font-semibold rounded-lg flex items-center gap-2 active:scale-[0.98]"
          >
            {loading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate Test Cases
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
