import React, { useState, useEffect } from 'react';
import type { GenerateInput, Project } from '../types';

interface GenerateFormProps {
  onGenerate: (input: GenerateInput) => void;
  loading: boolean;
  projects: Project[];
  activeProjectId: string;
  onCreateProject: () => void;
}

const LAST_TESTER_KEY    = 'qa_last_tester';
const LAST_USERNAME_KEY  = 'qa_last_username';

// ── Reusable styled primitives ───────────────────────────────────────────────
function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
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
        className="w-full px-3 py-2.5 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg
                   focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white
                   placeholder-gray-300 transition"
      />
      {children}
    </div>
  );
}

function Textarea({
  value, onChange, placeholder, rows = 2,
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
      className="w-full px-3 py-2.5 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg
                 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white
                 placeholder-gray-300 transition resize-none"
    />
  );
}

function StyledSelect({
  value, onChange, children,
}: {
  value: string | number; onChange: React.ChangeEventHandler<HTMLSelectElement>;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="w-full appearance-none px-3 py-2.5 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg
                   focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white
                   transition cursor-pointer pr-8"
      >
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
        fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export function GenerateForm({ onGenerate, loading, projects, activeProjectId, onCreateProject }: GenerateFormProps) {
  const [form, setForm] = useState<GenerateInput>({
    feature:        '',
    description:    '',
    userFlow:       '',
    expectedResult: '',
    role:           '',
    testedBy:       '',
    username:       '',
    password:       '',
    count:          20,
    projectId:      activeProjectId,
  });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const lastTester   = localStorage.getItem(LAST_TESTER_KEY);
    const lastUsername = localStorage.getItem(LAST_USERNAME_KEY);
    setForm(prev => ({
      ...prev,
      ...(lastTester   ? { testedBy: lastTester }   : {}),
      ...(lastUsername ? { username: lastUsername }  : {}),
    }));
  }, []);

  useEffect(() => {
    setForm(prev => ({ ...prev, projectId: activeProjectId }));
  }, [activeProjectId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.feature.trim() || !form.testedBy?.trim()) return;
    if (form.testedBy?.trim()) localStorage.setItem(LAST_TESTER_KEY,   form.testedBy.trim());
    if (form.username?.trim()) localStorage.setItem(LAST_USERNAME_KEY, form.username.trim());
    onGenerate({
      ...form,
      projectId: form.projectId || undefined,
      testedBy:  form.testedBy?.trim()  || undefined,
      username:  form.username?.trim()  || undefined,
      password:  form.password?.trim()  || undefined,
    });
  };

  const set = (field: keyof GenerateInput) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const value = field === 'count' ? parseInt(e.target.value, 10) : e.target.value;
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const activeProject = projects.find(p => p.id === (form.projectId || activeProjectId));
  const canSubmit     = !loading && form.feature.trim() && form.testedBy?.trim();

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Project — compact info row */}
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-100">
        <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="text-xs text-blue-700 flex-1 truncate font-medium">
          {activeProject ? activeProject.name : 'Belum ada project dipilih'}
        </span>
        <button
          type="button"
          onClick={onCreateProject}
          className="text-[11px] text-blue-500 hover:text-blue-700 whitespace-nowrap flex-shrink-0"
        >
          + New
        </button>
      </div>

      {/* Feature */}
      <div>
        <Label required>Feature / Module</Label>
        <Input
          placeholder="e.g. Login, Checkout, Share Link"
          value={form.feature}
          onChange={set('feature')}
          required
        />
      </div>

      {/* Description */}
      <div>
        <Label>Description</Label>
        <Textarea
          placeholder="What does this feature do?"
          value={form.description || ''}
          onChange={set('description')}
        />
      </div>

      {/* User Flow */}
      <div>
        <Label>User Flow</Label>
        <Textarea
          placeholder="e.g. User opens page → fills form → submits → sees result"
          value={form.userFlow || ''}
          onChange={set('userFlow')}
        />
      </div>

      {/* Expected Result */}
      <div>
        <Label>Expected Result</Label>
        <Textarea
          placeholder="What should the system do after the flow?"
          value={form.expectedResult || ''}
          onChange={set('expectedResult')}
        />
      </div>

      {/* Role */}
      <div>
        <Label>Role / User</Label>
        <Input
          placeholder="e.g. Admin, Affiliate, Guest"
          value={form.role || ''}
          onChange={set('role')}
        />
      </div>

      {/* Credentials */}
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-3.5 space-y-3">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Login Credentials</span>
          <span className="text-[10px] text-gray-300 font-normal normal-case tracking-normal">— opsional</span>
        </div>
        <div>
          <Label>Username / Email</Label>
          <Input
            placeholder="user@example.com"
            value={form.username || ''}
            onChange={set('username')}
            autoComplete="off"
          />
        </div>
        <div>
          <Label>Password</Label>
          <Input
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={form.password || ''}
            onChange={set('password')}
            autoComplete="off"
          >
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
            >
              {showPassword ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </Input>
        </div>
        {(form.username || form.password) && (
          <p className="text-xs text-blue-500 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            AI akan memasukkan credentials ini ke kolom Test Data
          </p>
        )}
      </div>

      {/* Tested By */}
      <div>
        <Label required>Tested By</Label>
        <Input
          placeholder="e.g. Pratama"
          value={form.testedBy || ''}
          onChange={set('testedBy')}
          required
        />
      </div>

      {/* Count */}
      <div>
        <Label>Jumlah Test Case</Label>
        <StyledSelect value={form.count} onChange={set('count')}>
          <option value={10}>10 test cases</option>
          <option value={20}>20 test cases</option>
          <option value={30}>30 test cases</option>
          <option value={50}>50 test cases</option>
        </StyledSelect>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full py-3 text-sm font-semibold text-white rounded-xl
                   bg-blue-600 hover:bg-blue-700 active:scale-[0.98]
                   disabled:opacity-40 disabled:cursor-not-allowed
                   transition-all shadow-sm shadow-blue-200"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating...
          </span>
        ) : 'Generate Test Cases'}
      </button>

      {!form.testedBy?.trim() && form.feature.trim() && (
        <p className="text-xs text-center text-red-400">Isi "Tested By" untuk generate.</p>
      )}
    </form>
  );
}
