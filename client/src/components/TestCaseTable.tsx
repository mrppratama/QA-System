import React, { useState } from 'react';
import type { GeneratedTestCase } from '../types';
import { TEST_CASE_TYPES } from '../types';

interface TestCaseTableProps {
  testCases: GeneratedTestCase[];
  onChange: (testCases: GeneratedTestCase[]) => void;
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
}

const TYPE_COLORS: Record<string, string> = {
  'Happy Path':          'bg-green-100 text-green-700',
  'Validation':          'bg-blue-100 text-blue-700',
  'Error Case':          'bg-red-100 text-red-700',
  'Important Edge Case': 'bg-amber-100 text-amber-700',
  'Important edge case': 'bg-amber-100 text-amber-700',
};

const RESULT_COLORS: Record<string, string> = {
  'Not Tested': 'bg-gray-100 text-gray-500',
  Passed: 'bg-green-100 text-green-700',
  Failed: 'bg-red-100 text-red-700',
  Blocked: 'bg-yellow-100 text-yellow-700',
};

function getTypeColor(type: string): string {
  return TYPE_COLORS[type] || 'bg-gray-100 text-gray-600';
}

function getResultColor(result: string): string {
  return RESULT_COLORS[result] || 'bg-gray-100 text-gray-500';
}

// ── Edit Modal ───────────────────────────────────────────────────────────────
interface EditModalProps {
  tc: GeneratedTestCase;
  index: number;
  onSave: (index: number, updated: GeneratedTestCase) => void;
  onDelete: (index: number) => void;
  onClose: () => void;
}

