export interface TestCase {
  id: string;          // DB id (UUID)
  testCaseId: string;  // TC001, TC002, etc.
  featureModule: string;
  testScenario: string;
  type: string;
  precondition: string;
  actionStep: string;
  testData: string;
  expectedResult: string;
  actualResult?: string;
  testingResult: string;
  testDate?: string;
  testBy?: string;
  bugNote?: string;
  automationStatus: string;
  createdAt?: string;
  testCaseSet?: { feature: string; testedBy?: string | null };
}

// Used for generated (not-yet-saved) test cases
export interface GeneratedTestCase {
  tempId: string;       // temporary ID for display (TC001, TC002, ...)
  featureModule: string;
  testScenario: string;
  type: string;
  precondition: string;
  actionStep: string;
  testData: string;
  expectedResult: string;
  // Manual-fill columns (empty by default, filled by tester)
  actualResult?: string;
  testingResult?: string;
  testDate?: string;
  testBy?: string;
  bugNote?: string;
}

export interface GenerateInput {
  feature: string;
  description?: string;
  userFlow?: string;
  expectedResult?: string;
  role?: string;
  testedBy?: string;
  username?: string;
  password?: string;
  count: number;
  projectId?: string;
  projectUrl?: string;
}

export type AutomationTool = 'cypress' | 'playwright' | 'selenium';

export const AUTOMATION_TOOLS: { value: AutomationTool; label: string; ext: string; color: string }[] = [
  { value: 'cypress',     label: 'Cypress',     ext: '.cy.js',    color: 'text-green-700 bg-green-50 border-green-300' },
  { value: 'playwright',  label: 'Playwright',  ext: '.spec.ts',  color: 'text-blue-700 bg-blue-50 border-blue-300' },
  { value: 'selenium',    label: 'Selenium',    ext: '.test.js',  color: 'text-orange-700 bg-orange-50 border-orange-300' },
];

export interface GenerateResponse {
  success: boolean;
  testCases: GeneratedTestCase[];
  count: number;
  error?: string;
  hint?: string;
}

export interface SaveTestCasesInput {
  feature: string;
  description?: string;
  userFlow?: string;
  expectedResult?: string;
  role?: string;
  testedBy?: string;
  testCases: Array<{
    featureModule: string;
    testScenario: string;
    type: string;
    precondition: string;
    actionStep: string;
    testData: string;
    expectedResult: string;
    testBy?: string;
  }>;
}

export interface SaveTestCasesResponse {
  success: boolean;
  saved: number;
  testCaseSetId: string;
  testCases: TestCase[];
  error?: string;
}

export interface SheetInfo {
  name: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
}

export interface ImportResponse {
  success: boolean;
  fileId: string;
  originalName: string;
  sheets: SheetInfo[];
  error?: string;
}

export interface ColumnMapping {
  testCaseId?: string;
  featureModule?: string;
  testScenario?: string;
  type?: string;
  precondition?: string;
  actionStep?: string;
  testData?: string;
  expectedResult?: string;
  actualResult?: string;
  testingResult?: string;
  testDate?: string;
  testBy?: string;
  bugNote?: string;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  description?: string;
  projectUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
  _count?: { testCaseSets: number };
}

export interface AttentionItem {
  id: string;
  testCaseId: string;
  featureModule: string;
  testScenario: string;
  testingResult: string;
  bugNote?: string | null;
  testBy?: string | null;
  testDate?: string | null;
  projectId?: string | null;
  projectName?: string | null;
}

export interface AutomationScript {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  script: string;
  status: string;
  tool?: string;
  generationSource?: string;
  testCaseIds: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Page {
  id: string;
  projectId: string;
  name: string;
  path: string;
  description?: string | null;
  requiresAuth: boolean;
  elements: string; // JSON array, "[]" until a scan has run
  lastScannedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
}

export const TESTING_RESULTS = ['Not Tested', 'Passed', 'Failed', 'Blocked'] as const;
export const AUTOMATION_STATUSES = ['Not Automated', 'Generated', 'Automated'] as const;
export const TEST_CASE_TYPES = [
  'Happy Path',
  'Validation',
  'Error Case',
  'Important edge case',
] as const;
