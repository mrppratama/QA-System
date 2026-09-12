import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { GeneratePage } from './pages/GeneratePage';
import { TestCasesPage } from './pages/TestCasesPage';
import { AutomationPage } from './pages/AutomationPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { LoginPage } from './pages/LoginPage';
import { AppLayout } from './layouts/AppLayout';
import { ProjectScopeLayout } from './layouts/ProjectScopeLayout';
import { useAuth } from './contexts/AuthContext';

export default function App() {
  const { session, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-400">
        Loading...
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/projects" element={<ProjectsPage />} />

        <Route path="/projects/:slug" element={<ProjectScopeLayout />}>
          <Route index element={<Navigate to="test-cases" replace />} />
          <Route path="generate" element={<GeneratePage />} />
          <Route path="test-cases" element={<TestCasesPage />} />
          <Route path="automation" element={<AutomationPage />} />
          <Route path="automation/:scriptId" element={<AutomationPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
