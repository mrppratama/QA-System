import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AutomationScript, AutomationRunSummary, Page } from '../types';
import { api } from '../services/api';
import { ConfirmModal } from '../components/ConfirmModal';
import { useProjectScopeContext } from '../hooks/useAppShellContext';

interface FeatureGroup {
  featureModule: string;
  count: number;
  selected: boolean;
}

function countPageElements(raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function AutomationPage() {
  const { activeProject, onToast } = useProjectScopeContext();
  const { scriptId } = useParams<{ scriptId?: string }>();
  const navigate = useNavigate();
  const automationBasePath = `/projects/${activeProject.slug}/automation`;

  const [scripts, setScripts] = useState<AutomationScript[]>([]);
  const [features, setFeatures] = useState<FeatureGroup[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(false);

  // Live Browser Preview ON by default (just like page scraping)
  const [showBrowser, setShowBrowser] = useState<boolean>(true);
  const [runningFeatureKey, setRunningFeatureKey] = useState<string | null>(null);
  const [runningScriptId, setRunningScriptId] = useState<string | null>(null);

  // Optional code editor state when user clicks "Lihat Script"
  const [editedScript, setEditedScript] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [runReport, setRunReport] = useState<{
    scriptId: string;
    scriptName: string;
    summary: AutomationRunSummary;
    updatedTestCaseCount: number;
  } | null>(null);

  const view: 'runner' | 'editor' = scriptId ? 'editor' : 'runner';
  const activeScript = scriptId ? scripts.find(s => s.id === scriptId) ?? null : null;

  // Fetch full script content when opening editor
  useEffect(() => {
    if (!scriptId) return;
    const found = scripts.find(s => s.id === scriptId);
    if (found && typeof found.script === 'string') {
      setEditedScript(found.script);
      return;
    }
    api.getAutomationScript(scriptId)
      .then(res => {
        setScripts(prev => {
          const exists = prev.some(s => s.id === res.script.id);
          return exists ? prev.map(s => s.id === res.script.id ? res.script : s) : [res.script, ...prev];
        });
        setEditedScript(res.script.script || '');
      })
      .catch(err => onToast('error', 'Gagal memuat script', (err as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId]);

  const loadData = useCallback(async () => {
    if (!activeProject) return;
    setLoading(true);
    try {
      const [scriptRes, featRes, pageRes] = await Promise.all([
        api.getAutomationScripts(activeProject.id),
        api.getAutomationFeatures(activeProject.id),
        api.getPages(activeProject.id),
      ]);
      setScripts(scriptRes.scripts);
      setFeatures(featRes.features.map(f => ({ ...f, selected: false })));
      setPages(pageRes.pages);
    } catch (err) {
      onToast('error', 'Gagal memuat data automation', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeProject, onToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Match a featureModule name to its scraped Page record
  const findMatchingPage = useCallback((featureName: string): Page | undefined => {
    const fn = featureName.toLowerCase().trim();
    return pages.find(p => {
      const pn = p.name.toLowerCase().trim();
      const pp = p.path.replace(/^\/+/, '').toLowerCase().trim();
      return fn === pn || (pn.length >= 3 && (fn.includes(pn) || pn.includes(fn))) || (pp.length >= 3 && fn === pp);
    });
  }, [pages]);

  // Find existing Playwright script for a feature
  const findFeatureScript = useCallback((featureName: string): AutomationScript | undefined => {
    const targetName = `${featureName} Tests`.toLowerCase();
    return scripts.find(s => s.name.toLowerCase() === targetName);
  }, [scripts]);

  const selectedFeatures = features.filter(f => f.selected);
  const totalSelectedTestCases = selectedFeatures.reduce((sum, f) => sum + f.count, 0);

  const toggleFeature = (idx: number) => {
    setFeatures(prev => prev.map((f, i) => i === idx ? { ...f, selected: !f.selected } : f));
  };

  const toggleAllFeatures = () => {
    const allSelected = features.every(f => f.selected);
    setFeatures(prev => prev.map(f => ({ ...f, selected: !allSelected })));
  };

  // Directly run automation for one or more features using Playwright + Live Preview
  const handleRunFeatureAutomation = async (
    targetFeatureNames: string[],
    options?: { forceRegenerate?: boolean; key?: string }
  ) => {
    if (!activeProject || targetFeatureNames.length === 0) return;
    const runKey = options?.key || targetFeatureNames.join(',');
    setRunningFeatureKey(runKey);
    try {
      const matchedPage = targetFeatureNames.length === 1 ? findMatchingPage(targetFeatureNames[0]) : undefined;
      const testedBy = localStorage.getItem('qa_tested_by') || undefined;

      const res = await api.runDirectAutomation({
        projectId: activeProject.id,
        featureModules: targetFeatureNames,
        pageId: matchedPage?.id,
        headless: !showBrowser,
        forceRegenerate: options?.forceRegenerate ?? false,
        testedBy,
      });

      setScripts(prev => {
        const exists = prev.some(s => s.id === res.script.id);
        return exists ? prev.map(s => s.id === res.script.id ? res.script : s) : [res.script, ...prev];
      });

      setRunReport({
        scriptId: res.script.id,
        scriptName: res.script.name,
        summary: res.summary,
        updatedTestCaseCount: res.updatedTestCaseCount,
      });

      const { passed, failed, total } = res.summary;
      if (failed === 0) {
        onToast(
          'success',
          `Semua test Passed (${passed}/${total})`,
          `${res.updatedTestCaseCount} test case otomatis di-update ke Passed`
        );
      } else {
        onToast(
          'warning',
          `Run selesai: ${passed} Passed, ${failed} Failed`,
          `${res.updatedTestCaseCount} test case otomatis di-update beserta dokumentasi bug`
        );
      }
    } catch (err) {
      onToast('error', 'Gagal menjalankan Playwright Automation', (err as Error).message);
    } finally {
      setRunningFeatureKey(null);
    }
  };

  const handleRunExistingScript = async (targetScript: AutomationScript, overrideCode?: string) => {
    setRunningScriptId(targetScript.id);
    try {
      const testedBy = localStorage.getItem('qa_tested_by') || undefined;
      const res = await api.runAutomationScript(targetScript.id, {
        headless: !showBrowser,
        ...(overrideCode !== undefined ? { script: overrideCode } : {}),
        testedBy,
      });
      setScripts(prev => prev.map(s => s.id === targetScript.id ? res.script : s));
      setRunReport({
        scriptId: targetScript.id,
        scriptName: targetScript.name,
        summary: res.summary,
        updatedTestCaseCount: res.updatedTestCaseCount,
      });

      const { passed, failed, total } = res.summary;
      if (failed === 0) {
        onToast(
          'success',
          `Semua test Passed (${passed}/${total})`,
          `${res.updatedTestCaseCount} test case otomatis di-update ke Passed`
        );
      } else {
        onToast(
          'warning',
          `Run selesai: ${passed} Passed, ${failed} Failed`,
          `${res.updatedTestCaseCount} test case otomatis di-update statusnya`
        );
      }
    } catch (err) {
      onToast('error', 'Gagal menjalankan automation', (err as Error).message);
    } finally {
      setRunningScriptId(null);
    }
  };

  const handleSaveScript = async () => {
    if (!activeScript) return;
    setSaving(true);
    try {
      const res = await api.updateAutomationScript(activeScript.id, { script: editedScript, name: activeScript.name });
      setScripts(prev => prev.map(s => s.id === activeScript.id ? res.script : s));
      onToast('success', 'Script disimpan');
    } catch (err) {
      onToast('error', 'Gagal menyimpan script', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      const res = await api.deleteAutomationScript(deleteId);
      setScripts(prev => prev.filter(s => s.id !== deleteId));
      if (activeScript?.id === deleteId) {
        navigate(automationBasePath);
      }
      setDeleteId(null);
      const count = res.updatedTestCaseCount;
      onToast(
        'success',
        'Runner script dihapus',
        typeof count === 'number' && count > 0 ? `${count} test case dikembalikan ke Not Automated` : undefined
      );
    } catch (err) {
      onToast('error', 'Gagal menghapus script', (err as Error).message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const isAnyRunning = runningFeatureKey !== null || runningScriptId !== null;

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#f0fbfa] border border-[#b0ece8] flex items-center justify-center text-[#089e9a]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">Playwright Live Automation Runner</h2>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#e6f9f8] text-[#06807d] border border-[#b0ece8]">
                Playwright Engine
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Pilih menu/feature lalu klik <strong>Run Automation</strong> — browser Playwright langsung terbuka otomatis menjalankan test case &amp; selector hasil scraping.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg cursor-pointer select-none hover:bg-gray-100 transition-colors">
            <input
              type="checkbox"
              className="rounded text-[#0ABAB5]"
              checked={showBrowser}
              onChange={e => setShowBrowser(e.target.checked)}
            />
            <span>Live Browser Preview</span>
          </label>

          {view === 'editor' && (
            <button
              onClick={() => navigate(automationBasePath)}
              className="btn-secondary text-xs"
            >
              ← Kembali ke Daftar Feature
            </button>
          )}
        </div>
      </div>

      {/* ── RUN REPORT PANEL ── */}
      {runReport && (
        <div className="card p-4 border-l-4 border-[#0ABAB5]">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Hasil Eksekusi Playwright: {runReport.scriptName}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Durasi: {(runReport.summary.durationMs / 1000).toFixed(2)}s ·{' '}
                <span className="text-[#089e9a] font-medium">
                  {runReport.updatedTestCaseCount} manual test case otomatis di-update di halaman Test Cases
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="px-2.5 py-1 rounded-md bg-gray-100 text-gray-700">
                Total: {runReport.summary.total}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800">
                Passed: {runReport.summary.passed}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-red-100 text-red-800">
                Failed: {runReport.summary.failed}
              </span>
              <button
                onClick={() => setRunReport(null)}
                className="text-gray-400 hover:text-gray-600 px-1.5 py-0.5"
                title="Tutup laporan"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {runReport.summary.results.map((r, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded-lg border text-xs ${
                  r.status === 'passed'
                    ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                    : 'bg-red-50/70 border-red-200 text-red-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`px-1.5 py-0.5 rounded font-semibold uppercase text-[10px] ${
                        r.status === 'passed'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-red-600 text-white'
                      }`}
                    >
                      {r.status}
                    </span>
                    {r.testCaseId && (
                      <span className="font-mono font-semibold text-gray-700 bg-white px-1.5 py-0.5 rounded border border-gray-200">
                        {r.testCaseId}
                      </span>
                    )}
                    <span className="font-medium truncate">{r.title}</span>
                  </div>
                  <span className="text-gray-500 flex-shrink-0">{r.durationMs}ms</span>
                </div>
                {r.error && (
                  <pre className="mt-1.5 p-2 rounded bg-gray-900 text-red-300 font-mono text-[11px] whitespace-pre-wrap overflow-x-auto">
                    {r.error}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MAIN DIRECT RUNNER VIEW ── */}
      {view === 'runner' && (
        <div className="card p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Daftar Feature / Menu Siap Run</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Klik <strong>▶ Run Automation</strong> pada feature mana saja untuk langsung menjalankan pengujian dengan Playwright &amp; Live Preview.
              </p>
            </div>

            {features.length > 0 && (
              <div className="flex items-center gap-2">
                {selectedFeatures.length > 0 && (
                  <button
                    onClick={() =>
                      handleRunFeatureAutomation(
                        selectedFeatures.map(f => f.featureModule),
                        { key: '__batch__' }
                      )
                    }
                    disabled={isAnyRunning}
                    className="btn-primary text-xs flex items-center gap-1.5"
                  >
                    {runningFeatureKey === '__batch__' ? (
                      <>
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Menjalankan {selectedFeatures.length} Feature...
                      </>
                    ) : (
                      <>▶ Run {selectedFeatures.length} Feature Terpilih ({totalSelectedTestCases} TC)</>
                    )}
                  </button>
                )}
                <button
                  onClick={toggleAllFeatures}
                  className="btn-secondary text-xs"
                >
                  {features.every(f => f.selected) ? 'Batal Pilih Semua' : 'Pilih Semua'}
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-12 flex items-center justify-center text-gray-500 text-sm">
              <svg className="w-5 h-5 animate-spin text-[#0ABAB5] mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Memuat daftar feature...
            </div>
          ) : features.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-center text-gray-400">
              <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-medium text-gray-600">Belum ada Manual Test Case di project ini</p>
              <p className="text-xs text-gray-400 mt-1">
                Silakan scan halaman di menu <strong>Pages &amp; Scan</strong> lalu buat test case di menu <strong>Generate</strong> terlebih dahulu.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {features.map((f, idx) => {
                const matchedPage = findMatchingPage(f.featureModule);
                const selectorCount = countPageElements(matchedPage?.elements);
                const existingScript = findFeatureScript(f.featureModule);
                const isRunningThis =
                  runningFeatureKey === f.featureModule ||
                  runningFeatureKey === `${f.featureModule}:rebuild` ||
                  (existingScript && runningScriptId === existingScript.id);

                return (
                  <div
                    key={f.featureModule}
                    className={`p-4 rounded-xl border transition-all flex items-center justify-between flex-wrap gap-3 ${
                      f.selected
                        ? 'bg-[#f0fbfa] border-[#7fdcd8]'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        className="mt-1 rounded flex-shrink-0"
                        checked={f.selected}
                        onChange={() => toggleFeature(idx)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-semibold text-gray-900">{f.featureModule}</h4>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {f.count} Test Case
                          </span>
                          {existingScript?.status === 'Automated' && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                              ✓ Sudah Di-run
                            </span>
                          )}
                          {matchedPage && selectorCount > 0 ? (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#e6f9f8] text-[#06807d] border border-[#b0ece8]">
                              ⚡ {selectorCount} Selector Scraped ({matchedPage.path})
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              Belum ada selector halaman terkait
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {matchedPage
                            ? `Terhubung otomatis dengan hasil scraping halaman "${matchedPage.name}" (${matchedPage.path})${matchedPage.requiresAuth ? ' + auto-login' : ''}.`
                            : 'Akan dijalankan menggunakan locator teks/elemen dari langkah test case.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      <button
                        onClick={() =>
                          handleRunFeatureAutomation([f.featureModule], {
                            key: f.featureModule,
                          })
                        }
                        disabled={isAnyRunning}
                        className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 font-semibold"
                      >
                        {runningFeatureKey === f.featureModule ? (
                          <>
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Running Live Preview...
                          </>
                        ) : (
                          <>▶ Run Automation</>
                        )}
                      </button>

                      {existingScript && (
                        <>
                          <button
                            onClick={() =>
                              handleRunFeatureAutomation([f.featureModule], {
                                forceRegenerate: true,
                                key: `${f.featureModule}:rebuild`,
                              })
                            }
                            disabled={isAnyRunning}
                            title="Sinkronkan ulang dengan perubahan test case / selector terbaru lalu jalankan"
                            className="btn-secondary text-xs py-1.5 px-2.5"
                          >
                            {runningFeatureKey === `${f.featureModule}:rebuild` ? 'Sync & Running...' : '↻ Sync & Run Ulang'}
                          </button>
                          <button
                            onClick={() => navigate(`${automationBasePath}/${existingScript.id}`)}
                            disabled={Boolean(isRunningThis)}
                            className="text-xs px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
                          >
                            Lihat Script
                          </button>
                          <button
                            onClick={() => setDeleteId(existingScript.id)}
                            disabled={Boolean(isRunningThis)}
                            className="text-xs px-2 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                            title="Hapus script runner"
                          >
                            Hapus
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── OPTIONAL SCRIPT VIEWER / EDITOR ── */}
      {view === 'editor' && activeScript && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{activeScript.name}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-[#089e9a] text-white font-medium">
                Playwright
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveScript}
                disabled={saving}
                className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-md font-medium"
              >
                {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
              <button
                onClick={() => handleRunExistingScript(activeScript, editedScript)}
                disabled={isAnyRunning}
                className="text-xs bg-[#0ABAB5] hover:bg-[#089e9a] text-white px-3.5 py-1.5 rounded-md font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {runningScriptId === activeScript.id ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Running Live Preview...
                  </>
                ) : (
                  <>▶ Run Automation</>
                )}
              </button>
            </div>
          </div>
          <textarea
            className="w-full p-4 font-mono text-xs bg-gray-950 text-gray-100 min-h-[520px] border-0 focus:outline-none resize-none"
            value={editedScript}
            onChange={e => setEditedScript(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      {deleteId && (
        <ConfirmModal
          title="Hapus Script Runner"
          message={`Hapus runner "${scripts.find(s => s.id === deleteId)?.name}"? Anda tetap bisa klik Run Automation kapan saja untuk membuatnya kembali secara otomatis.`}
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
