export interface PageElementContext {
  selector: string;
  tag?: string;
  role?: string;
  text?: string;
}

export interface TestCaseInput {
  feature: string;
  description?: string;
  userFlow?: string;
  expectedResult?: string;
  role?: string;
  testedBy?: string;
  username?: string;
  password?: string;
  count?: number;
  projectUrl?: string;
  pageId?: string;
  pageContext?: {
    name: string;
    path: string;
    description?: string | null;
    elements: PageElementContext[];
  };
}

export interface GeneratedTestCase {
  featureModule: string;
  testScenario: string;
  type: string;
  precondition: string;
  actionStep: string;
  testData: string;
  expectedResult: string;
}

export interface GenerateResult {
  testCases: GeneratedTestCase[];
}

export interface AIProvider {
  generateTestCases(input: TestCaseInput, timeoutMs?: number): Promise<GenerateResult>;
  generateAutomationScript(
    systemPrompt: string,
    userPrompt: string,
    timeoutMs?: number
  ): Promise<{ script: string; truncated: boolean }>;
}
