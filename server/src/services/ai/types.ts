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
}
