import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { TestCase, Project } from '../types';
import { TESTING_RESULTS, AUTOMATION_STATUSES, TEST_CASE_TYPES } from '../types';
import { api } from '../services/api';
import { ConfirmModal } from '../components/ConfirmModal';

// ── Edit Modal ────────────────────────────────────────────────────────────────
interface EditModalProps {
  tc: TestCase;
  editValues: Partial<TestCase>;
  onChange: (values: Partial<TestCase>) => void;
  onSave: () => void;
  onCancel: () => void;
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

function StyledInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="w-full px-3 py-2.5 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg
                 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white
                 placeholder-gray-300 transition"
    />
  );
}

function EditModal({ tc, editValues, onChange, onSave, onCancel }: EditModalProps) {
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
            <h3 className="text-base font-semibold text-gray-900">Update Hasil Testing</h3>
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
                placeholder="Nama tester"
                value={editValues.testBy || ''}
                onChange={set('testBy')}
              />
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
function Cell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <td className="px-2 py-1.5 align-top border-t border-gray-100">
      <div className={`max-h-16 overflow-y-auto text-xs leading-relaxed text-gray-700 ${className}`}>
        {children}
      </div>
    </td>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
interface TestCasesPageProps {
  activeProject: Project | null;
  onToast: (type: 'success' | 'error' | 'info', title: string, msg?: string) => void;
  onNavigateToGenerate: () => void;
}

export function TestCasesPage({ activeProject, onToast, onNavigateToGenerate }: TestCasesPageProps) {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterResult, setFilterResult] = useState('');
  const [filterAutoStatus, setFilterAutoStatus] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<TestCase>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

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
  }, [activeProject, debouncedSearch, filterType, filterResult, filterAutoStatus, onToast]);

  useEffect(() => {
    loadTestCases();
    return () => inFlightRef.current?.abort();
  }, [loadTestCases]);

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

  // Kolom dengan min-width; lebar akhir tetap auto mengikuti konten terlebar
  const COLS: { label: string; min: number }[] = [
    { label: 'Test Case ID',    min: 90  },
    { label: 'Feature/Module',  min: 130 },
    { label: 'Test Scenario',   min: 220 },
    { label: 'Type',            min: 90  },
    { label: 'Precondition',    min: 180 },
    { label: 'Action Step',     min: 220 },
    { label: 'Test Data',       min: 110 },
    { label: 'Expected Result', min: 200 },
    { label: 'Actual Result',   min: 190 },
    { label: 'Testing Result',  min: 110 },
    { label: 'Test Date',       min: 95  },
    { label: 'Test By',         min: 85  },
    { label: 'Bug Note',        min: 200 },
    { label: 'Actions',         min: 64  },
  ];

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
            onClick={onNavigateToGenerate}
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
            {search || filterType || filterResult || filterAutoStatus
              ? 'Try clearing your filters'
              : 'Generate test cases to get started'}
          </p>
          {!search && !filterType && !filterResult && !filterAutoStatus && (
            <button onClick={onNavigateToGenerate} className="mt-4 btn-primary text-sm">
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
                  <th className="px-2 py-2.5 text-center w-9 flex-shrink-0">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  {COLS.map((col, i) => (
                    <th
                      key={i}
                      style={{ minWidth: col.min }}
                      className="px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap text-white"
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

                      {/* Feature/Module */}
                      <Cell>{tc.featureModule || '—'}</Cell>

                      {/* Test Scenario */}
                      <Cell>{tc.testScenario || '—'}</Cell>

                      {/* Type */}
                      <Cell>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[tc.type] || 'bg-gray-100 text-gray-600'}`}>
                          {tc.type}
                        </span>
                      </Cell>

                      {/* Precondition */}
                      <Cell>{tc.precondition || '—'}</Cell>

                      {/* Action Step */}
                      <Cell>{tc.actionStep || '—'}</Cell>

                      {/* Test Data */}
                      <Cell>{tc.testData || '—'}</Cell>

                      {/* Expected Result */}
                      <Cell>{tc.expectedResult || '—'}</Cell>

                      {/* Actual Result */}
                      <Cell>
                        {tc.actualResult ? (
                          tc.actualResult
                        ) : (
                          <button
                            onClick={() => startEdit(tc)}
                            className="text-gray-300 hover:text-blue-500 italic text-xs flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Tambah
                          </button>
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

                      {/* Test Date — default ke createdAt */}
                      <Cell>
                        <span className={tc.testDate ? 'text-gray-700' : 'text-gray-400'}>
                          {effectiveDate}
                        </span>
                      </Cell>

                      {/* Test By */}
                      <Cell>
                        {tc.testBy || <span className="text-gray-400">—</span>}
                      </Cell>

                      {/* Bug Note */}
                      <Cell>
                        {tc.bugNote ? (
                          tc.bugNote
                        ) : (
                          <button
                            onClick={() => startEdit(tc)}
                            className="text-gray-300 hover:text-blue-500 italic text-xs flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Tambah
                          </button>
                        )}
                      </Cell>

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

      {/* Edit Modal */}
      {editingId && editingTc && (
        <EditModal
          tc={editingTc}
          editValues={editValues}
          onChange={setEditValues}
          onSave={() => saveEdit(editingId)}
          onCancel={cancelEdit}
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
