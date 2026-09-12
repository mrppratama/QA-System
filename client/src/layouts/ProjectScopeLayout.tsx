import { useEffect } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { useAppShellContext } from '../hooks/useAppShellContext';
import type { ProjectScopeContext } from './appShellTypes';

export function ProjectScopeLayout() {
  const ctx = useAppShellContext();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const project = ctx.projects.find(p => p.id === projectId) ?? null;

  useEffect(() => {
    if (!ctx.projectsLoaded) return; // still loading — don't judge "not found" yet

    if (!project) {
      ctx.onToast('error', 'Project not found', 'It may have been deleted.');
      navigate('/projects', { replace: true });
      return;
    }

    if (ctx.activeProjectId !== project.id) {
      ctx.onActiveProjectChange(project.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.projectsLoaded, ctx.projects, projectId]);

  if (!ctx.projectsLoaded) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-gray-400">
        Loading...
      </div>
    );
  }

  if (!project) {
    return null; // redirect from the effect above is already in flight
  }

  const scopeContext: ProjectScopeContext = { ...ctx, activeProject: project };

  // `key` forces a full remount of the page below when the project changes
  // (React Router does NOT remount on its own when only a param changes,
  // since it's the same element at the same position) — this clears out
  // any page-local state left over from the previous project (e.g. an
  // unsaved Generate result, search/filter text, selection) instead of
  // letting it silently linger under the new project's context.
  return <Outlet key={project.id} context={scopeContext} />;
}
