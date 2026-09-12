import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { aiRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// GET /api/automation?projectId=xxx
router.get('/', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId query param required' });
    }
    const scripts = await prisma.automationScript.findMany({
      where: { projectId: projectId as string },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, scripts });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/automation/generate
const SUPPORTED_TOOLS = ['cypress', 'playwright', 'selenium'] as const;
type AutomationTool = typeof SUPPORTED_TOOLS[number];

const GenerateAutomationSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  tool: z.enum(SUPPORTED_TOOLS).default('cypress'),
  groupBy: z.enum(['feature', 'selection']).default('feature'),
  // If groupBy='feature': featureModules = list of feature names to generate for
  // If groupBy='selection': testCaseIds = specific test case IDs
  featureModules: z.array(z.string()).optional(),
  testCaseIds: z.array(z.string()).optional(),
});

router.post('/generate', aiRateLimiter, async (req: Request, res: Response) => {
  try {
    const parseResult = GenerateAutomationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: parseResult.error.flatten(),
      });
    }

    const { projectId, name, description, tool, groupBy, featureModules, testCaseIds } = parseResult.data;

    // Verify project exists
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const baseUrl = project.projectUrl || null;

    // Fetch test cases
    let testCases;
    if (groupBy === 'feature' && featureModules && featureModules.length > 0) {
      testCases = await prisma.testCase.findMany({
        where: {
          testCaseSet: { projectId },
          featureModule: { in: featureModules },
        },
        orderBy: [{ featureModule: 'asc' }, { testCaseId: 'asc' }],
      });
    } else if (groupBy === 'selection' && testCaseIds && testCaseIds.length > 0) {
      testCases = await prisma.testCase.findMany({
        where: {
          id: { in: testCaseIds },
          testCaseSet: { projectId },
        },
        orderBy: [{ featureModule: 'asc' }, { testCaseId: 'asc' }],
      });
    } else {
      return res.status(400).json({ success: false, error: 'Provide featureModules or testCaseIds' });
    }

    if (testCases.length === 0) {
      return res.status(404).json({ success: false, error: 'No test cases found for given selection' });
    }

    // Group test cases by featureModule
    const grouped: Record<string, typeof testCases> = {};
    for (const tc of testCases) {
      const key = tc.featureModule;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(tc);
    }

    // Build prompt
    const prompt = buildAutomationPrompt(tool, name, grouped, description, baseUrl);

    // Call AI
    let script = '';
    try {
      const response = await fetch(`${process.env.NINE_ROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NINE_ROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.NINE_ROUTER_MODEL || 'cc/claude-sonnet-4-6',
          messages: [
            {
              role: 'system',
              content: getSystemPrompt(tool),
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 8000,
          stream: false,
        }),
        signal: AbortSignal.timeout(parseInt(process.env.NINE_ROUTER_TIMEOUT || '60000', 10)),
      });

      if (!response.ok) {
        throw new Error(`AI API error: ${response.status} - ${await response.text()}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      script = data.choices?.[0]?.message?.content || '';
      // Strip markdown code blocks
      if (script.startsWith('```')) {
        script = script.replace(/^```(?:javascript|js|python|java|ts|typescript)?\n?/, '').replace(/\n?```$/, '').trim();
      }
    } catch (aiErr) {
      console.warn('[Automation] AI failed, using fallback template:', aiErr);
      script = generateFallbackScript(tool, name, grouped, baseUrl);
    }

    // Save to DB
    const automationScript = await prisma.automationScript.create({
      data: {
        projectId,
        name,
        description,
        script,
        status: 'Generated',
        testCaseIds: JSON.stringify(testCases.map(tc => tc.id)),
      },
    });

    // Update automation status on test cases
    await prisma.testCase.updateMany({
      where: { id: { in: testCases.map(tc => tc.id) } },
      data: { automationStatus: 'Generated' },
    });

    return res.json({ success: true, script: automationScript, tool });
  } catch (err) {
    console.error('[Automation Generate]', err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/automation/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const script = await prisma.automationScript.findUnique({ where: { id: req.params.id } });
    if (!script) return res.status(404).json({ success: false, error: 'Script not found' });
    return res.json({ success: true, script });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// PUT /api/automation/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description, script, status } = req.body as Record<string, string>;
    const updated = await prisma.automationScript.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(script !== undefined && { script }),
        ...(status !== undefined && { status }),
      },
    });
    return res.json({ success: true, script: updated });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// DELETE /api/automation/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.automationScript.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/automation/features?projectId=xxx — list distinct feature modules
