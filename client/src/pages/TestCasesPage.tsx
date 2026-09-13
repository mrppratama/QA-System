import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TestCase } from '../types';
import { TESTING_RESULTS, AUTOMATION_STATUSES, TEST_CASE_TYPES } from '../types';
import { api } from '../services/api';
import { ConfirmModal } from '../components/ConfirmModal';
import { useProjectScopeContext } from '../hooks/useAppShellContext';

// ── Edit Modal ────────────────────────────────────────────────────────────────
interface EditModalProps {
  tc: TestCase;
  editValues: Partial<TestCase>;
  onChange: (values: Partial<TestCase>) => void;
  onSave: () => void;
  onCancel: () => void;
  testers: { id: string; email: string; name?: string }[];
}

// Result badge colors untuk custom select
const RESULT_BADGE: Record<string, { bg: string; text: string; ring: string }> = {
  'Not Tested': { bg: 'bg-gray-100',   text: 'text-gray-600',  ring: 'ring-gray-300'  },
  Passed:       { bg: 'bg-green-50',   text: 'text-green-700', ring: 'ring-green-300' },
  Failed:       { bg: 'bg-red-50',     text: 'text-red-700',   ring: 'ring-red-300'   },
  Blocked:      { bg: 'bg-amber-50',   text: 'text-amber-700', ring: 'ring-amber-300' },
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
      {children}
    </label>
  );
}

function StyledTextarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      rows={rows}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="w-full px-3 py-2.5 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg
                 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white
                 placeholder-gray-300 transition resize-none"
    />
  );
}

function StyledInput({ value, onChange, placeholder, type = 'text', list }: {
  value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string; list?: string;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      list={list}
      className="w-full px-3 py-2.5 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg
                 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white
                 placeholder-gray-300 transition"
    />
  );
}

