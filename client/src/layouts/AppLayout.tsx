import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { ProjectModal } from '../components/ProjectModal';
import { CustomSelect } from '../components/CustomSelect';
import { Toast, useToast } from '../components/Toast';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { Project } from '../types';
import type { AppShellContext } from './appShellTypes';

const ACTIVE_PROJECT_KEY = 'qa_active_project_id';

interface NavItem {
  id: 'dashboard' | 'overview' | 'generate' | 'test-cases' | 'automation' | 'projects';
  label: string;
  icon: React.ReactNode;
  projectScoped: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    projectScoped: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    id: 'overview',
    label: 'Pages & Scan',
    projectScoped: true,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
  },
  {
    id: 'generate',
    label: 'Generate Test Case',
    projectScoped: true,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: 'test-cases',
    label: 'Test Cases',
    projectScoped: true,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'automation',
    label: 'Automation',
    projectScoped: true,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
  {
    id: 'projects',
    label: 'Projects',
    projectScoped: false,
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
  },
];

export function AppLayout() {
  const { session, signOut, updateDisplayName } = useAuth();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const displayName = (session?.user.user_metadata?.full_name as string | undefined) || '';

  const startEditName = () => {
    setNameInput(displayName);
    setEditingName(true);
  };

  const saveName = async () => {
    setSavingName(true);
    const { error } = await updateDisplayName(nameInput.trim());
    setSavingName(false);
    if (error) {
      show('error', 'Failed to update name', error);
    } else {
      setEditingName(false);
    }
  };

  const [projects, setProjects]               = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded]   = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [sidebarOpen, setSidebarOpen]         = useState(false);

  const { toasts, dismiss, show } = useToast();

  const projectMatch = useMatch('/projects/:slug/*');
  const routedSlug = projectMatch?.params.slug;
  const needsProject = !!routedSlug;
  const activeProjectSlug = projects.find(p => p.id === activeProjectId)?.slug;
  const linkSlug = routedSlug || activeProjectSlug;

  const matchDashboard  = useMatch({ path: '/dashboard', end: true });
  const matchProjects   = useMatch({ path: '/projects', end: true });
  const matchOverview   = useMatch({ path: '/projects/:slug', end: true });
  const matchGenerate   = useMatch('/projects/:slug/generate');
  const matchTestCases  = useMatch('/projects/:slug/test-cases');
  const matchAutomation = useMatch('/projects/:slug/automation/*');

  const currentLabel =
    matchDashboard ? 'Dashboard' :
    matchProjects ? 'Projects' :
    matchOverview ? 'Pages & Scan' :
    matchGenerate ? 'Generate Test Case' :
    matchTestCases ? 'Test Cases' :
    matchAutomation ? 'Automation' :
    '';

  // Which project-scoped segment we're currently on, if any — used so
  // creating a new project (from the sidebar or from GenerateForm) while
  // already inside a project's pages lands on the same kind of page for
  // the NEW project, instead of silently updating activeProjectId while
  // the URL (and thus the visible data) stays on the old project.
  const currentProjectSegment =
    matchOverview ? '' :
    matchGenerate ? 'generate' :
    matchTestCases ? 'test-cases' :
    matchAutomation ? 'automation' :
    null;

  const navigate = useNavigate();

  const activeProjectForHeader = projects.find(p => p.slug === routedSlug) || null;

  // Load projects (App's auth gate already guarantees we're authenticated by the time this mounts)
  useEffect(() => {
    api.getProjects()
      .then(res => {
        setProjects(res.projects);
        const stored = localStorage.getItem(ACTIVE_PROJECT_KEY);
        const found  = res.projects.find(p => p.id === stored);
        if (found) setActiveProjectId(found.id);
        else if (res.projects.length > 0) setActiveProjectId(res.projects[0].id);
      })
      .catch(() => {})
      .finally(() => setProjectsLoaded(true));
  }, []);

  const handleActiveProjectChange = useCallback((id: string) => {
    setActiveProjectId(id);
    localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  }, []);

  const handleToast = useCallback((type: 'success' | 'error' | 'info' | 'warning', title: string, msg?: string) => {
    show(type, title, msg);
  }, [show]);

  const handleCreateProject = useCallback(async (name: string, description?: string) => {
    const res = await api.createProject({ name, description });
    setProjects(prev => [res.project, ...prev]);
    handleActiveProjectChange(res.project.id);
    if (currentProjectSegment !== null) {
      navigate(currentProjectSegment ? `/projects/${res.project.slug}/${currentProjectSegment}` : `/projects/${res.project.slug}`);
    }
    show('success', 'Project created', name);
  }, [show, handleActiveProjectChange, currentProjectSegment, navigate]);

  const appShellContext: AppShellContext = {
    projects,
    projectsLoaded,
    activeProjectId,
    onToast: handleToast,
    onCreateProject: () => setShowProjectModal(true),
    onProjectsChange: setProjects,
    onActiveProjectChange: handleActiveProjectChange,
  };

  const hrefFor = (item: NavItem): string | null => {
    if (!item.projectScoped) return `/${item.id}`;
    if (!linkSlug) return null;
    if (item.id === 'overview') return `/projects/${linkSlug}`;
    return `/projects/${linkSlug}/${item.id}`;
  };

  return (
    <div className="h-screen bg-[#f8fafb] flex overflow-hidden">

      {/* ── Sidebar ── */}
      <>
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-slate-900/25 backdrop-blur-[1px] z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside className={`
          fixed inset-y-0 left-0 z-50 flex flex-col
          bg-white border-r border-slate-200/80 text-slate-700 w-60
          transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:translate-x-0 md:flex-shrink-0
        `}>
          {/* Logo / App Name */}
          <div className="h-14 flex items-center gap-2.5 px-4 border-b border-slate-100 flex-shrink-0">
            <div className="w-7 h-7 bg-[#0abab5] rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm shadow-[#0abab5]/20">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 leading-tight tracking-tight">JomTesting</p>
              <p className="text-[11px] text-slate-400 leading-tight">QA Studio</p>
            </div>
          </div>

          {/* Project Filter / Switcher — langsung di bawah nama aplikasi, di atas menu sidebar */}
          <div className="px-3 pt-3 pb-3 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Project Aktif
              </span>
            </div>
            <CustomSelect
              size="sm"
              value={activeProjectId}
              placeholder="— Belum ada project —"
              options={projects.map(p => ({
                value: p.id,
                label: p.name,
                dotColor: '#0ABAB5',
              }))}
              onChange={selectedId => {
                const proj = projects.find(p => p.id === selectedId);
                if (!proj) return;
                handleActiveProjectChange(proj.id);
                if (currentProjectSegment !== null) {
                  navigate(currentProjectSegment ? `/projects/${proj.slug}/${currentProjectSegment}` : `/projects/${proj.slug}`);
                }
              }}
            />
          </div>

          {/* Nav Menu */}
          <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
            {NAV_ITEMS.map(item => {
              const href = hrefFor(item);
              const baseClasses = `
                w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium
                transition-colors duration-150 text-left
              `;

              if (!href) {
                return (
                  <span
                    key={item.id}
                    className={`${baseClasses} text-slate-300 cursor-not-allowed`}
                    title="Buat project terlebih dahulu"
                  >
                    <span className="text-slate-300">{item.icon}</span>
                    {item.label}
                  </span>
                );
              }

              return (
                <NavLink
                  key={item.id}
                  to={href}
                  end={!item.projectScoped || item.id === 'overview'}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => `${baseClasses} ${
                    isActive
                      ? 'bg-[#f0fbfa] text-[#077d7a]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  {({ isActive }) => (
                    <>
                      <span className={isActive ? 'text-[#0abab5]' : 'text-slate-400'}>{item.icon}</span>
                      <span>{item.label}</span>
                      {isActive && <span className="ml-auto w-1.5 h-1.5 bg-[#0abab5] rounded-full" />}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Account / User Info */}
          <div className="px-3 py-3 border-t border-slate-100 bg-slate-50/40 flex-shrink-0">
            {editingName ? (
              <div className="space-y-1.5">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Nama kamu"
                  className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-lg px-2.5 py-1.5
                             focus:outline-none focus:ring-2 focus:ring-[#0abab5]/20 focus:border-[#0abab5]"
                />
                <div className="flex gap-1.5">
                  <button
                    onClick={saveName}
                    disabled={savingName}
                    className="flex-1 text-[11px] font-medium bg-[#0abab5] hover:bg-[#089e9a] text-white rounded-md py-1 disabled:opacity-50"
                  >
                    {savingName ? 'Menyimpan...' : 'Simpan'}
                  </button>
                  <button
                    onClick={() => setEditingName(false)}
                    className="flex-1 text-[11px] text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-md py-1"
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-[#d7f6f4] text-[#077d7a] flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {(displayName || session?.user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-800 truncate font-medium">
                      {displayName || session?.user.email}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">Local Workspace</p>
                  </div>
                </div>
                <button
                  onClick={startEditName}
                  className="flex-shrink-0 text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100"
                  title="Ubah nama tester"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </aside>
      </>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="h-14 bg-white/90 backdrop-blur-sm border-b border-slate-200/80 flex items-center gap-3 px-4 sm:px-6 flex-shrink-0">
          {/* Mobile hamburger */}
          <button
            className="md:hidden p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            onClick={() => setSidebarOpen(true)}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Page title */}
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm font-semibold text-slate-800 truncate">
              {currentLabel}
            </h1>
            {needsProject && activeProjectForHeader && (
              <>
                <span className="text-slate-300 text-xs">/</span>
                <span className="text-xs font-medium text-[#077d7a] bg-[#f0fbfa] border border-[#b0ece8] px-2 py-0.5 rounded-md truncate">
                  {activeProjectForHeader.name}
                </span>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
            <Outlet context={appShellContext} />
          </div>
        </main>
      </div>

      {/* Project Create Modal */}
      {showProjectModal && (
        <ProjectModal
          onClose={() => setShowProjectModal(false)}
          onCreate={handleCreateProject}
        />
      )}

      {/* Toasts */}
      <Toast toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
