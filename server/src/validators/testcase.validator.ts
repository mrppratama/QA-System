import { z } from 'zod';

export const GeneratedTestCaseSchema = z.object({
  featureModule: z.string().min(1),
  testScenario: z.string().min(1),
  type: z.string().min(1),
  precondition: z.string().default(''),
  actionStep: z.string().min(1),
  testData: z.string().default('-'),
  expectedResult: z.string().min(1),
});

export const GenerateResultSchema = z.object({
  testCases: z.array(GeneratedTestCaseSchema).min(1),
});

export const GenerateInputSchema = z.object({
  feature: z.string().min(1, 'Feature is required'),
  description: z.string().optional(),
  userFlow: z.string().optional(),
  expectedResult: z.string().optional(),
  role: z.string().optional(),
  testedBy: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  count: z.number().int().min(1).max(100).default(20),
  projectId: z.string().optional(),
  projectUrl: z.string().url().optional().or(z.literal('')).transform(v => v || undefined),
});

export type GenerateInput = z.infer<typeof GenerateInputSchema>;
export type GeneratedTestCase = z.infer<typeof GeneratedTestCaseSchema>;
export type GenerateResult = z.infer<typeof GenerateResultSchema>;
