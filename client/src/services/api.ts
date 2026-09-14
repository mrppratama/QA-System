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
  AttentionItem,
  Page,
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

// === Background job helpers (see server/src/routes/jobs.ts) ===
// AI generation can legitimately take longer than a single HTTP request
// should stay open for — these wrap the start/poll dance behind the same
// external shape callers used when it was a single blocking request, so
// GeneratePage.tsx / AutomationPage.tsx need no changes.
const JOB_POLL_INTERVAL_MS = 2000;
const JOB_POLL_TIMEOUT_MS = 5 * 60 * 1000; // give up after 5 minutes of polling

async function startJob(type: 'test-case' | 'automation', payload: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const res = await request<{ success: boolean; jobId: string }>('/jobs', {
    method: 'POST',
    body: JSON.stringify({ type, payload }),
    signal,
  });
  return res.jobId;
}

// Resolves after `ms`, or rejects immediately (as an AbortError) if `signal`
// fires first — a plain `setTimeout` sleep would otherwise sit there for the
// full interval before a cancellation gets noticed.
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

const MAX_CONSECUTIVE_POLL_FAILURES = 3;

async function pollJob<T>(jobId: string, signal?: AbortSignal): Promise<T> {
  const startedAt = Date.now();
  let consecutiveFailures = 0;

  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (Date.now() - startedAt > JOB_POLL_TIMEOUT_MS) {
      throw new Error('Generation is taking longer than expected. Please try again later.');
    }

    let res: { success: boolean; status: string; result: T; error?: string };
    try {
      res = await request<{ success: boolean; status: string; result: T; error?: string }>(`/jobs/${jobId}`, { signal });
      consecutiveFailures = 0;
    } catch (err) {
      // A deliberate cancellation is never "transient" — surface it right away.
      if (isAbortError(err) || signal?.aborted) throw err;
      // One flaky poll (a network blip, a momentary 5xx) shouldn't sink an
      // otherwise-successful background job — only give up after a run of
      // consecutive failures, not on the first one.
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) throw err;
      await sleep(JOB_POLL_INTERVAL_MS, signal);
      continue;
    }

    if (res.status === 'completed') return res.result;
    if (res.status === 'failed') throw new Error(res.error || 'Generation failed');

    await sleep(JOB_POLL_INTERVAL_MS, signal);
  }
}

export const api = {
  // === USERS ===
  async getUsers(): Promise<{ success: boolean; users: { id: string; email: string; name?: string }[] }> {
    return request('/users');
  },

  // === AI ===
  async generateTestCases(input: GenerateInput, signal?: AbortSignal): Promise<GenerateResponse> {
    const jobId = await startJob('test-case', input as unknown as Record<string, unknown>, signal);
    const result = await pollJob<{ testCases: GenerateResponse['testCases']; count: number }>(jobId, signal);
    return { success: true, testCases: result.testCases, count: result.count };
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
    byType: Record<string, number>;
    byTester: { tester: string; count: number }[];
    attention: AttentionItem[];
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
    byType: Record<string, number>;
    byTester: { tester: string; count: number }[];
    attention: AttentionItem[];
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
    pageId?: string;
  }, signal?: AbortSignal): Promise<{ success: boolean; script: AutomationScript; tool: string; truncated?: boolean }> {
    const jobId = await startJob('automation', data as unknown as Record<string, unknown>, signal);
    const result = await pollJob<{ script: AutomationScript; tool: string; truncated?: boolean }>(jobId, signal);
    return { success: true, ...result };
  },

  // === PAGES ===
  async getPages(projectId: string): Promise<{ success: boolean; pages: Page[] }> {
    return request(`/pages?projectId=${projectId}`);
  },

  async createPage(data: { projectId: string; name: string; path?: string; description?: string; requiresAuth?: boolean }): Promise<{ success: boolean; page: Page }> {
    return request('/pages', { method: 'POST', body: JSON.stringify(data) });
  },

  async updatePage(id: string, data: { name?: string; path?: string; description?: string; requiresAuth?: boolean }): Promise<{ success: boolean; page: Page }> {
    return request(`/pages/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  async deletePage(id: string): Promise<{ success: boolean }> {
    return request(`/pages/${id}`, { method: 'DELETE' });
  },

  async scanPage(id: string): Promise<{ success: boolean }> {
    return request(`/pages/${id}/scan`, { method: 'POST' });
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
  ): Promise<{ success: boolean; script: AutomationScript; updatedTestCaseCount?: number }> {
    return request(`/automation/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },

  async deleteAutomationScript(id: string): Promise<{ success: boolean; updatedTestCaseCount?: number }> {
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