function EditModal({ tc, index, onSave, onDelete, onClose }: EditModalProps) {
  const [form, setForm] = useState<GeneratedTestCase>({ ...tc });

  const set = (field: keyof GeneratedTestCase) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-4">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Edit Test Case</h3>
            <p className="text-xs text-gray-400 mt-0.5 font-mono">{tc.tempId}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Feature / Module</label>
              <input className="input-field" value={form.featureModule} onChange={set('featureModule')} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Type</label>
              <select className="input-field" value={form.type} onChange={set('type')}>
                {TEST_CASE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Test Scenario</label>
            <textarea className="input-field" rows={2} value={form.testScenario} onChange={set('testScenario')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Precondition</label>
            <textarea className="input-field" rows={2} value={form.precondition} onChange={set('precondition')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Action Step</label>
            <textarea className="input-field" rows={4} value={form.actionStep} onChange={set('actionStep')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Test Data</label>
              <textarea className="input-field" rows={2} value={form.testData} onChange={set('testData')} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Expected Result</label>
              <textarea className="input-field" rows={2} value={form.expectedResult} onChange={set('expectedResult')} />
            </div>
          </div>

          <hr className="border-gray-100" />
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Hasil Testing — isi manual</p>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Actual Result</label>
            <textarea className="input-field" rows={2} placeholder="Apa yang terjadi saat test dijalankan..." value={form.actualResult ?? ''} onChange={set('actualResult')} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Testing Result</label>
              <select className="input-field" value={form.testingResult ?? 'Not Tested'} onChange={set('testingResult')}>
                <option value="Not Tested">Not Tested</option>
                <option value="Passed">Passed</option>
                <option value="Failed">Failed</option>
                <option value="Blocked">Blocked</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Test Date</label>
              <input type="date" className="input-field" value={form.testDate ?? ''} onChange={set('testDate')} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Test By</label>
              <input className="input-field" placeholder="Nama tester" value={form.testBy ?? ''} onChange={set('testBy')} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">Bug Note</label>
            <textarea className="input-field" rows={2} placeholder="Bug ID, link Jira, catatan..." value={form.bugNote ?? ''} onChange={set('bugNote')} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={() => { onDelete(index); onClose(); }}
            className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Hapus baris ini
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm px-4">Batal</button>
            <button onClick={() => { onSave(index, form); onClose(); }} className="btn-primary text-sm px-4">Simpan</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Table ────────────────────────────────────────────────────────────────
export function TestCaseTable({ testCases, onChange, selectedIds, onSelectionChange }: TestCaseTableProps) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const allSelected = testCases.length > 0 && selectedIds.size === testCases.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < testCases.length;

  const toggleSelectAll = () => {
    if (allSelected) onSelectionChange(new Set());
    else onSelectionChange(new Set(testCases.map(tc => tc.tempId)));
  };

  const toggleSelect = (tempId: string) => {
    const next = new Set(selectedIds);
    if (next.has(tempId)) next.delete(tempId); else next.add(tempId);
    onSelectionChange(next);
  };

  const saveRow = (index: number, updated: GeneratedTestCase) => {
    const arr = [...testCases];
    arr[index] = updated;
    onChange(arr);
  };

  const deleteRow = (index: number) => {
    const tc = testCases[index];
    const next = new Set(selectedIds);
    next.delete(tc.tempId);
    onSelectionChange(next);
    onChange(testCases.filter((_, i) => i !== index));
  };

  const addRow = () => {
    const lastNum = testCases.length > 0
      ? parseInt(testCases[testCases.length - 1].tempId.replace(/\D/g, ''), 10) : 0;
    onChange([...testCases, {
      tempId: `TC${String(lastNum + 1).padStart(3, '0')}`,
      featureModule: testCases[0]?.featureModule || '',
      testScenario: '', type: 'Happy Path', precondition: '',
      actionStep: '', testData: '-', expectedResult: '',
      actualResult: '', testingResult: 'Not Tested',
      testDate: '', testBy: '', bugNote: '',
    }]);
  };

  const THEAD = [
    { label: 'Test Case ID',    w: 80  },
    { label: 'Feature/Module',  w: 130 },
    { label: 'Test Scenario',   w: 200 },
    { label: 'Type',            w: 90  },
    { label: 'Precondition',    w: 150 },
    { label: 'Action Step',     w: 200 },
    { label: 'Test Data',       w: 120 },
    { label: 'Expected Result', w: 160 },
    { label: 'Actual Result',   w: 150, manual: true },
    { label: 'Testing Result',  w: 110, manual: true },
    { label: 'Test Date',       w: 95,  manual: true },
    { label: 'Test By',         w: 90,  manual: true },
    { label: 'Bug Note',        w: 150, manual: true },
    { label: '',                w: 36  },
  ];
  const totalWidth = 36 + THEAD.reduce((s, h) => s + h.w, 0); // 36 = checkbox col

  // Cell content wrapper: fixed height with scroll so columns don't expand with text
  const CellContent = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`max-h-16 overflow-y-auto text-xs leading-relaxed ${className}`}>{children}</div>
  );

  const tdBase = 'px-2 py-1.5 align-top border-t border-gray-100 overflow-hidden';
  const tdManual = tdBase + ' bg-amber-50/60';

  return (
    <div className="space-y-2">
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-md">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {selectedIds.size} of {testCases.length} selected
          <button onClick={() => onSelectionChange(new Set())} className="ml-auto text-blue-500 hover:text-blue-700">Clear</button>
        </div>
      )}

      {/* Scrollable table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table style={{ width: totalWidth, minWidth: totalWidth, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 36 }} />
            {THEAD.map((h, i) => <col key={i} style={{ width: h.w }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="px-2 py-2.5 text-center bg-gray-900">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleSelectAll}
                />
              </th>
              {THEAD.map((h, i) => (
                <th
                  key={i}
                  className={`px-2 py-2.5 text-left text-xs font-medium whitespace-nowrap ${h.manual ? 'bg-gray-800 text-gray-300' : 'bg-gray-900 text-white'}`}
                >
                  {h.label}
                  {h.manual && <span className="ml-1 text-gray-500 text-[10px] font-normal">manual</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {testCases.map((tc, i) => {
              const isSelected = selectedIds.has(tc.tempId);
              const rowClass = isSelected ? 'bg-blue-50/60' : i % 2 === 0 ? '' : 'bg-gray-50/40';
              return (
                <tr
                  key={tc.tempId}
                  className={`${rowClass} hover:bg-blue-50/30 cursor-pointer`}
                  onClick={() => setEditingIdx(i)}
                >
                  {/* Checkbox */}
                  <td
                    className="px-2 py-2 align-top text-center border-t border-gray-100"
                    onClick={e => e.stopPropagation()}
                  >
                    <input type="checkbox" className="rounded" checked={isSelected} onChange={() => toggleSelect(tc.tempId)} />
                  </td>

                   {/* Test Case ID */}
                  <td className={tdBase}>
                    <CellContent><span className="font-mono font-semibold text-blue-600">{tc.tempId}</span></CellContent>
                  </td>

                  {/* Feature/Module */}
                  <td className={tdBase}><CellContent className="text-gray-700">{tc.featureModule || '—'}</CellContent></td>

                  {/* Test Scenario */}
                  <td className={tdBase}><CellContent className="text-gray-700">{tc.testScenario || '—'}</CellContent></td>

                  {/* Type */}
                  <td className={tdBase}>
                    <CellContent>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${getTypeColor(tc.type)}`}>
                        {tc.type}
                      </span>
                    </CellContent>
                  </td>

                  {/* Precondition */}
                  <td className={tdBase}><CellContent className="text-gray-700">{tc.precondition || '—'}</CellContent></td>

                  {/* Action Step */}
                  <td className={tdBase}><CellContent className="text-gray-700">{tc.actionStep || '—'}</CellContent></td>

                  {/* Test Data */}
                  <td className={tdBase}><CellContent className="text-gray-700">{tc.testData || '—'}</CellContent></td>

                  {/* Expected Result */}
                  <td className={tdBase}><CellContent className="text-gray-700">{tc.expectedResult || '—'}</CellContent></td>

                  {/* Actual Result — manual */}
                  <td className={tdManual}>
                    <CellContent className="text-gray-700">
                      {tc.actualResult || <span className="text-gray-300 italic text-xs">klik untuk isi</span>}
                    </CellContent>
                  </td>

                  {/* Testing Result — manual */}
                  <td className={tdManual}>
                    <CellContent>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${getResultColor(tc.testingResult ?? 'Not Tested')}`}>
                        {tc.testingResult || 'Not Tested'}
                      </span>
                    </CellContent>
                  </td>

                  {/* Test Date — manual */}
                  <td className={tdManual}>
                    <CellContent className="text-gray-700">
                      {tc.testDate
                        ? new Date(tc.testDate).toLocaleDateString('id-ID')
                        : <span className="text-gray-300 italic text-xs">—</span>}
                    </CellContent>
                  </td>

                  {/* Test By — manual */}
                  <td className={tdManual}>
                    <CellContent className="text-gray-700">
                      {tc.testBy || <span className="text-gray-300 italic text-xs">—</span>}
                    </CellContent>
                  </td>

                  {/* Bug Note — manual */}
                  <td className={tdManual}>
                    <CellContent className="text-gray-700">
                      {tc.bugNote || <span className="text-gray-300 italic text-xs">klik untuk isi</span>}
                    </CellContent>
                  </td>

                  {/* Delete */}
                  <td
                    className="px-2 py-2 align-top text-center border-t border-gray-100"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => deleteRow(i)}
                      className="text-gray-300 hover:text-red-500 p-1"
                      title="Hapus"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        onClick={addRow}
        className="w-full py-2 border border-dashed border-gray-300 text-gray-500 text-xs rounded-md hover:border-blue-400 hover:text-blue-500"
      >
        + Add Row
      </button>

      {editingIdx !== null && (
        <EditModal
          tc={testCases[editingIdx]}
          index={editingIdx}
          onSave={saveRow}
          onDelete={deleteRow}
          onClose={() => setEditingIdx(null)}
        />
      )}
    </div>
  );
}
