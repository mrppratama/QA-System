import { useOutletContext } from 'react-router-dom';
import type { AppShellContext, ProjectScopeContext } from '../layouts/appShellTypes';

export const useAppShellContext = () => useOutletContext<AppShellContext>();

export const useProjectScopeContext = () => useOutletContext<ProjectScopeContext>();
