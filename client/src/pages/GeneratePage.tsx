import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { GenerateForm } from '../components/GenerateForm';
import { GeneratingProgress } from '../components/GeneratingProgress';
import { TestCaseTable } from '../components/TestCaseTable';
import { api } from '../services/api';
import { useProjectScopeContext } from '../hooks/useAppShellContext';
import type { GeneratedTestCase, GenerateInput, Page } from '../types';

export function GeneratePage() {
  const { projects, activeProject: routeProject, onCreateProject, onToast } = useProjectScopeContext();
  const activeProjectId = routeProject.id;
  const navigate = useNavigate();

  const [pages, setPages] = useState<Page[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generatingFeature, setGeneratingFeature] = useState<string>('');
  const resultsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeProjectId) return;
    api.getPages(activeProjectId)
      .then(res => setPages(res.pages))
      .catch(() => setPages([]));
  }, [activeProjectId]);

  const [testCases, setTestCases] = useState<GeneratedTestCase[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastInput, setLastInput] = useState<GenerateInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);

  const handleGenerate = useCallback(async (input: GenerateInput) => {
    setGenerating(true);
    setGeneratingFeature(input.feature);
    setSelectedIds(new Set());
    try {
      const activeProject = projects.find(p => p.id === (input.projectId || activeProjectId));
      const enrichedInput: GenerateInput = activeProject?.projectUrl
        ? { ...input, projectUrl: activeProject.projectUrl }
        : input;
      const res = await api.generateTestCases(enrichedInput);
      if (!res.success || !res.testCases?.length) {
        onToast('error', 'Generation failed', res.error || 'No test cases returned');
        if (res.hint) {
          onToast('info', 'Hint', res.hint);
        }
        return;
      }
      setTestCases(res.testCases);
      setHasGenerated(true);
      setLastInput(input);
      setSelectedIds(new Set(res.testCases.map(tc => tc.tempId)));
      onToast('success', `${res.count} test cases generated`, 'Review, edit, then Save Selected or Save All');
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    } catch (err) {
      const msg = (err as Error).message;
      onToast('error', 'Generation failed', msg);
    } finally {
      setGenerating(false);
    }
  }, [projects, activeProjectId, onToast]);

  const handleSave = useCallback(async (mode: 'selected' | 'all') => {
    const toSave = mode === 'selected'
      ? testCases.filter(tc => selectedIds.has(tc.tempId))
      : testCases;

    if (toSave.length === 0) {
      onToast('warning', 'Nothing to save', mode === 'selected' ? 'Select at least one test case' : 'No test cases');
      return;
    }

    const projectId = lastInput?.projectId || activeProjectId;
    if (!projectId) {
      onToast('error', 'No project selected', 'Please select a project before saving');
      return;
    }

    setSaving(true);
    try {
      const res = await api.saveTestCases(projectId, {
        feature: lastInput?.feature || 'Unknown Feature',
        description: lastInput?.description,
        userFlow: lastInput?.userFlow,
        expectedResult: lastInput?.expectedResult,
        role: lastInput?.role,
        testedBy: lastInput?.testedBy,
        testCases: toSave.map(tc => ({
          featureModule: tc.featureModule,
          testScenario: tc.testScenario,
          type: tc.type,
          precondition: tc.precondition,
          actionStep: tc.actionStep,
          testData: tc.testData,
          expectedResult: tc.expectedResult,
          testBy: lastInput?.testedBy,
        })),
      });

      setSavedProjectId(projectId);
      onToast('success', `${res.saved} test case${res.saved !== 1 ? 's' : ''} saved`, 'View in Test Cases page');
    } catch (err) {
      onToast('error', 'Failed to save test cases', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [testCases, selectedIds, lastInput, activeProjectId, onToast]);

  const handleExportGenerated = useCallback(async () => {
    if (!testCases.length) return;
    setExporting(true);
    try {
      const tcForExport = testCases.map((tc, i) => ({
        id: `temp-${i}`,
        testCaseId: tc.tempId,
        featureModule: tc.featureModule,
        testScenario: tc.testScenario,
        type: tc.type,
        precondition: tc.precondition,
        actionStep: tc.actionStep,
        testData: tc.testData,
        expectedResult: tc.expectedResult,
        actualResult: '',
        testingResult: 'Not Tested',
        testDate: '',
        testBy: lastInput?.testedBy || '',
        bugNote: '',
        automationStatus: 'Not Automated',
      }));

      const blob = await api.exportNew(tcForExport as never, 'QA-Test-Cases');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'QA-Test-Cases.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onToast('success', 'Excel exported', 'QA-Test-Cases.xlsx downloaded');
    } catch (err) {
      onToast('error', 'Export failed', (err as Error).message);
    } finally {
      setExporting(false);
    }
  }, [testCases, lastInput, onToast]);

  const activeProject = projects.find(p => p.id === (lastInput?.projectId || activeProjectId));

  return (
    <div className="space-y-5">
      {/* Header Card */}
      <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#f0fbfa] border border-[#b0ece8] flex items-center justify-center text-[#089e9a] flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-900">Generate Test Case</h2>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#e6f9f8] text-[#06807d] border border-[#b0ece8]">
                {routeProject.name}
              </span>
              {pages.length > 0 && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {pages.length} Halaman Tersedia
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Pilih halaman hasil scan atau lengkapi detail fitur di bawah untuk menghasilkan skenario test case secara otomatis dengan AI.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => navigate(`/projects/${routeProject.slug}`)}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            Pages &amp; Scan
          </button>
          <button
            type="button"
            onClick={() => navigate(`/projects/${routeProject.slug}/test-cases`)}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Lihat Test Cases
          </button>
        </div>
      </div>

      {/* Wide Generate Form Card */}
      <div className="card p-5">
        <GenerateForm
          onGenerate={handleGenerate}
          loading={generating}
          projects={projects}
          pages={pages}
          activeProjectId={activeProjectId}
          onCreateProject={onCreateProject}
        />
      </div>

      {/* Popup Modal Loading Progress */}
      <GeneratingProgress visible={generating} featureName={generatingFeature} />

      {/* Results Section */}
      <div ref={resultsRef}>
        {hasGenerated && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <h2 className="text-sm font-semibold text-gray-800">Generated Test Cases</h2>
                <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  {testCases.length}
                </span>
                {activeProject && (
                  <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                    {activeProject.name}
                  </span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleExportGenerated}
                  disabled={exporting || testCases.length === 0}
                  className="btn-secondary text-xs flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {exporting ? 'Exporting...' : 'Export XLSX'}
                </button>
                <button
                  onClick={() => handleSave('selected')}
                  disabled={saving || selectedIds.size === 0}
                  className="btn-secondary text-xs flex items-center gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save Selected ({selectedIds.size})
                </button>
                <button
                  onClick={() => handleSave('all')}
                  disabled={saving || testCases.length === 0}
                  className="btn-primary text-xs flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  {saving ? 'Saving...' : `Save All (${testCases.length})`}
                </button>
              </div>
            </div>

            {!(lastInput?.projectId || activeProjectId) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3 text-xs text-yellow-800">
                No project selected. Test cases will not be saved to a project.
              </div>
            )}

            <TestCaseTable
              testCases={testCases}
              onChange={setTestCases}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
            />

            {/* Post-save prompt */}
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Setelah disimpan, kelola seluruh test case di halaman
              <button
                onClick={() => {
                  const proj = projects.find(p => p.id === (savedProjectId || activeProjectId));
                  if (proj) navigate(`/projects/${proj.slug}/test-cases`);
                }}
                className="text-blue-600 hover:underline font-medium"
              >
                Test Cases
              </button>
              .
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
