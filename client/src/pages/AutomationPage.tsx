import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { AutomationScript, AutomationTool, Page } from '../types';
import { AUTOMATION_TOOLS } from '../types';
import { api } from '../services/api';
import { ConfirmModal } from '../components/ConfirmModal';
import { useProjectScopeContext } from '../hooks/useAppShellContext';

interface FeatureGroup {
  featureModule: string;
  count: number;
  selected: boolean;
}

function parseTestCaseIds(raw: string): string[] {
  try {
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

export function AutomationPage() {
  const { activeProject, onToast } = useProjectScopeContext();
  const { scriptId } = useParams<{ scriptId?: string }>();
  const navigate = useNavigate();
  const automationBasePath = `/projects/${activeProject.slug}/automation`;

  const [localView, setLocalView] = useState<'list' | 'generate'>('list');
  const [lastScriptId, setLastScriptId] = useState<string | null>(null);
  const [scripts, setScripts] = useState<AutomationScript[]>([]);
  const [features, setFeatures] = useState<FeatureGroup[]>([]);
  const [selectedTool, setSelectedTool] = useState<AutomationTool>('cypress');
  const [scriptName, setScriptName] = useState('');
  const [scriptDesc, setScriptDesc] = useState('');
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editedScript, setEditedScript] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [nameEditedManually, setNameEditedManually] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const generateAbortRef = useRef<AbortController | null>(null);

  const view: 'list' | 'generate' | 'editor' = scriptId ? 'editor' : localView;
  const activeScript = scriptId ? scripts.find(s => s.id === scriptId) ?? null : null;

  // Resync the editor draft only when the OPEN script actually changes —
  // not on every `scripts` update (e.g. status change) while editing.
  useEffect(() => {
    if (activeScript) setEditedScript(activeScript.script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScript?.id]);

  // Keep the "Editor" tab visible when landing directly on an editor URL
  // (deep link / refresh), not just when opened via a click this session.
  useEffect(() => {
    if (scriptId) setLastScriptId(scriptId);
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
      onToast('error', 'Failed to load data', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeProject, onToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Cancel an in-flight generate request when the active project changes
  // (ProjectScopeLayout remounts this page via `key={project.id}` on project
  // switch, so this cleanup also covers unmount).
  useEffect(() => {
    return () => {
      generateAbortRef.current?.abort();
    };
  }, [activeProject?.id]);

  // Auto-fill script name based on selected features — but never clobber a
  // name the user has manually typed. Clearing the field back to empty is
  // the explicit "give control back to auto-fill" gesture.
  useEffect(() => {
    if (nameEditedManually) return;
    const selected = features.filter(f => f.selected);
    if (selected.length === 0) { setScriptName(''); return; }
    if (selected.length === 1) {
      setScriptName(selected[0].featureModule + ' Tests');
    } else {
      setScriptName(`${activeProject?.name || 'Project'} - ${selected.length} Features`);
    }
  }, [features, activeProject, nameEditedManually]);

  const selectedFeatures = features.filter(f => f.selected);
  const totalSelectedTestCases = selectedFeatures.reduce((sum, f) => sum + f.count, 0);

  const toggleFeature = (idx: number) => {
    setFeatures(prev => prev.map((f, i) => i === idx ? { ...f, selected: !f.selected } : f));
  };

  const toggleAllFeatures = () => {
    const allSelected = features.every(f => f.selected);
    setFeatures(prev => prev.map(f => ({ ...f, selected: !allSelected })));
  };

  const handleGenerate = async () => {
    if (!activeProject || selectedFeatures.length === 0 || !scriptName.trim()) return;
    const controller = new AbortController();
    generateAbortRef.current = controller;
    setGenerating(true);
    try {
      const res = await api.generateAutomation({
        projectId: activeProject.id,
        name: scriptName.trim(),
        description: scriptDesc.trim() || undefined,
        tool: selectedTool,
        groupBy: 'feature',
        featureModules: selectedFeatures.map(f => f.featureModule),
        pageId: selectedPageId || undefined,
      }, controller.signal);
      setScripts(prev => [res.script, ...prev]);
      setLastScriptId(res.script.id);
      navigate(`${automationBasePath}/${res.script.id}`);
      onToast('success', 'Script generated!', res.script.name);
      if (res.truncated) {
        onToast('warning', 'AI response kepanjangan', 'Dipakai template dasar sebagai gantinya (bukan hasil AI) — lihat banner di editor');
      }
      // Light reset so returning to this tab doesn't silently offer to
      // duplicate the same generate again.
      setFeatures(prev => prev.map(f => ({ ...f, selected: false })));
      setScriptDesc('');
    } catch (err) {
      if (controller.signal.aborted) return;
      onToast('error', 'Failed to generate script', (err as Error).message);
    } finally {
      // Skipping setGenerating(false) here on abort relies on this component
      // having already been unmounted by ProjectScopeLayout's `key={project.id}`
      // remount (see the effect above) — if that remount is ever removed,
      // `generating` would get stuck `true` on a still-visible instance after
      // a project switch mid-generate. Re-check this if that changes.
      if (!controller.signal.aborted) setGenerating(false);
    }
  };

  const handleSaveScript = async () => {
    if (!activeScript) return;
    setSaving(true);
    try {
      const res = await api.updateAutomationScript(activeScript.id, { script: editedScript, name: activeScript.name });
      setScripts(prev => prev.map(s => s.id === activeScript.id ? res.script : s));
      onToast('success', 'Script saved');
    } catch (err) {
      onToast('error', 'Failed to save', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editedScript)
      .then(() => onToast('success', 'Copied to clipboard'))
      .catch(() => onToast('error', 'Failed to copy'));
  };

  const handleDownload = () => {
    if (!activeScript) return;
    const toolInfo = AUTOMATION_TOOLS.find(t => t.value === activeScript.tool) || AUTOMATION_TOOLS[0];
    const ext = toolInfo.ext;
    const blob = new Blob([editedScript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeScript.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() + ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onToast('success', 'Downloaded', a.download);
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    setStatusUpdatingId(id);
    try {
      const res = await api.updateAutomationScript(id, { status });
      setScripts(prev => prev.map(s => s.id === id ? res.script : s));
      const count = res.updatedTestCaseCount;
      onToast(
        'success',
        status === 'Automated' ? 'Marked as Automated' : 'Status updated',
        typeof count === 'number' && count > 0 ? `${count} test case(s) updated` : undefined
      );
    } catch (err) {
      onToast('error', 'Failed to update', (err as Error).message);
    } finally {
      setStatusUpdatingId(null);
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
      if (lastScriptId === deleteId) setLastScriptId(null);
      setDeleteId(null);
      const count = res.updatedTestCaseCount;
      onToast(
        'success',
        'Script deleted',
        typeof count === 'number' && count > 0 ? `${count} test case(s) reverted to Not Automated` : undefined
      );
    } catch (err) {
      onToast('error', 'Failed to delete', (err as Error).message);
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="card p-12 flex flex-col items-center text-center text-gray-400 max-w-2xl mx-auto">
        <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        <p className="text-sm font-medium text-gray-500">No active project</p>
        <p className="text-xs mt-1">Select a project to manage automation scripts</p>
      </div>
    );
  }

  return (
    <div>
      {/* Tab nav */}
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {(['list', 'generate', ...(lastScriptId ? ['editor'] : [])] as const).map(v => (
            <button
              key={v}
              onClick={() => {
                if (v === 'editor') {
                  if (lastScriptId) navigate(`${automationBasePath}/${lastScriptId}`);
                } else {
                  if (scriptId) navigate(automationBasePath);
                  setLocalView(v as 'list' | 'generate');
                }
              }}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {v === 'list' ? `Scripts (${scripts.length})` : v === 'generate' ? 'Generate Baru' : 'Editor'}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
          {activeProject.name}
        </span>
      </div>



      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <>
          {loading ? (
            <div className="card p-8 flex items-center justify-center text-gray-500 text-sm">
              <svg className="w-5 h-5 animate-spin text-blue-500 mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Memuat scripts...
            </div>
          ) : scripts.length === 0 ? (
            <div className="card p-12 flex flex-col items-center text-center text-gray-400">
              <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <p className="text-sm font-medium text-gray-500">Belum ada automation script</p>
              <p className="text-xs mt-1">Pilih feature lalu generate script automation</p>
              <button onClick={() => setLocalView('generate')} className="mt-4 btn-primary text-sm">
                Generate Script
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {scripts.map(script => (
                <div key={script.id} className="card p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-gray-900">{script.name}</h3>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          script.status === 'Automated' ? 'bg-green-100 text-green-700' :
                          script.status === 'Generated' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {script.status}
                        </span>
                        {script.tool && AUTOMATION_TOOLS.find(t => t.value === script.tool) && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${AUTOMATION_TOOLS.find(t => t.value === script.tool)!.color}`}>
                            {AUTOMATION_TOOLS.find(t => t.value === script.tool)!.label}
                          </span>
                        )}
                      </div>
                      {script.description && <p className="text-xs text-gray-500 mt-0.5">{script.description}</p>}
                      <p className="text-xs text-gray-400 mt-1">
                        {parseTestCaseIds(script.testCaseIds).length} test case(s) ·
                        {' '}{new Date(script.createdAt).toLocaleDateString('id-ID')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      {script.status === 'Generated' && (
                        <button
                          onClick={() => handleUpdateStatus(script.id, 'Automated')}
                          disabled={statusUpdatingId === script.id}
                          className="text-xs px-2 py-1 border border-green-200 text-green-700 rounded hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {statusUpdatingId === script.id ? 'Updating...' : 'Mark Automated'}
                        </button>
                      )}
                      <button
                        onClick={() => { setLastScriptId(script.id); navigate(`${automationBasePath}/${script.id}`); }}
                        className="text-xs px-2 py-1 border border-gray-200 text-gray-700 rounded hover:bg-gray-50"
                      >
                        Buka Editor
                      </button>
                      <button
                        onClick={() => setDeleteId(script.id)}
                        className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── GENERATE VIEW ── */}
      {view === 'generate' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Left: config */}
          <div className="lg:col-span-2 space-y-4">
            {/* Tool selector */}
            <div className="card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">1. Pilih Testing Tool</h3>
              <div className="space-y-2">
                {AUTOMATION_TOOLS.map(tool => (
                  <label
                    key={tool.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedTool === tool.value
                        ? tool.color + ' border-current'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tool"
                      value={tool.value}
                      checked={selectedTool === tool.value}
                      onChange={() => setSelectedTool(tool.value)}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedTool === tool.value ? 'border-current' : 'border-gray-300'
                    }`}>
                      {selectedTool === tool.value && (
                        <div className="w-2 h-2 rounded-full bg-current" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{tool.label}</p>
                      <p className="text-xs text-gray-500">File: <code className="bg-gray-100 px-1 rounded">{tool.ext}</code></p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Script config */}
            <div className="card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">2. Konfigurasi Script</h3>
              <div>
                <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">
                  Nama Script <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Login Tests"
                  value={scriptName}
                  onChange={e => {
                    const v = e.target.value;
                    setScriptName(v);
                    setNameEditedManually(v !== '');
                  }}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Deskripsi</label>
                <textarea
                  className="input-field"
                  rows={2}
                  placeholder="Opsional"
                  value={scriptDesc}
                  onChange={e => setScriptDesc(e.target.value)}
                />
              </div>
              {pages.length > 0 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">Halaman terkait (opsional)</label>
                  <select
                    className="input-field"
                    value={selectedPageId}
                    onChange={e => setSelectedPageId(e.target.value)}
                  >
                    <option value="">— Tidak ada —</option>
                    {pages.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.path})</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Konteks halaman ini (deskripsi/elemen) ikut disuntik ke prompt AI</p>
                </div>
              )}

              {/* Summary */}
              <div className={`rounded-lg p-3 text-xs ${selectedFeatures.length > 0 ? 'bg-blue-50 text-blue-800' : 'bg-gray-50 text-gray-500'}`}>
                {selectedFeatures.length === 0 ? (
                  <p>Pilih feature dari kanan untuk generate</p>
                ) : (
                  <div>
                    <p className="font-semibold mb-1">Selected:</p>
                    {selectedFeatures.map(f => (
                      <p key={f.featureModule} className="truncate">• {f.featureModule} ({f.count} TCs)</p>
                    ))}
                    <p className="mt-1 font-medium">Total: {totalSelectedTestCases} test cases</p>
                  </div>
                )}
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating || selectedFeatures.length === 0 || !scriptName.trim()}
                className="btn-primary w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
              >
                {generating ? (
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    Generate {AUTOMATION_TOOLS.find(t => t.value === selectedTool)?.label} Script
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right: feature list */}
          <div className="lg:col-span-3 card p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">3. Pilih Feature/Module</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Dikelompokkan per generate — satu script berisi semua feature yang dipilih
                </p>
              </div>
              {features.length > 0 && (
                <button
                  onClick={toggleAllFeatures}
                  className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50"
                >
                  {features.every(f => f.selected) ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                <svg className="w-5 h-5 animate-spin text-blue-500 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Memuat features...
              </div>
            ) : features.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <svg className="w-10 h-10 mx-auto mb-2 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-xs">Belum ada test case tersimpan di project ini</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {features.map((f, idx) => (
                  <label
                    key={f.featureModule}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      f.selected
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="rounded flex-shrink-0"
                      checked={f.selected}
                      onChange={() => toggleFeature(idx)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${f.selected ? 'text-blue-800' : 'text-gray-800'}`}>
                        {f.featureModule}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                      f.selected ? 'bg-blue-200 text-blue-800' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {f.count} TC
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── EDITOR VIEW ── */}
      {view === 'editor' && activeScript && (
        <div className="space-y-3">
        {/* Fallback-template banner — AI generation failed for this script */}
        {activeScript.generationSource === 'fallback' && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-xs text-amber-900">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="space-y-1">
              <p className="font-semibold">AI generation failed — this is a bare-bones template</p>
              <p className="text-amber-800 leading-relaxed">
                The AI service was unavailable or errored when this script was created, so a basic
                boilerplate template was used instead. Review carefully — it likely needs significantly
                more manual work than an AI-generated script.
              </p>
            </div>
          </div>
        )}
        {/* Info banner — hanya muncul jika script masih Generated (belum disesuaikan) */}
        {activeScript.status !== 'Automated' && (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-800">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="space-y-1">
              <p className="font-semibold">Script perlu disesuaikan sebelum dijalankan</p>
              <p className="text-blue-700 leading-relaxed">
                Cari <code className="bg-blue-100 px-1 rounded font-mono">TODO_SELECTOR</code> — ganti dengan CSS selector / XPath elemen di aplikasimu (misal: <code className="bg-blue-100 px-1 rounded font-mono">#login-btn</code>, <code className="bg-blue-100 px-1 rounded font-mono">[data-testid="submit"]</code>).
                {!activeProject?.projectUrl && (
                  <> Cari <code className="bg-blue-100 px-1 rounded font-mono">TODO_URL</code> — ganti dengan URL aplikasi yang diuji. Atau isi <strong>Project URL</strong> di halaman Projects agar otomatis terisi.</>
                )}
              </p>
            </div>
          </div>
        )}
        <div className="card overflow-hidden">
          {/* Editor header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span className="text-sm font-medium">{activeScript.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ml-1 ${
                activeScript.status === 'Automated' ? 'bg-green-800 text-green-200' :
                activeScript.status === 'Generated' ? 'bg-blue-800 text-blue-200' :
                'bg-gray-700 text-gray-300'
              }`}>
                {activeScript.status}
              </span>
              {activeScript.tool && AUTOMATION_TOOLS.find(t => t.value === activeScript.tool) && (
                <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-gray-700 text-gray-200">
                  {AUTOMATION_TOOLS.find(t => t.value === activeScript.tool)!.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleCopy} className="text-xs text-gray-300 hover:text-white flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </button>
              <button onClick={handleDownload} className="text-xs text-gray-300 hover:text-white flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
              <button
                onClick={handleSaveScript}
                disabled={saving}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              {activeScript.status === 'Generated' && (
                <button
                  onClick={() => handleUpdateStatus(activeScript.id, 'Automated')}
                  disabled={statusUpdatingId === activeScript.id}
                  className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {statusUpdatingId === activeScript.id ? 'Updating...' : 'Mark Automated'}
                </button>
              )}
            </div>
          </div>
          {/* Code textarea */}
          <textarea
            className="w-full p-4 font-mono text-xs bg-gray-950 text-gray-100 min-h-[520px] border-0 focus:outline-none resize-none"
            value={editedScript}
            onChange={e => setEditedScript(e.target.value)}
            spellCheck={false}
          />
        </div>
        </div>
      )}

      {/* ── EDITOR VIEW: script not found (deleted, or bad URL) ── */}
      {view === 'editor' && loading && !activeScript && (
        <div className="card p-8 flex items-center justify-center text-gray-500 text-sm">
          <svg className="w-5 h-5 animate-spin text-blue-500 mr-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Memuat script...
        </div>
      )}

      {view === 'editor' && !activeScript && !loading && (
        <div className="card p-12 flex flex-col items-center text-center text-gray-400">
          <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <p className="text-sm font-medium text-gray-500">Script not found</p>
          <p className="text-xs mt-1">It may have been deleted.</p>
          <button onClick={() => navigate(automationBasePath)} className="mt-4 btn-secondary text-sm">
            Back to list
          </button>
        </div>
      )}

      {deleteId && (
        <ConfirmModal
          title="Hapus Script"
          message={`Hapus "${scripts.find(s => s.id === deleteId)?.name}"? Tindakan ini tidak bisa dibatalkan.`}
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
