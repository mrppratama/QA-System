import type { Project, ToastMessage } from '../types';

export type ToastFn = (type: ToastMessage['type'], title: string, msg?: string) => void;

export interface AppShellContext {
  projects: Project[];
  projectsLoaded: boolean;
  activeProjectId: string;
  onToast: ToastFn;
  onCreateProject: () => void;
  onProjectsChange: (projects: Project[]) => void;
  onActiveProjectChange: (id: string) => void;
}

export interface ProjectScopeContext extends AppShellContext {
  activeProject: Project;
}
