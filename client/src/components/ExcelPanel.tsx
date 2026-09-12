import React, { useState, useRef } from 'react';
import type { SheetInfo, ColumnMapping, TestCase } from '../types';
import { api } from '../services/api';

interface ExcelPanelProps {
  testCases: TestCase[];
  onToast: (type: 'success' | 'error' | 'info', title: string, msg?: string) => void;
}

type PanelState = 'idle' | 'uploading' | 'sheet-select' | 'mapping' | 'ready';

export function ExcelPanel({ testCases, onToast }: ExcelPanelProps) {
  const [state, setState] = useState<PanelState>('idle');
  const [fileId, setFileId] = useState('');
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const MAPPING_FIELDS: { key: keyof ColumnMapping; label: string }[] = [
    { key: 'testCaseId', label: 'Test Case ID' },
    { key: 'featureModule', label: 'Feature/Module' },
    { key: 'testScenario', label: 'Test Scenario' },
    { key: 'type', label: 'Type' },
    { key: 'precondition', label: 'Precondition' },
    { key: 'actionStep', label: 'Action Step' },
    { key: 'testData', label: 'Test Data' },
    { key: 'expectedResult', label: 'Expected Result' },
    { key: 'actualResult', label: 'Actual Result' },
    { key: 'testingResult', label: 'Testing Result' },
    { key: 'testDate', label: 'Test Date' },
    { key: 'testBy', label: 'Test By' },
    { key: 'bugNote', label: 'Bug Note' },
  ];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx')) {
      onToast('error', 'Invalid file', 'Only .xlsx files are accepted');
      return;
    }

    setState('uploading');
    try {
      const res = await api.importExcel(file);
      setFileId(res.fileId);
      setFileName(res.originalName);
      setSheets(res.sheets);
      setSelectedSheet(res.sheets[0]?.name || '');
      setState('sheet-select');
      onToast('success', 'File uploaded', `${res.sheets.length} sheet(s) found`);
    } catch (err) {
      onToast('error', 'Upload failed', (err as Error).message);
      setState('idle');
    }

    // Reset input
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSelectSheet = async () => {
    if (!selectedSheet) return;
    try {
      const res = await api.getColumnMapping(fileId, selectedSheet);
      setHeaders(res.headers);
      setMapping(res.mapping);
      setState('mapping');
    } catch (err) {
      onToast('error', 'Failed to read sheet', (err as Error).message);
    }
  };

  const handleAddToSpreadsheet = async () => {
    if (!fileId || !selectedSheet || testCases.length === 0) return;
    setAdding(true);
    try {
      const res = await api.addTestCasesToSheet(fileId, selectedSheet, testCases, mapping);
      onToast('success', `${res.added} test cases added`, `Last ID: ${res.lastId}`);
      setState('ready');
    } catch (err) {
      onToast('error', 'Failed to add test cases', (err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const handleDownload = () => {
    window.open(api.getExportUrl(fileId), '_blank');
  };

  const handleReset = () => {
    setState('idle');
    setFileId('');
    setFileName('');
    setSheets([]);
    setSelectedSheet('');
    setHeaders([]);
    setMapping({});
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-gray-800">Spreadsheet</h3>
        {state !== 'idle' && (
          <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-600">
            Reset
          </button>
        )}
      </div>

      {/* Idle: upload button */}
      {state === 'idle' && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleFileChange}
            id="excel-upload"
          />
          <label
            htmlFor="excel-upload"
            className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/30"
          >
            <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm text-gray-500">Import Excel (.xlsx)</span>
            <span className="text-xs text-gray-400">Click to upload or drop file here</span>
          </label>
        </div>
      )}

      {/* Uploading */}
      {state === 'uploading' && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4 justify-center">
          <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Uploading...
        </div>
      )}

      {/* Sheet select */}
      {state === 'sheet-select' && (
        <div className="space-y-3">
          <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
            <span className="font-medium text-gray-700">{fileName}</span>
            <span className="ml-2">· {sheets.length} sheet(s)</span>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
              Select Sheet
            </label>
            <select
              className="input-field"
              value={selectedSheet}
              onChange={e => setSelectedSheet(e.target.value)}
            >
              {sheets.map(s => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.rowCount} rows, {s.columnCount} cols)
                </option>
              ))}
            </select>
          </div>
          <button onClick={handleSelectSheet} className="btn-primary w-full text-sm">
            Use This Sheet
          </button>
        </div>
      )}

      {/* Column mapping */}
      {(state === 'mapping' || state === 'ready') && (
        <div className="space-y-3">
          <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
            <span className="font-medium text-gray-700">{fileName}</span>
            <span className="text-blue-600 ml-1">→ {selectedSheet}</span>
            {state === 'ready' && (
              <span className="ml-2 text-green-600 font-medium">✓ Added</span>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Column Mapping</p>
            <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 max-h-48 overflow-y-auto">
              {MAPPING_FIELDS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-28 flex-shrink-0">{label}</span>
                  <span className="text-gray-400 text-xs">→</span>
                  <select
                    className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={mapping[key] || ''}
                    onChange={e => setMapping(prev => ({ ...prev, [key]: e.target.value || undefined }))}
                  >
                    <option value="">— skip —</option>
                    {headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAddToSpreadsheet}
              disabled={adding || testCases.length === 0}
              className="btn-primary flex-1 text-sm"
            >
              {adding ? 'Adding...' : `Add ${testCases.length} Test Cases`}
            </button>
            {state === 'ready' && (
              <button
                onClick={handleDownload}
                className="btn-secondary px-3"
                title="Download Excel"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
