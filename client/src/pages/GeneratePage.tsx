import React, { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GenerateForm } from '../components/GenerateForm';
import { GeneratingProgress } from '../components/GeneratingProgress';
import { TestCaseTable } from '../components/TestCaseTable';
import { api } from '../services/api';
import { useProjectScopeContext } from '../hooks/useAppShellContext';
import type { GeneratedTestCase, GenerateInput } from '../types';

export function GeneratePage() {
  const { projects, onCreateProject, onToast } = useProjectScopeContext();
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const activeProjectId = routeProjectId!;
  const navigate = useNavigate();

  const [generating, setGenerating] = useState(false);
  const [testCases, setTestCases] = useState<GeneratedTestCase[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastInput, setLastInput] = useState<GenerateInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);

  const handleGenerate = useCallback(async (input: GenerateInput) => {
    setGenerating(true);
    setSelectedIds(new Set());
    try {
      // Auto-inject projectUrl if active project has one
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
      // Select all by default
      setSelectedIds(new Set(res.testCases.map(tc => tc.tempId)));
      onToast('success', `${res.count} test cases generated`, 'Review, edit, then Save Selected or Save All');
    } catch (err) {
      const msg = (err as Error).message;
      onToast('error', 'Generation failed', msg);
    } finally {
      setGenerating(false);
    }
  }, [onToast]);

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
      // Convert GeneratedTestCase to TestCase format for export
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Generate Form */}
      <div className="lg:col-span-1">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Generate Test Cases</h2>
          <GenerateForm
            onGenerate={handleGenerate}
            loading={generating}
            projects={projects}
            activeProjectId={activeProjectId}
            onCreateProject={onCreateProject}
          />
        </div>
      </div>

      {/* Right: Results */}
      <div className="lg:col-span-2 space-y-4">
        {/* Progress */}
        <GeneratingProgress visible={generating} />

        {/* Results */}
        {hasGenerated && !generating && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              After saving, view and manage all test cases in the
              <button
                onClick={() => navigate(`/projects/${savedProjectId || activeProjectId}/test-cases`)}
                className="text-blue-600 hover:underline font-medium"
              >
                Test Cases
              </button>
              page.
            </div>
          </div>
        )}

        {/* Empty state */}
        {!hasGenerated && !generating && (
          <div className="card p-12 flex flex-col items-center text-center text-gray-400">
            <svg className="w-16 h-16 mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm font-medium text-gray-500">No test cases yet</p>
            <p className="text-xs mt-1 text-gray-400">Fill in the form on the left and click Generate</p>
            <p className="text-xs mt-1 text-gray-400">Powered by 9Router AI</p>
          </div>
        )}
      </div>
    </div>
  );
}