router.get('/meta/features', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId required' });

    const sets = await prisma.testCaseSet.findMany({
      where: { projectId: projectId as string },
      include: { testCases: { select: { featureModule: true } } },
    });

    // Collect distinct feature modules
    const featureSet = new Set<string>();
    for (const s of sets) {
      for (const tc of s.testCases) featureSet.add(tc.featureModule);
    }

    // Also get count per feature
    const testCasesByFeature: Record<string, number> = {};
    for (const s of sets) {
      for (const tc of s.testCases) {
        testCasesByFeature[tc.featureModule] = (testCasesByFeature[tc.featureModule] || 0) + 1;
      }
    }

    const features = Array.from(featureSet).sort().map(f => ({
      featureModule: f,
      count: testCasesByFeature[f] || 0,
    }));

    return res.json({ success: true, features });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ---- Helpers ----

function getSystemPrompt(tool: AutomationTool): string {
  if (tool === 'cypress') {
    return 'You are a Cypress test automation engineer. Generate clean, valid Cypress test code. Return only JavaScript code without any markdown formatting.';
  }
  if (tool === 'playwright') {
    return 'You are a Playwright test automation engineer. Generate clean, valid Playwright test code using TypeScript. Return only TypeScript code without any markdown formatting.';
  }
  return 'You are a Selenium test automation engineer. Generate clean, valid Selenium test code using JavaScript (WebDriverIO). Return only JavaScript code without any markdown formatting.';
}

function getFileExtension(tool: AutomationTool): string {
  if (tool === 'playwright') return '.spec.ts';
  if (tool === 'selenium') return '.test.js';
  return '.cy.js';
}

function buildAutomationPrompt(
  tool: AutomationTool,
  name: string,
  grouped: Record<string, Array<{ testCaseId: string; testScenario: string; type: string; precondition?: string | null; actionStep: string; testData?: string | null; expectedResult: string }>>,
  description?: string,
  baseUrl?: string | null
): string {
  const ext = getFileExtension(tool);
  const toolName = tool.charAt(0).toUpperCase() + tool.slice(1);
  const urlNote = baseUrl
    ? `BASE URL of the application under test: ${baseUrl}`
    : 'BASE URL: unknown — use TODO_URL placeholder and add a comment: // TODO: Replace with actual URL';

  const featuresText = Object.entries(grouped).map(([feature, cases]) => {
    const casesText = cases.map(tc => `
    Test Case ID: ${tc.testCaseId}
    Scenario: ${tc.testScenario}
    Type: ${tc.type}
    Precondition: ${tc.precondition || 'None'}
    Action Steps: ${tc.actionStep}
    Test Data: ${tc.testData || 'None'}
    Expected Result: ${tc.expectedResult}
`).join('\n---\n');

    return `
=== FEATURE: ${feature} ===
${casesText}`;
  }).join('\n\n');

  return `Generate a ${toolName} automation test file (${ext}) for the following test cases, grouped by feature.

${description ? `DESCRIPTION: ${description}\n` : ''}
${urlNote}

${featuresText}

RULES:
1. Group tests using describe() per feature module
2. Each test case = one it()/test() block with the Test Case ID in the name
3. Use TODO_SELECTOR for unknown DOM selectors — add comment: // TODO: Replace with actual selector
4. ${tool === 'cypress' ? 'Use cy.visit(), cy.get(), cy.click(), cy.type(), cy.should()' :
     tool === 'playwright' ? 'Use page.goto(), page.locator(), page.click(), page.fill(), expect()' :
     'Use driver.get(), driver.findElement(), element.click(), element.sendKeys()'}
5. If test data includes credentials (username/password), use them directly in the test
6. Keep tests independent — each test should work standalone
7. ${baseUrl ? `Use "${baseUrl}" as the base URL for cy.visit() / page.goto() / driver.get() calls` : 'Use TODO_URL for unknown URLs — add comment: // TODO: Replace with actual URL'}
8. Add beforeEach for common setup (e.g. login, navigate to the correct page)

Return ONLY valid code, no markdown, no explanation.`;
}

function generateFallbackScript(
  tool: AutomationTool,
  name: string,
  grouped: Record<string, Array<{ testCaseId: string; testScenario: string; type: string; precondition?: string | null; actionStep: string; testData?: string | null; expectedResult: string }>>,
  baseUrl?: string | null
): string {
  if (tool === 'cypress') return generateCypressFallback(name, grouped, baseUrl);
  if (tool === 'playwright') return generatePlaywrightFallback(name, grouped, baseUrl);
  return generateSeleniumFallback(name, grouped, baseUrl);
}

function generateCypressFallback(
  name: string,
  grouped: Record<string, Array<{ testCaseId: string; testScenario: string; type: string; precondition?: string | null; actionStep: string; testData?: string | null; expectedResult: string }>>,
  baseUrl?: string | null
): string {
  const visitUrl = baseUrl ? `'${baseUrl}'` : `'TODO_URL' // TODO: Replace with actual URL`;
  const describes = Object.entries(grouped).map(([feature, cases]) => {
    const its = cases.map(tc => `
  // ${tc.testCaseId} - ${tc.type}
  it('${tc.testScenario.replace(/'/g, "\\'")}', () => {
    // Precondition: ${tc.precondition || 'None'}
    cy.visit(${visitUrl});
    // Test Data: ${tc.testData || 'None'}
    // Action Steps:
    // ${tc.actionStep.split('\n').join('\n    // ')}
    cy.get('TODO_SELECTOR'); // TODO: Replace selector with actual application selector
    // Expected: ${tc.expectedResult}
    cy.get('TODO_SELECTOR').should('exist'); // TODO: Replace with actual assertion
  });`).join('\n');

    return `
describe('${feature}', () => {
  beforeEach(() => {
    // TODO: Add common setup (login, navigate, etc.)
  });
${its}
});`;
  }).join('\n\n');

  const urlComment = baseUrl ? `// Base URL: ${baseUrl}\n` : '';
  return `// ${name}.cy.js — Generated by QA Test Case Generator\n${urlComment}${describes}\n`;
}

function generatePlaywrightFallback(
  name: string,
  grouped: Record<string, Array<{ testCaseId: string; testScenario: string; type: string; precondition?: string | null; actionStep: string; testData?: string | null; expectedResult: string }>>,
  baseUrl?: string | null
): string {
  const gotoUrl = baseUrl ? `'${baseUrl}'` : `'TODO_URL' // TODO: Replace with actual URL`;
  const describes = Object.entries(grouped).map(([feature, cases]) => {
    const tests = cases.map(tc => `
  // ${tc.testCaseId} - ${tc.type}
  test('${tc.testScenario.replace(/'/g, "\\'")}', async ({ page }) => {
    // Precondition: ${tc.precondition || 'None'}
    await page.goto(${gotoUrl});
    // Test Data: ${tc.testData || 'None'}
    // Action Steps:
    // ${tc.actionStep.split('\n').join('\n    // ')}
    await page.locator('TODO_SELECTOR').click(); // TODO: Replace selector
    // Expected: ${tc.expectedResult}
    await expect(page.locator('TODO_SELECTOR')).toBeVisible(); // TODO: Replace with actual assertion
  });`).join('\n');

    return `
test.describe('${feature}', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: Add common setup
  });
${tests}
});`;
  }).join('\n\n');

  const urlComment = baseUrl ? `// Base URL: ${baseUrl}\n` : '';
  return `// ${name}.spec.ts — Generated by QA Test Case Generator\n${urlComment}import { test, expect } from '@playwright/test';\n${describes}\n`;
}

function generateSeleniumFallback(
  name: string,
  grouped: Record<string, Array<{ testCaseId: string; testScenario: string; type: string; precondition?: string | null; actionStep: string; testData?: string | null; expectedResult: string }>>,
  baseUrl?: string | null
): string {
  const getUrl = baseUrl ? `'${baseUrl}'` : `'TODO_URL' // TODO: Replace with actual URL`;
  const describes = Object.entries(grouped).map(([feature, cases]) => {
    const its = cases.map(tc => `
  // ${tc.testCaseId} - ${tc.type}
  it('${tc.testScenario.replace(/'/g, "\\'")}', async () => {
    // Precondition: ${tc.precondition || 'None'}
    await driver.get(${getUrl});
    // Test Data: ${tc.testData || 'None'}
    // Action Steps:
    // ${tc.actionStep.split('\n').join('\n    // ')}
    const el = await driver.findElement(By.css('TODO_SELECTOR')); // TODO: Replace selector
    await el.click();
    // Expected: ${tc.expectedResult}
  });`).join('\n');

    return `
describe('${feature}', () => {
  before(async () => { /* TODO: init driver */ });
  after(async () => { await driver.quit(); });
${its}
});`;
  }).join('\n\n');

  const urlComment = baseUrl ? `// Base URL: ${baseUrl}\n` : '';
  return `// ${name}.test.js — Generated by QA Test Case Generator\n${urlComment}const { Builder, By } = require('selenium-webdriver');\nlet driver;\n${describes}\n`;
}

export default router;
