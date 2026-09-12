import React, { useState } from 'react';
import type { Project } from '../types';
import { api } from '../services/api';
import { ConfirmModal } from '../components/ConfirmModal';

interface ProjectsPageProps {
  projects: Project[];
  activeProjectId: string;
  onProjectsChange: (projects: Project[]) => void;
  onActiveProjectChange: (id: string) => void;
  onToast: (type: 'success' | 'error' | 'info', title: string, msg?: string) => void;
}

export function ProjectsPage({
  projects,
  activeProjectId,
  onProjectsChange,
  onActiveProjectChange,
  onToast,
}: ProjectsPageProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const openCreate = () => {
    setFormName('');
    setFormDesc('');
    setFormUrl('');
    setUrlError('');
    setShowCreate(true);
    setEditingId(null);
  };

  const openEdit = (project: Project) => {
    setFormName(project.name);
    setFormDesc(project.description || '');
    setFormUrl(project.projectUrl || '');
    setUrlError('');
    setEditingId(project.id);
    setShowCreate(true);
  };

  const validateUrl = (val: string) => {
    if (!val.trim()) return '';
    try { new URL(val); return ''; }
    catch { return 'URL tidak valid. Contoh: https://app.example.com'; }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    const urlErr = validateUrl(formUrl);
    if (urlErr) { setUrlError(urlErr); return; }
    setLoading(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDesc.trim() || undefined,
        projectUrl: formUrl.trim() || undefined,
      };
      if (editingId) {
        const res = await api.updateProject(editingId, payload);
        onProjectsChange(projects.map(p => p.id === editingId ? res.project : p));
        onToast('success', 'Project updated', res.project.name);
      } else {
        const res = await api.createProject(payload);
        onProjectsChange([res.project, ...projects]);
        onToast('success', 'Project created', res.project.name);
      }
      setShowCreate(false);
      setEditingId(null);
    } catch (err) {
      onToast('error', editingId ? 'Failed to update project' : 'Failed to create project', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      await api.deleteProject(deleteId);
      const updated = projects.filter(p => p.id !== deleteId);
      onProjectsChange(updated);
      if (activeProjectId === deleteId) {
        onActiveProjectChange(updated[0]?.id || '');
      }
      onToast('success', 'Project deleted');
      setDeleteId(null);
    } catch (err) {
      onToast('error', 'Failed to delete project', (err as Error).message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const projectToDelete = projects.find(p => p.id === deleteId);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
          <p className="text-sm text-gray-500 mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Project
        </button>
      </div>

      {/* Project list */}
      {projects.length === 0 ? (
        <div className="card p-12 flex flex-col items-center text-center text-gray-400">
          <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <p className="text-sm font-medium text-gray-500">No projects yet</p>
          <p className="text-xs mt-1">Create a project to organize your test cases</p>
          <button onClick={openCreate} className="mt-4 btn-primary text-sm">
            Create First Project
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(project => {
            const isActive = project.id === activeProjectId;
            return (
              <div
                key={project.id}
                className={`card p-4 flex items-start gap-4 ${isActive ? 'border-blue-300 bg-blue-50/30' : ''}`}
              >
                {/* Icon */}
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isActive ? 'bg-blue-600' : 'bg-gray-100'
                }`}>
                  <svg className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{project.name}</h3>
                    {isActive && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                        Active
                      </span>
                    )}
                  </div>
                  {project.description && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{project.description}</p>
                  )}
                  {project.projectUrl && (
                    <a
                      href={project.projectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-0.5 truncate max-w-xs"
                      onClick={e => e.stopPropagation()}
                    >
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      {project.projectUrl}
                    </a>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {project._count?.testCaseSets ?? 0} test set{(project._count?.testCaseSets ?? 0) !== 1 ? 's' : ''} ·
                    Created {new Date(project.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!isActive && (
                    <button
                      onClick={() => onActiveProjectChange(project.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(project)}
                    className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteId(project.id)}
                    className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded px-2 py-1 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">
                {editingId ? 'Edit Project' : 'New Project'}
              </h2>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. BigMove, BSJ7"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                  Description
                </label>
                <textarea
                  className="input-field"
                  rows={2}
                  placeholder="Optional description"
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
                  Project URL
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </span>
                  <input
                    type="url"
                    className={`input-field pl-9 ${urlError ? 'border-red-400 focus:ring-red-400' : ''}`}
                    placeholder="https://app.example.com"
                    value={formUrl}
                    onChange={e => { setFormUrl(e.target.value); setUrlError(''); }}
                    onBlur={e => setUrlError(validateUrl(e.target.value))}
                  />
                </div>
                {urlError ? (
                  <p className="text-xs text-red-500 mt-1">{urlError}</p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">Link ke aplikasi / staging / production yang akan ditest</p>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setEditingId(null); }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !formName.trim()}
                  className="btn-primary flex-1"
                >
                  {loading ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <ConfirmModal
          title="Delete Project"
          message={`Are you sure you want to delete "${projectToDelete?.name}"? All test cases and automation scripts in this project will be permanently deleted.`}
          confirmLabel="Delete Project"
          variant="danger"
          loading={deleteLoading}
          onConfirm={handleDelete}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
