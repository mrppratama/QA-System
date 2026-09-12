import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { ProjectModal } from '../components/ProjectModal';
import { Toast, useToast } from '../components/Toast';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { Project } from '../types';
import type { AppShellContext } from './appShellTypes';

const ACTIVE_PROJECT_KEY = 'qa_active_project_id';

interface NavItem {
  id: 'dashboard' | 'generate' | 'test-cases' | 'automation' | 'projects';
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
    id: 'generate',
    label: 'Generate',
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
  const { session, signOut } = useAuth();

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
  const matchGenerate   = useMatch('/projects/:slug/generate');
  const matchTestCases  = useMatch('/projects/:slug/test-cases');
  const matchAutomation = useMatch('/projects/:slug/automation/*');

  const currentLabel =
    matchDashboard ? 'Dashboard' :
    matchProjects ? 'Projects' :
    matchGenerate ? 'Generate' :
    matchTestCases ? 'Test Cases' :
    matchAutomation ? 'Automation' :
    '';

  // Which project-scoped segment we're currently on, if any — used so
  // creating a new project (from the sidebar or from GenerateForm) while
  // already inside a project's pages lands on the same kind of page for
  // the NEW project, instead of silently updating activeProjectId while
  // the URL (and thus the visible data) stays on the old project.
  const currentProjectSegment =
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
    if (currentProjectSegment) {
      navigate(`/projects/${res.project.slug}/${currentProjectSegment}`);
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
    return linkSlug ? `/projects/${linkSlug}/${item.id}` : null;
  };

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">

      {/* ── Sidebar ── */}
      <>
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside className={`
          fixed inset-y-0 left-0 z-50 flex flex-col
          bg-gray-950 text-white w-56
          transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:translate-x-0 md:flex-shrink-0
        `}>
          {/* Logo */}
          <div className="h-14 flex items-center gap-2.5 px-4 border-b border-white/10 flex-shrink-0">
            <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">QA Generator</p>
              <p className="text-[10px] text-white/40 leading-tight">Powered by AI</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
            {NAV_ITEMS.map(item => {
              const href = hrefFor(item);
              const baseClasses = `
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-150 text-left
              `;

              if (!href) {
                return (
                  <span
                    key={item.id}
                    className={`${baseClasses} text-white/25 cursor-not-allowed`}
                    title="Create a project first"
                  >
                    <span className="text-white/20">{item.icon}</span>
                    {item.label}
                  </span>
                );
              }

              return (
                <NavLink
                  key={item.id}
                  to={href}
                  end={!item.projectScoped}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => `${baseClasses} ${
                    isActive
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {({ isActive }) => (
                    <>
                      <span className={isActive ? 'text-blue-400' : 'text-white/40'}>{item.icon}</span>
                      {item.label}
                      {isActive && <span className="ml-auto w-1 h-4 bg-blue-400 rounded-full" />}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Project switcher di sidebar — hanya untuk page yg butuh project */}
          {needsProject && (
            <div className="px-3 pb-4 border-t border-white/10 pt-3 flex-shrink-0">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2 px-1">Active Project</p>
              <div className="relative">
                <select
                  value={activeProjectId}
                  onChange={e => {
                    const proj = projects.find(p => p.id === e.target.value);
                    if (proj) navigate(`/projects/${proj.slug}/${currentProjectSegment || 'test-cases'}`);
                  }}
                  className="w-full appearance-none bg-white/5 border border-white/10 text-white text-xs rounded-lg px-3 py-2 pr-7
                             focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500
                             cursor-pointer"
                >
                  <option value="" className="bg-gray-900">— No project —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id} className="bg-gray-900">{p.name}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/40"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <button
                onClick={() => setShowProjectModal(true)}
                className="mt-2 w-full text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30
                           hover:border-blue-400/50 rounded-lg py-1.5 transition-colors"
              >
                + New Project
              </button>
            </div>
          )}

          {/* Account / sign out */}
          <div className="px-3 py-3 border-t border-white/10 flex-shrink-0">
            <p className="text-[11px] text-white/40 truncate mb-1.5">{session?.user.email}</p>
            <button
              onClick={() => signOut()}
              className="w-full text-xs text-white/60 hover:text-white border border-white/10
                         hover:border-white/20 rounded-lg py-1.5 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </aside>
      </>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center gap-3 px-4 sm:px-6 flex-shrink-0">
          {/* Mobile hamburger */}
          <button
            className="md:hidden p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            onClick={() => setSidebarOpen(true)}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Page title */}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-gray-900 truncate">
              {currentLabel}
            </h1>
            {needsProject && activeProjectForHeader && (
              <p className="text-xs text-gray-400 truncate leading-tight">{activeProjectForHeader.name}</p>
            )}
          </div>

          {/* Right side: nothing needed, project is in sidebar */}
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