function EditModal({ tc, editValues, onChange, onSave, onCancel, testers }: EditModalProps) {
  const set = (field: keyof TestCase) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ ...editValues, [field]: e.target.value });

  const resultVal  = (editValues.testingResult   || 'Not Tested') as string;
  const autoVal    = (editValues.automationStatus || 'Not Automated') as string;
  const badge      = RESULT_BADGE[resultVal] || RESULT_BADGE['Not Tested'];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                {tc.testCaseId}
              </span>
              <span className="text-xs text-gray-400">{tc.featureModule}</span>
            </div>
            <h3 className="text-base font-semibold text-gray-900">Edit Test Case</h3>
          </div>
          <button
            onClick={onCancel}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

          {/* Detail Test Case */}
          <div className="space-y-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Detail Test Case</p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Feature/Module</FieldLabel>
                <StyledInput
                  placeholder="e.g. Login"
                  value={editValues.featureModule || ''}
                  onChange={set('featureModule')}
                />
              </div>
              <div>
                <FieldLabel>Type</FieldLabel>
                <select
                  className="w-full px-3 py-2.5 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white
                             transition cursor-pointer"
                  value={editValues.type || ''}
                  onChange={set('type')}
                >
                  {TEST_CASE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div>
              <FieldLabel>Test Scenario</FieldLabel>
              <StyledTextarea
                rows={2}
                value={editValues.testScenario || ''}
                onChange={set('testScenario')}
              />
            </div>

            <div>
              <FieldLabel>Precondition</FieldLabel>
              <StyledTextarea
                rows={2}
                value={editValues.precondition || ''}
                onChange={set('precondition')}
              />
            </div>

            <div>
              <FieldLabel>Action Step</FieldLabel>
              <StyledTextarea
                rows={4}
                value={editValues.actionStep || ''}
                onChange={set('actionStep')}
              />
            </div>

            <div>
              <FieldLabel>Test Data</FieldLabel>
              <StyledTextarea
                rows={2}
                value={editValues.testData || ''}
                onChange={set('testData')}
              />
            </div>

            <div>
              <FieldLabel>Expected Result</FieldLabel>
              <StyledTextarea
                rows={3}
                value={editValues.expectedResult || ''}
                onChange={set('expectedResult')}
              />
            </div>
          </div>

          <hr className="border-gray-100" />

          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Hasil Testing</p>

          {/* Result & Auto status */}
          <div className="grid grid-cols-2 gap-4">

            {/* Testing Result — custom radio-style pills */}
            <div>
              <FieldLabel>Testing Result</FieldLabel>
              <div className="flex flex-col gap-1.5">
                {TESTING_RESULTS.map(r => {
                  const b = RESULT_BADGE[r] || RESULT_BADGE['Not Tested'];
                  const active = resultVal === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => onChange({ ...editValues, testingResult: r })}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                        active
                          ? `${b.bg} ${b.text} border-current ring-1 ${b.ring} shadow-sm`
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? b.bg.replace('50','400').replace('100','400') : 'bg-gray-300'}`}
                        style={active ? { backgroundColor: r === 'Passed' ? '#4ade80' : r === 'Failed' ? '#f87171' : r === 'Blocked' ? '#fbbf24' : '#94a3b8' } : {}}
                      />
                      {r}
                      {active && (
                        <svg className="ml-auto w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Automation Status */}
            <div>
              <FieldLabel>Automation Status</FieldLabel>
              <div className="flex flex-col gap-1.5">
                {AUTOMATION_STATUSES.map(s => {
                  const active = autoVal === s;
                  const colors = s === 'Automated'
                    ? 'bg-green-50 text-green-700 ring-green-300'
                    : s === 'Generated'
                      ? 'bg-blue-50 text-blue-700 ring-blue-300'
                      : 'bg-gray-100 text-gray-600 ring-gray-300';
                  const dot = s === 'Automated' ? '#4ade80' : s === 'Generated' ? '#60a5fa' : '#94a3b8';
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onChange({ ...editValues, automationStatus: s })}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                        active
                          ? `${colors} border-current ring-1 shadow-sm`
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: active ? dot : '#d1d5db' }} />
                      {s}
                      {active && (
                        <svg className="ml-auto w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Actual Result */}
          <div>
            <FieldLabel>Actual Result</FieldLabel>
            <StyledTextarea
              rows={3}
              placeholder="Apa yang terjadi saat test dijalankan…"
              value={editValues.actualResult || ''}
              onChange={set('actualResult')}
            />
          </div>

          {/* Bug Note */}
          <div>
            <FieldLabel>Bug Note</FieldLabel>
            <StyledTextarea
              rows={2}
              placeholder="Bug ID, link Jira, catatan…"
              value={editValues.bugNote || ''}
              onChange={set('bugNote')}
            />
          </div>

          {/* Test Date + Test By */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Test Date</FieldLabel>
              <StyledInput
                type="date"
                value={editValues.testDate || ''}
                onChange={set('testDate')}
              />
            </div>
            <div>
              <FieldLabel>Test By</FieldLabel>
              <StyledInput
                placeholder="Pilih atau ketik nama tester"
                value={editValues.testBy || ''}
                onChange={set('testBy')}
                list="testers-list"
              />
              {/* Autocomplete dari user terdaftar — tetap bisa ketik nama bebas */}
              <datalist id="testers-list">
                {testers.map(u => <option key={u.id} value={u.name || u.email} />)}
              </datalist>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 flex-shrink-0">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            Batal
          </button>
          <button
            onClick={onSave}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:scale-95 transition shadow-sm shadow-blue-200"
          >
            Simpan Perubahan
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quick Field Modal — buat edit satu field aja (Actual Result / Bug Note) ─────
interface QuickFieldModalProps {
  tc: TestCase;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

function QuickFieldModal({ tc, label, placeholder, value, onChange, onSave, onCancel, saving }: QuickFieldModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                {tc.testCaseId}
              </span>
              <span className="text-xs text-gray-400">{tc.featureModule}</span>
            </div>
            <h3 className="text-base font-semibold text-gray-900">{label}</h3>
          </div>
          <button
            onClick={onCancel}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5">
          <StyledTextarea
            rows={5}
            placeholder={placeholder}
            value={value}
            onChange={e => onChange(e.target.value)}
          />
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            Batal
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:scale-95 transition shadow-sm shadow-blue-200 disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Test Case Modal (manual, not via AI generate) ───────────────────────────
interface AddTestCaseModalProps {
  values: ManualTestCaseInput;
  onChange: (values: ManualTestCaseInput) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

function AddTestCaseModal({ values, onChange, onSave, onCancel, saving }: AddTestCaseModalProps) {
  const set = <K extends keyof ManualTestCaseInput>(field: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ ...values, [field]: e.target.value });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-900">Add Test Case</h3>
          <button
            onClick={onCancel}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Feature/Module <span className="text-red-500">*</span></FieldLabel>
              <StyledInput
                placeholder="e.g. Login"
                value={values.featureModule}
                onChange={set('featureModule')}
              />
            </div>
            <div>
              <FieldLabel>Type</FieldLabel>
              <select
                className="w-full px-3 py-2.5 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white
                           transition cursor-pointer"
                value={values.type}
                onChange={set('type')}
              >
                {TEST_CASE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <FieldLabel>Test Scenario <span className="text-red-500">*</span></FieldLabel>
            <StyledTextarea
              rows={2}
              placeholder="Apa yang diuji…"
              value={values.testScenario}
              onChange={set('testScenario')}
            />
          </div>

          <div>
            <FieldLabel>Precondition</FieldLabel>
            <StyledTextarea
              rows={2}
              placeholder="Kondisi awal sebelum test…"
              value={values.precondition}
              onChange={set('precondition')}
            />
          </div>

          <div>
            <FieldLabel>Action Step <span className="text-red-500">*</span></FieldLabel>
            <StyledTextarea
              rows={4}
              placeholder={'1. Buka halaman…\n2. Klik tombol…'}
              value={values.actionStep}
              onChange={set('actionStep')}
            />
          </div>

          <div>
            <FieldLabel>Test Data</FieldLabel>
            <StyledTextarea
              rows={2}
              placeholder="Data yang dipakai untuk test…"
              value={values.testData}
              onChange={set('testData')}
            />
          </div>

          <div>
            <FieldLabel>Expected Result <span className="text-red-500">*</span></FieldLabel>
            <StyledTextarea
              rows={3}
              placeholder="Apa yang seharusnya terjadi…"
              value={values.expectedResult}
              onChange={set('expectedResult')}
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 flex-shrink-0">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            Batal
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:scale-95 transition shadow-sm shadow-blue-200 disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Color maps ────────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  'Happy Path':          'bg-green-100 text-green-700',
  'Validation':          'bg-blue-100 text-blue-700',
  'Error Case':          'bg-red-100 text-red-700',
  'Important Edge Case': 'bg-amber-100 text-amber-700',
  'Important edge case': 'bg-amber-100 text-amber-700',
};

const RESULT_COLORS: Record<string, string> = {
  'Not Tested': 'bg-gray-100 text-gray-600',
  Passed: 'bg-green-100 text-green-700',
  Failed: 'bg-red-100 text-red-700',
  Blocked: 'bg-yellow-100 text-yellow-700',
};

const AUTO_STATUS_COLORS: Record<string, string> = {
  'Not Automated': 'bg-gray-100 text-gray-500',
  Generated: 'bg-blue-100 text-blue-700',
  Automated: 'bg-green-100 text-green-700',
};

const HIDDEN_COLS_KEY = 'qa_testcases_hidden_cols';

const OPTIONAL_COLUMNS: { key: string; label: string }[] = [
  { key: 'precondition', label: 'Precondition' },
  { key: 'testData',     label: 'Test Data' },
  { key: 'testDate',     label: 'Test Date' },
  { key: 'testBy',       label: 'Test By' },
  { key: 'bugNote',      label: 'Bug Note' },
];

interface ManualTestCaseInput {
  featureModule: string;
  testScenario: string;
  type: string;
  precondition: string;
  actionStep: string;
  testData: string;
  expectedResult: string;
}

const EMPTY_MANUAL_TEST_CASE: ManualTestCaseInput = {
  featureModule: '',
  testScenario: '',
  type: TEST_CASE_TYPES[0],
  precondition: '',
  actionStep: '',
  testData: '',
  expectedResult: '',
};

// format tanggal ke YYYY-MM-DD dari ISO string
function toDateInput(isoStr?: string): string {
  if (!isoStr) return '';
  return isoStr.slice(0, 10);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

// Helper: cell content wrapper
function Cell({ children, className = '', onClick, onExpand, expanded, expandTitle }: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;       // opens the edit modal (only for fields that modal can actually edit)
  onExpand?: () => void;      // toggles clamped/full view — for read-only long text
  expanded?: boolean;
  expandTitle?: string;
}) {
  const handleClick = onClick ?? onExpand;
  const title = onClick
    ? 'Klik untuk edit'
    : onExpand
      ? (expanded ? 'Klik untuk ciutkan' : (expandTitle || 'Klik untuk lihat teks lengkap'))
      : undefined;

  return (
    <td className="px-2 py-1.5 align-top border-t border-gray-100">
      <div
        onClick={handleClick}
        title={title}
        className={`${expanded ? '' : 'line-clamp-3'} whitespace-pre-line break-words max-w-[420px] text-xs leading-relaxed text-gray-700 ${
          handleClick ? 'cursor-pointer hover:text-blue-700' : ''
        } ${className}`}
      >
        {children}
      </div>
    </td>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function TestCasesPage() {
  const { activeProject, onToast } = useProjectScopeContext();
  const navigate = useNavigate();

  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterResult, setFilterResult] = useState('');
  const [filterAutoStatus, setFilterAutoStatus] = useState('');
  const [filterTestBy, setFilterTestBy] = useState('');
  const [projectTesters, setProjectTesters] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<TestCase>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(HIDDEN_COLS_KEY) || '[]');
      return new Set(Array.isArray(stored) ? stored : []);
    } catch {
      return new Set();
    }
  });
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  // Manual "Add Test Case"
  const [showAddModal, setShowAddModal] = useState(false);
  const [addValues, setAddValues] = useState<ManualTestCaseInput>(EMPTY_MANUAL_TEST_CASE);
  const [addSaving, setAddSaving] = useState(false);

  const toggleColumn = (key: string) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  // Per-ROW expand/collapse for long, read-only fields (not editable via the
  // "Update Hasil Testing" modal) — clicking any one of them expands ALL of
  // that row's read-only cells together (the row is already taller once one
  // cell expands, so showing the rest too avoids dead empty space).
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Debounce search input — avoid firing 1 API request per keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const inFlightRef = useRef<AbortController | null>(null);

  const loadTestCases = useCallback(async () => {
    if (!activeProject) return;
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    setLoading(true);
    try {
      const res = await api.getProjectTestCases(activeProject.id, {
        search: debouncedSearch || undefined,
        type: filterType || undefined,
        testingResult: filterResult || undefined,
        automationStatus: filterAutoStatus || undefined,
        testBy: filterTestBy || undefined,
        limit: 200,
      }, controller.signal);
      setTestCases(res.testCases);
      setTotal(res.total);
      setSelectedIds(new Set());
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      onToast('error', 'Failed to load test cases', (err as Error).message);
    } finally {
      if (inFlightRef.current === controller) setLoading(false);
    }
  }, [activeProject, debouncedSearch, filterType, filterResult, filterAutoStatus, filterTestBy, onToast]);

  useEffect(() => {
    loadTestCases();
    return () => inFlightRef.current?.abort();
  }, [loadTestCases]);

  // Registered users, for the "Test By" picker (still allows typing a custom name)
  const [testers, setTesters] = useState<{ id: string; email: string; name?: string }[]>([]);
  useEffect(() => {
    api.getUsers().then(res => setTesters(res.users)).catch(() => {});
  }, []);

  // Distinct "Test By" values actually used in this project, for the filter dropdown
  useEffect(() => {
    if (!activeProject) return;
    api.getProjectTesters(activeProject.id).then(res => setProjectTesters(res.testers)).catch(() => {});
  }, [activeProject]);

  const allSelected = testCases.length > 0 && selectedIds.size === testCases.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < testCases.length;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(testCases.map(tc => tc.id)));
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const startEdit = (tc: TestCase) => {
    setEditingId(tc.id);
    setEditValues({
      // Detail test case
      featureModule: tc.featureModule,
      testScenario: tc.testScenario,
      type: tc.type,
      precondition: tc.precondition || '',
      actionStep: tc.actionStep,
      testData: tc.testData || '',
      expectedResult: tc.expectedResult,
      // Hasil testing
      testingResult: tc.testingResult,
      actualResult: tc.actualResult || '',
      // Default testDate ke createdAt jika belum diisi
      testDate: tc.testDate ? toDateInput(tc.testDate) : toDateInput(tc.createdAt),
      testBy: tc.testBy || '',
      bugNote: tc.bugNote || '',
      automationStatus: tc.automationStatus,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEdit = async (id: string) => {
    try {
      const res = await api.updateTestCase(id, editValues);
      setTestCases(prev => prev.map(tc => tc.id === id ? { ...tc, ...res.testCase } : tc));
      setEditingId(null);
      setEditValues({});
      onToast('success', 'Test case updated');
    } catch (err) {
      onToast('error', 'Failed to update test case', (err as Error).message);
    }
  };

  const editingTc = editingId ? testCases.find(tc => tc.id === editingId) ?? null : null;

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      await api.deleteTestCase(deleteId);
      setTestCases(prev => prev.filter(tc => tc.id !== deleteId));
      setSelectedIds(prev => { const n = new Set(prev); n.delete(deleteId); return n; });
      setDeleteId(null);
      onToast('success', 'Test case deleted');
    } catch (err) {
      onToast('error', 'Failed to delete test case', (err as Error).message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleteLoading(true);
    try {
      const res = await api.bulkDeleteTestCases(Array.from(selectedIds));
      setTestCases(prev => prev.filter(tc => !selectedIds.has(tc.id)));
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      onToast('success', `${res.deleted} test cases deleted`);
    } catch (err) {
      onToast('error', 'Failed to delete test cases', (err as Error).message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleExport = async () => {
    if (!activeProject) return;
    setExporting(true);
    try {
      const blob = await api.exportProject(activeProject.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeProject.name.replace(/[^a-zA-Z0-9]/g, '-')}-TestCases.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onToast('success', 'Excel exported', `${activeProject.name} test cases downloaded`);
    } catch (err) {
      onToast('error', 'Export failed', (err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleQuickStatusChange = async (id: string, field: 'testingResult' | 'automationStatus', value: string) => {
    try {
      const res = await api.updateTestCase(id, { [field]: value });
      setTestCases(prev => prev.map(tc => tc.id === id ? { ...tc, ...res.testCase } : tc));
    } catch (err) {
      onToast('error', 'Failed to update', (err as Error).message);
    }
  };

  // Quick single-field editors (Actual Result / Bug Note) — separate from the
  // full "Edit Test Case" modal opened via the Actions pencil icon.
  const [quickField, setQuickField] = useState<{ id: string; field: 'actualResult' | 'bugNote'; value: string } | null>(null);
  const [quickFieldSaving, setQuickFieldSaving] = useState(false);

  const openQuickField = (tc: TestCase, field: 'actualResult' | 'bugNote') => {
    setQuickField({ id: tc.id, field, value: tc[field] || '' });
  };

  const saveQuickField = async () => {
    if (!quickField) return;
    setQuickFieldSaving(true);
    try {
      const res = await api.updateTestCase(quickField.id, { [quickField.field]: quickField.value });
      setTestCases(prev => prev.map(tc => tc.id === quickField.id ? { ...tc, ...res.testCase } : tc));
      setQuickField(null);
      onToast('success', 'Test case updated');
    } catch (err) {
      onToast('error', 'Failed to update test case', (err as Error).message);
    } finally {
      setQuickFieldSaving(false);
    }
  };

  const openAddModal = () => {
    setAddValues(EMPTY_MANUAL_TEST_CASE);
    setShowAddModal(true);
  };

  const handleAddTestCase = async () => {
    if (!activeProject) return;
    if (!addValues.featureModule.trim() || !addValues.testScenario.trim() || !addValues.actionStep.trim() || !addValues.expectedResult.trim()) {
      onToast('warning', 'Lengkapi dulu', 'Feature/Module, Test Scenario, Action Step, dan Expected Result wajib diisi');
      return;
    }
    setAddSaving(true);
    try {
      const res = await api.saveTestCases(activeProject.id, {
        feature: addValues.featureModule.trim(),
        testCases: [{
          featureModule: addValues.featureModule.trim(),
          testScenario: addValues.testScenario.trim(),
          type: addValues.type,
          precondition: addValues.precondition.trim(),
          actionStep: addValues.actionStep.trim(),
          testData: addValues.testData.trim() || '-',
          expectedResult: addValues.expectedResult.trim(),
        }],
      });
      setShowAddModal(false);
      onToast('success', 'Test case added', res.testCases[0]?.testCaseId);
      await loadTestCases(); // re-fetch so the new item respects active search/filters, pagination and total count
    } catch (err) {
      onToast('error', 'Failed to add test case', (err as Error).message);
    } finally {
      setAddSaving(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="card p-12 flex flex-col items-center text-center text-gray-400 max-w-2xl mx-auto">
        <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <p className="text-sm font-medium text-gray-500">No active project</p>
        <p className="text-xs mt-1">Select or create a project to view test cases</p>
      </div>
    );
  }

  // Kolom dengan min-width; lebar akhir tetap auto mengikuti konten terlebar.
  // `key` dipakai untuk cocokkan header ↔ body cell dan untuk show/hide kolom.
  const COLS: { key: string; label: string; min: number }[] = [
    { key: 'testCaseId',       label: 'Test Case ID',       min: 90  },
    { key: 'featureModule',    label: 'Feature/Module',     min: 130 },
    { key: 'testScenario',     label: 'Test Scenario',      min: 220 },
    { key: 'type',             label: 'Type',               min: 90  },
    { key: 'precondition',     label: 'Precondition',       min: 180 },
    { key: 'actionStep',       label: 'Action Step',        min: 220 },
    { key: 'testData',         label: 'Test Data',          min: 110 },
    { key: 'expectedResult',   label: 'Expected Result',    min: 200 },
    { key: 'actualResult',     label: 'Actual Result',      min: 190 },
    { key: 'testingResult',    label: 'Testing Result',     min: 110 },
    { key: 'automationStatus', label: 'Automation Status',  min: 130 },
    { key: 'testDate',         label: 'Test Date',          min: 95  },
    { key: 'testBy',           label: 'Test By',            min: 85  },
    { key: 'bugNote',          label: 'Bug Note',           min: 200 },
    { key: 'actions',          label: 'Actions',            min: 64  },
  ].filter(c => !hiddenCols.has(c.key));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Test Cases
            <span className="ml-2 text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
              {activeProject.name}
            </span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {total} total test case{total !== 1 ? 's' : ''}
            {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedIds.size > 0 && (
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              className="text-xs px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100"
            >
              Delete Selected ({selectedIds.size})
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={exporting || testCases.length === 0}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exporting ? 'Exporting...' : 'Export XLSX'}
          </button>
          <button
            onClick={openAddModal}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Test Case
          </button>
          <button
            onClick={() => navigate("../generate")}
            className="btn-primary text-xs flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Generate New
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-3 mb-4">
        <div className="flex gap-2 flex-wrap items-center">
          {/* Search */}
          <div className="flex-1 min-w-[180px] relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search ID, scenario, feature..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white
                         placeholder-gray-300 transition"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {/* Custom selects */}
          {[
            { value: filterType,       onChange: (v: string) => setFilterType(v),       placeholder: 'All Types',      options: TEST_CASE_TYPES as readonly string[]    },
            { value: filterResult,     onChange: (v: string) => setFilterResult(v),     placeholder: 'All Results',    options: TESTING_RESULTS as readonly string[]   },
            { value: filterAutoStatus, onChange: (v: string) => setFilterAutoStatus(v), placeholder: 'All Auto Status',options: AUTOMATION_STATUSES as readonly string[]},
            { value: filterTestBy,     onChange: (v: string) => setFilterTestBy(v),     placeholder: 'All Testers',    options: projectTesters },
          ].map((f, i) => (
            <div key={i} className="relative">
              <select
                value={f.value}
                onChange={e => f.onChange(e.target.value)}
                className="appearance-none pl-3 pr-7 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white
                           transition cursor-pointer text-gray-700"
              >
                <option value="">{f.placeholder}</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400"
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          ))}

          {/* Column visibility toggle */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColumnMenu(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg
                         hover:bg-gray-100 transition text-gray-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 4v16M15 4v16M4 8h4m8 0h4M4 16h4m8 0h4" />
              </svg>
              Columns
              {hiddenCols.size > 0 && (
                <span className="bg-blue-100 text-blue-700 rounded-full px-1.5 text-[10px] font-medium">
                  {hiddenCols.size} hidden
                </span>
              )}
            </button>
            {showColumnMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowColumnMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-gray-200 rounded-lg shadow-lg p-2 w-48">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide px-2 pb-1.5">
                    Show/Hide Columns
                  </p>
                  {OPTIONAL_COLUMNS.map(col => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-xs text-gray-700"
                    >
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={!hiddenCols.has(col.key)}
                        onChange={() => toggleColumn(col.key)}
                      />
                      {col.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card p-8 flex items-center justify-center text-gray-500">
          <svg className="w-5 h-5 animate-spin text-blue-500 mr-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading test cases...
        </div>
      ) : testCases.length === 0 ? (
        <div className="card p-12 flex flex-col items-center text-center text-gray-400">
          <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm font-medium text-gray-500">No test cases found</p>
          <p className="text-xs mt-1">
            {search || filterType || filterResult || filterAutoStatus || filterTestBy
              ? 'Try clearing your filters'
              : 'Generate test cases to get started'}
          </p>
          {!search && !filterType && !filterResult && !filterAutoStatus && !filterTestBy && (
            <button onClick={() => navigate("../generate")} className="mt-4 btn-primary text-sm">
              Generate Test Cases
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="sticky top-0 z-10 bg-gray-900 px-2 py-2.5 text-center w-9 flex-shrink-0">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  {COLS.map(col => (
                    <th
                      key={col.key}
                      style={{ minWidth: col.min }}
                      className="sticky top-0 z-10 bg-gray-900 px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-white"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {testCases.map((tc, i) => {
                  const rowBg = selectedIds.has(tc.id)
                    ? 'bg-blue-50/50'
                    : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';

                  // Effective test date: pakai testDate jika ada, fallback ke createdAt
                  const effectiveDate = tc.testDate
                    ? formatDate(tc.testDate)
                    : tc.createdAt
                      ? formatDate(tc.createdAt)
                      : '—';

                  return (
                    <tr key={tc.id} className={`${rowBg} hover:bg-blue-50/20`}>
                      {/* Checkbox */}
                      <td className="px-2 py-1.5 align-top text-center border-t border-gray-100">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedIds.has(tc.id)}
                          onChange={() => toggleSelect(tc.id)}
                        />
                      </td>

                      {/* Test Case ID */}
                      <Cell>
                        <span className="font-mono font-semibold text-blue-600">{tc.testCaseId}</span>
                      </Cell>

                      {/* Feature/Module — not editable via the modal; click to expand full text */}
                      <Cell
                        expanded={expandedRows.has(tc.id)}
                        onExpand={() => toggleExpand(tc.id)}
                      >
                        {tc.featureModule || '—'}
                      </Cell>

                      {/* Test Scenario — not editable via the modal; click to expand full text */}
                      <Cell
                        expanded={expandedRows.has(tc.id)}
                        onExpand={() => toggleExpand(tc.id)}
                      >
                        {tc.testScenario || '—'}
                      </Cell>

                      {/* Type — not editable via the modal, always short, no expand needed */}
                      <Cell>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[tc.type] || 'bg-gray-100 text-gray-600'}`}>
                          {tc.type}
                        </span>
                      </Cell>

                      {/* Precondition — not editable via the modal; click to expand full text */}
                      {!hiddenCols.has('precondition') && (
                        <Cell
                          expanded={expandedRows.has(tc.id)}
                          onExpand={() => toggleExpand(tc.id)}
                        >
                          {tc.precondition || '—'}
                        </Cell>
                      )}

                      {/* Action Step — not editable via the modal; click to expand full text */}
                      <Cell
                        expanded={expandedRows.has(tc.id)}
                        onExpand={() => toggleExpand(tc.id)}
                      >
                        {tc.actionStep || '—'}
                      </Cell>

                      {/* Test Data — not editable via the modal; click to expand full text */}
                      {!hiddenCols.has('testData') && (
                        <Cell
                          expanded={expandedRows.has(tc.id)}
                          onExpand={() => toggleExpand(tc.id)}
                        >
                          {tc.testData || '—'}
                        </Cell>
                      )}

                      {/* Expected Result — not editable via the modal; click to expand full text */}
                      <Cell
                        expanded={expandedRows.has(tc.id)}
                        onExpand={() => toggleExpand(tc.id)}
                      >
                        {tc.expectedResult || '—'}
                      </Cell>

                      {/* Actual Result — quick single-field modal */}
                      <Cell onClick={() => openQuickField(tc, 'actualResult')}>
                        {tc.actualResult ? (
                          tc.actualResult
                        ) : (
                          <span className="text-gray-300 hover:text-blue-500 italic text-xs flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Tambah
                          </span>
                        )}
                      </Cell>

                      {/* Testing Result — quick-edit dropdown */}
                      <td className="px-2 py-1.5 align-top border-t border-gray-100 whitespace-nowrap">
                        <select
                          className={`text-xs px-1.5 py-0.5 rounded font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400 ${RESULT_COLORS[tc.testingResult] || 'bg-gray-100 text-gray-600'}`}
                          value={tc.testingResult}
                          onChange={e => handleQuickStatusChange(tc.id, 'testingResult', e.target.value)}
                        >
                          {TESTING_RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>

                      {/* Automation Status — quick-edit dropdown */}
                      <td className="px-2 py-1.5 align-top border-t border-gray-100 whitespace-nowrap">
                        <select
                          className={`text-xs px-1.5 py-0.5 rounded font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400 ${AUTO_STATUS_COLORS[tc.automationStatus] || 'bg-gray-100 text-gray-600'}`}
                          value={tc.automationStatus}
                          onChange={e => handleQuickStatusChange(tc.id, 'automationStatus', e.target.value)}
                        >
                          {AUTOMATION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>

                      {/* Test Date — default ke createdAt, cuma readable via expand */}
                      {!hiddenCols.has('testDate') && (
                        <Cell
                          expanded={expandedRows.has(tc.id)}
                          onExpand={() => toggleExpand(tc.id)}
                        >
                          <span className={tc.testDate ? 'text-gray-700' : 'text-gray-400'}>
                            {effectiveDate}
                          </span>
                        </Cell>
                      )}

                      {/* Test By */}
                      {!hiddenCols.has('testBy') && (
                        <Cell
                          expanded={expandedRows.has(tc.id)}
                          onExpand={() => toggleExpand(tc.id)}
                        >
                          {tc.testBy || <span className="text-gray-400">—</span>}
                        </Cell>
                      )}

                      {/* Bug Note — quick single-field modal */}
                      {!hiddenCols.has('bugNote') && (
                        <Cell onClick={() => openQuickField(tc, 'bugNote')}>
                          {tc.bugNote ? (
                            tc.bugNote
                          ) : (
                            <span className="text-gray-300 hover:text-blue-500 italic text-xs flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Tambah
                            </span>
                          )}
                        </Cell>
                      )}

                      {/* Actions */}
                      <td className="px-2 py-1.5 align-top text-center border-t border-gray-100">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => startEdit(tc)}
                            className="p-1 rounded text-gray-400 hover:text-blue-500"
                            title="Edit"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteId(tc.id)}
                            className="p-1 rounded text-gray-400 hover:text-red-500"
                            title="Delete"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Modal — semua field */}
      {editingId && editingTc && (
        <EditModal
          tc={editingTc}
          editValues={editValues}
          onChange={setEditValues}
          onSave={() => saveEdit(editingId)}
          onCancel={cancelEdit}
          testers={testers}
        />
      )}

      {/* Quick Field Modal — Actual Result / Bug Note aja */}
      {quickField && (() => {
        const qfTc = testCases.find(tc => tc.id === quickField.id);
        if (!qfTc) return null;
        return (
          <QuickFieldModal
            tc={qfTc}
            label={quickField.field === 'actualResult' ? 'Actual Result' : 'Bug Note'}
            placeholder={quickField.field === 'actualResult' ? 'Apa yang terjadi saat test dijalankan…' : 'Bug ID, link Jira, catatan…'}
            value={quickField.value}
            onChange={v => setQuickField(prev => prev ? { ...prev, value: v } : prev)}
            onSave={saveQuickField}
            onCancel={() => setQuickField(null)}
            saving={quickFieldSaving}
          />
        );
      })()}

      {/* Add Test Case Modal */}
      {showAddModal && (
        <AddTestCaseModal
          values={addValues}
          onChange={setAddValues}
          onSave={handleAddTestCase}
          onCancel={() => setShowAddModal(false)}
          saving={addSaving}
        />
      )}

      {/* Delete single */}
      {deleteId && (
        <ConfirmModal
          title="Delete Test Case"
          message={`Delete test case "${testCases.find(tc => tc.id === deleteId)?.testCaseId}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          loading={deleteLoading}
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {/* Bulk delete */}
      {bulkDeleteConfirm && (
        <ConfirmModal
          title="Delete Selected Test Cases"
          message={`Delete ${selectedIds.size} selected test cases? This action cannot be undone.`}
          confirmLabel={`Delete ${selectedIds.size} Test Cases`}
          variant="danger"
          loading={deleteLoading}
          onConfirm={handleBulkDelete}
          onCancel={() => setBulkDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
