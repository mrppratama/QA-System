import type {
  GenerateInput,
  GenerateResponse,
  SaveTestCasesInput,
  SaveTestCasesResponse,
  ImportResponse,
  SheetInfo,
  ColumnMapping,
  Project,
  TestCase,
  AutomationScript,
} from '../types';
import { supabase } from '../lib/supabase';

const BASE_URL = '/api';

async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...options?.headers,
    },
  });

  const data = await res.json() as T & { error?: string };

  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed: ${res.status}`);
  }

  return data;
}

export const api = {
  // === USERS ===
  async getUsers(): Promise<{ success: boolean; users: { id: string; email: string; name?: string }[] }> {
    return request('/users');
  },

  // === AI ===
  async generateTestCases(input: GenerateInput): Promise<GenerateResponse> {
    return request<GenerateResponse>('/ai/generate-test-cases', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  // === PROJECTS ===
  async getProjects(): Promise<{ success: boolean; projects: Project[] }> {
    return request('/projects');
  },

  async createProject(data: { name: string; description?: string; projectUrl?: string }): Promise<{
    success: boolean;
    project: Project;
  }> {
    return request('/projects', { method: 'POST', body: JSON.stringify(data) });
  },

  async updateProject(id: string, data: { name?: string; description?: string; projectUrl?: string }): Promise<{
    success: boolean;
    project: Project;
  }> {
    return request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  async deleteProject(id: string): Promise<{ success: boolean }> {
    return request(`/projects/${id}`, { method: 'DELETE' });
  },

  async getDashboardStats(): Promise<{
    success: boolean;
    overview: {
      totalProjects: number;
      totalTestCases: number;
      totalFeatures: number;
      totalScripts: number;
      automationCoverage: number;
    };
    byTestingResult: Record<string, number>;
    byAutomationStatus: Record<string, number>;
    projects: { id: string; name: string; testSets: number }[];
  }> {
    return request('/projects/dashboard/stats');
  },

  async getProjectStats(projectId: string): Promise<{
    success: boolean;
    project: { id: string; name: string; url?: string; description?: string };
    stats: {
      totalTestCases: number;
      totalFeatures: number;
      totalTestSets: number;
      totalScripts: number;
      automationCoverage: number;
      passRate: number;
    };
    byTestingResult: Record<string, number>;
    byAutomationStatus: Record<string, number>;
    topFeatures: { feature: string; count: number }[];
    recentSets: { id: string; feature: string; count: number; createdAt: string; testedBy?: string | null }[];
  }> {
    return request(`/projects/${projectId}/stats`);
  },

  // === TEST CASES ===
  async getProjectTestCases(
    projectId: string,
    params?: {
      search?: string;
      type?: string;
      testingResult?: string;
      automationStatus?: string;
      testBy?: string;
      page?: number;
      limit?: number;
    },
    signal?: AbortSignal
  ): Promise<{
    success: boolean;
    testCases: TestCase[];
    total: number;
    page: number;
    pages: number;
  }> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.type) q.set('type', params.type);
    if (params?.testingResult) q.set('testingResult', params.testingResult);
    if (params?.automationStatus) q.set('automationStatus', params.automationStatus);
    if (params?.testBy) q.set('testBy', params.testBy);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));

    const qs = q.toString() ? `?${q.toString()}` : '';
    return request(`/projects/${projectId}/test-cases${qs}`, { signal });
  },

  async getProjectTesters(projectId: string): Promise<{ success: boolean; testers: string[] }> {
    return request(`/projects/${projectId}/testers`);
  },

  async saveTestCases(
    projectId: string,
    input: SaveTestCasesInput
  ): Promise<SaveTestCasesResponse> {
    return request(`/projects/${projectId}/save-test-cases`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async updateTestCase(id: string, data: Partial<TestCase>): Promise<{ success: boolean; testCase: TestCase }> {
    return request(`/test-cases/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  async deleteTestCase(id: string): Promise<{ success: boolean }> {
    return request(`/test-cases/${id}`, { method: 'DELETE' });
  },

  async bulkDeleteTestCases(ids: string[]): Promise<{ success: boolean; deleted: number }> {
    return request('/test-cases/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
  },

  // === AUTOMATION ===
  async getAutomationScripts(projectId: string): Promise<{ success: boolean; scripts: AutomationScript[] }> {
    return request(`/automation?projectId=${projectId}`);
  },

  async getAutomationFeatures(projectId: string): Promise<{
    success: boolean;
    features: { featureModule: string; count: number }[];
  }> {
    return request(`/automation/meta/features?projectId=${projectId}`);
  },

  async generateAutomation(data: {
    projectId: string;
    name: string;
    description?: string;
    tool: 'cypress' | 'playwright' | 'selenium';
    groupBy: 'feature' | 'selection';
    featureModules?: string[];
    testCaseIds?: string[];
  }): Promise<{ success: boolean; script: AutomationScript; tool: string }> {
    return request('/automation/generate', { method: 'POST', body: JSON.stringify(data) });
  },

  /** @deprecated use generateAutomation */
  async generateCypress(data: {
    projectId: string;
    name: string;
    description?: string;
    testCases: Array<{
      id: string;
      testCaseId: string;
      featureModule: string;
      testScenario: string;
      type: string;
      precondition?: string;
      actionStep: string;
      testData?: string;
      expectedResult: string;
    }>;
  }): Promise<{ success: boolean; script: AutomationScript }> {
    return request('/automation/generate', { method: 'POST', body: JSON.stringify(data) });
  },

  async getAutomationScript(id: string): Promise<{ success: boolean; script: AutomationScript }> {
    return request(`/automation/${id}`);
  },

  async updateAutomationScript(
    id: string,
    data: { name?: string; description?: string; script?: string; status?: string }
  ): Promise<{ success: boolean; script: AutomationScript }> {
    return request(`/automation/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  async deleteAutomationScript(id: string): Promise<{ success: boolean }> {
    return request(`/automation/${id}`, { method: 'DELETE' });
  },

  // === EXCEL ===
  async importExcel(file: File): Promise<ImportResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${BASE_URL}/excel/import`, {
      method: 'POST',
      headers: await authHeaders(),
      body: formData,
    });

    const data = await res.json() as ImportResponse;
    if (!res.ok) {
      throw new Error(data.error || 'Import failed');
    }
    return data;
  },

  async getSheets(fileId: string): Promise<{ success: boolean; sheets: SheetInfo[] }> {
    return request(`/excel/${fileId}/sheets`);
  },

  async getColumnMapping(fileId: string, sheetName: string): Promise<{
    success: boolean;
    headers: string[];
    mapping: ColumnMapping;
  }> {
    return request(`/excel/${fileId}/mapping?sheet=${encodeURIComponent(sheetName)}`);
  },

  async addTestCasesToSheet(
    fileId: string,
    sheetName: string,
    testCases: TestCase[],
    columnMapping?: ColumnMapping
  ): Promise<{ success: boolean; added: number; lastId: string }> {
    return request(`/excel/${fileId}/add-test-cases`, {
      method: 'POST',
      body: JSON.stringify({
        sheetName,
        testCases: testCases.map(tc => ({
          id: tc.testCaseId,
          featureModule: tc.featureModule,
          testScenario: tc.testScenario,
          type: tc.type,
          precondition: tc.precondition || '',
          actionStep: tc.actionStep,
          testData: tc.testData || '-',
          expectedResult: tc.expectedResult,
          actualResult: tc.actualResult || '',
          testingResult: tc.testingResult || 'Not Tested',
          testDate: tc.testDate || '',
          testBy: tc.testBy || '',
          bugNote: tc.bugNote || '',
        })),
        columnMapping,
      }),
    });
  },

  async downloadExport(fileId: string): Promise<Blob> {
    const res = await fetch(`${BASE_URL}/excel/${fileId}/export`, {
      headers: await authHeaders(),
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error || 'Export failed');
    }
    return res.blob();
  },

  async exportNew(testCases: TestCase[], filename?: string): Promise<Blob> {
    const res = await fetch(`${BASE_URL}/excel/export-new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({
        testCases: testCases.map(tc => ({
          id: tc.testCaseId,
          featureModule: tc.featureModule,
          testScenario: tc.testScenario,
          type: tc.type,
          precondition: tc.precondition || '',
          actionStep: tc.actionStep,
          testData: tc.testData || '-',
          expectedResult: tc.expectedResult,
          actualResult: tc.actualResult || '',
          testingResult: tc.testingResult || 'Not Tested',
          testDate: tc.testDate || '',
          testBy: tc.testBy || '',
          bugNote: tc.bugNote || '',
        })),
        filename,
      }),
    });

    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error || 'Export failed');
    }

    return res.blob();
  },

  async exportProject(projectId: string): Promise<Blob> {
    const res = await fetch(`${BASE_URL}/excel/export-project/${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    });

    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error || 'Export failed');
    }

    return res.blob();
  },
};
