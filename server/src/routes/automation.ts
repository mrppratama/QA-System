import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { aiRateLimiter } from '../middleware/rateLimiter';
import { createAIProvider } from '../services/ai';

const router = Router();

// Safe JSON parse for the AutomationScript.testCaseIds blob — never throws,
// falls back to [] so a malformed/legacy row can't 500 a whole request.
function safeParseIdArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

// GET /api/automation?projectId=xxx&page=&limit=
router.get('/', async (req: Request, res: Response) => {
  try {
    const { projectId, page, limit } = req.query;
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId query param required' });
    }

    // `script` (the generated source code, potentially large) is intentionally
    // excluded here — the list view never renders it, only GET /:id does.
    const select = {
      id: true, projectId: true, name: true, description: true,
      status: true, tool: true, generationSource: true, testCaseIds: true,
      createdAt: true, updatedAt: true,
    };

    if (page || limit) {
      const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const [total, scripts] = await Promise.all([
        prisma.automationScript.count({ where: { projectId: projectId as string } }),
        prisma.automationScript.findMany({
          where: { projectId: projectId as string },
          orderBy: { createdAt: 'desc' },
          skip, take: limitNum, select,
        }),
      ]);
      return res.json({ success: true, scripts, total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) });
    }

    const scripts = await prisma.automationScript.findMany({
      where: { projectId: projectId as string },
      orderBy: { createdAt: 'desc' },
      select,
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
  featureModules: z.array(z.string().min(1)).max(100).optional(),
  testCaseIds: z.array(z.string().min(1)).max(100).optional(),
  // Optional reference to a Page catalog entry (see routes/pages.ts) — its
  // description/scanned elements get folded into the prompt as extra context.
  pageId: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.groupBy === 'feature') {
    if (!data.featureModules || data.featureModules.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['featureModules'],
        message: "featureModules is required and must be non-empty when groupBy is 'feature'",
      });
    }
  } else if (data.groupBy === 'selection') {
    if (!data.testCaseIds || data.testCaseIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['testCaseIds'],
        message: "testCaseIds is required and must be non-empty when groupBy is 'selection'",
      });
    }
  }
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

    const { projectId, name, description, tool, groupBy, featureModules, testCaseIds, pageId } = parseResult.data;

    // Verify project exists
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const baseUrl = project.projectUrl || null;

    // Optional Page context (see routes/pages.ts) — folds a page's description
    // and any scanned real elements into the prompt so the AI can ground
    // selectors in something more concrete than a blind guess.
    let pageContext: { name: string; path: string; description: string | null; elements: unknown[] } | null = null;
    if (pageId) {
      const page = await prisma.page.findFirst({ where: { id: pageId, projectId } });
      if (page) {
        let elements: unknown[] = [];
        try {
          const parsed = JSON.parse(page.elements);
          if (Array.isArray(parsed)) elements = parsed;
        } catch { /* leave elements as [] */ }
        pageContext = { name: page.name, path: page.path, description: page.description, elements };
      }
    }

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
    const prompt = buildAutomationPrompt(tool, name, grouped, description, baseUrl, pageContext);

    // Call AI (via the shared provider — inherits its data.error/empty-content
    // validation and finish_reason tracking instead of a second, drifted copy)
    let script = '';
    let usedFallback = false;
    let truncated = false;
    try {
      const aiProvider = createAIProvider();
      // NINE_ROUTER_TIMEOUT exists to stay under Vercel's maxDuration in
      // production — that constraint doesn't exist for a local `npm run dev`
      // server, so give it a much longer budget there instead of aborting a
      // real (if slow) AI response.
      const timeoutMs = process.env.VERCEL
        ? parseInt(process.env.NINE_ROUTER_TIMEOUT || '45000', 10)
        : 120_000;
      const result = await aiProvider.generateAutomationScript(getSystemPrompt(tool), prompt, timeoutMs);
      script = result.script;
      truncated = result.truncated;
    } catch (aiErr) {
      console.warn('[Automation] AI failed, using fallback template:', aiErr);
      script = generateFallbackScript(tool, name, grouped, baseUrl);
      usedFallback = true;
    }

    // Save to DB
    const automationScript = await prisma.automationScript.create({
      data: {
        projectId,
        name,
        description,
        script,
        status: 'Generated',
        tool,
        generationSource: usedFallback ? 'fallback' : 'ai',
        testCaseIds: JSON.stringify(testCases.map(tc => tc.id)),
      },
    });

    // Update automation status on test cases — only upgrade test cases that
    // aren't already 'Automated' (a manually-set, more deliberate signal than
    // 'Generated'; regenerating a script shouldn't silently downgrade it).
    await prisma.testCase.updateMany({
      where: { id: { in: testCases.map(tc => tc.id) }, automationStatus: 'Not Automated' },
      data: { automationStatus: 'Generated' },
    });

    return res.json({ success: true, script: automationScript, tool, truncated });
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
const UpdateAutomationScriptSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  script: z.string().optional(),
  status: z.enum(['Generated', 'Automated']).optional(),
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const parseResult = UpdateAutomationScriptSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: parseResult.error.flatten(),
      });
    }

    const existing = await prisma.automationScript.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Script not found' });

    const updated = await prisma.automationScript.update({
      where: { id: req.params.id },
      data: parseResult.data,
    });

    // Keep TestCase.automationStatus in sync with a status change, both ways.
    let updatedTestCaseCount = 0;
    if (parseResult.data.status && parseResult.data.status !== existing.status) {
      const testCaseIds = safeParseIdArray(existing.testCaseIds);
      if (testCaseIds.length > 0) {
        const newAutomationStatus = parseResult.data.status === 'Automated' ? 'Automated' : 'Generated';
        await prisma.testCase.updateMany({
          where: { id: { in: testCaseIds } },
          data: { automationStatus: newAutomationStatus },
        });
        updatedTestCaseCount = testCaseIds.length;
      }
    }

    return res.json({ success: true, script: updated, updatedTestCaseCount });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// DELETE /api/automation/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.automationScript.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Script not found' });

    const testCaseIds = safeParseIdArray(existing.testCaseIds);

    await prisma.$transaction([
      prisma.testCase.updateMany({
        where: { id: { in: testCaseIds } },
        data: { automationStatus: 'Not Automated' },
      }),
      prisma.automationScript.delete({ where: { id: req.params.id } }),
    ]);

    return res.json({ success: true, updatedTestCaseCount: testCaseIds.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/automation/features?projectId=xxx — list distinct feature modules
router.get('/meta/features', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ success: false, error: 'projectId required' });

    const groups = await prisma.testCase.groupBy({
      by: ['featureModule'],
      where: { testCaseSet: { projectId: projectId as string } },
      _count: { _all: true },
      orderBy: { featureModule: 'asc' },
    });

    const features = groups.map(g => ({ featureModule: g.featureModule, count: g._count._all }));

    return res.json({ success: true, features });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ---- Helpers ----

function getSystemPrompt(tool: AutomationTool): string {
  const selectorPrinciple = 'Strongly prefer accessible, text/role-based locators (grounded in literal UI text mentioned in the test data) over brittle CSS selectors or invented IDs — only fall back to a TODO placeholder when no real UI text is available.';
  if (tool === 'cypress') {
    return `You are a Cypress test automation engineer. Generate clean, valid Cypress test code. ${selectorPrinciple} Return only JavaScript code without any markdown formatting.`;
  }
  if (tool === 'playwright') {
    return `You are a Playwright test automation engineer. Generate clean, valid Playwright test code using TypeScript. ${selectorPrinciple} Return only TypeScript code without any markdown formatting.`;
  }
  return `You are a Selenium test automation engineer. Generate clean, valid Selenium test code using JavaScript (WebDriverIO). ${selectorPrinciple} Return only JavaScript code without any markdown formatting.`;
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
  baseUrl?: string | null,
  pageContext?: { name: string; path: string; description: string | null; elements: unknown[] } | null
): string {
  const ext = getFileExtension(tool);
  const toolName = tool.charAt(0).toUpperCase() + tool.slice(1);
  const urlNote = baseUrl
    ? `BASE URL of the application under test: ${baseUrl}`
    : 'BASE URL: unknown — use TODO_URL placeholder and add a comment: // TODO: Replace with actual URL';

  const pageNote = pageContext ? `
PAGE CONTEXT (${pageContext.name}, path: ${pageContext.path}):
${pageContext.description ? pageContext.description + '\n' : ''}${
    pageContext.elements.length > 0
      ? `Known real elements on this page (use these exact selectors instead of TODO_SELECTOR when relevant):\n${JSON.stringify(pageContext.elements, null, 2)}`
      : '(No scanned elements yet for this page — still use TODO_SELECTOR, but use the description above for context.)'
  }
` : '';

  const featuresText = Object.entries(grouped).map(([feature, cases]) => {
    const casesText = cases.map(tc => {
      const hints = extractQuotedLabels([tc.testScenario, tc.actionStep, tc.testData, tc.expectedResult].join(' '));
      const hintLine = hints.length > 0
        ? `\n    Possible UI labels mentioned (prefer text/role-based locators using these exact strings): ${hints.map(h => `"${h}"`).join(', ')}`
        : '';
      return `
    Test Case ID: ${tc.testCaseId}
    Scenario: ${tc.testScenario}
    Type: ${tc.type}
    Precondition: ${tc.precondition || 'None'}
    Action Steps: ${tc.actionStep}
    Test Data: ${tc.testData || 'None'}
    Expected Result: ${tc.expectedResult}${hintLine}
`;
    }).join('\n---\n');

    return `
=== FEATURE: ${feature} ===
${casesText}`;
  }).join('\n\n');

  const selectorExample =
    tool === 'cypress'
      ? `cy.contains('button', 'Login').click();  // GOOD — text-based, robust\ncy.get('#submit-42').click();             // AVOID — brittle/invented ID`
      : tool === 'playwright'
      ? `await page.getByRole('button', { name: 'Login' }).click();  // GOOD — accessible, robust\nawait page.locator('#submit-42').click();                    // AVOID — brittle/invented ID`
      : `await driver.findElement(By.xpath("//button[contains(text(),'Login')]")).click();  // GOOD — text-based\nawait driver.findElement(By.css('#submit-42')).click();                            // AVOID — brittle/invented ID`;

  return `Generate a ${toolName} automation test file (${ext}) named "${name}" for the following test cases, grouped by feature.

${description ? `DESCRIPTION: ${description}\n` : ''}
${urlNote}
${pageNote}
${featuresText}

RULES:
1. Group tests using describe() per feature module
2. Each test case = one it()/test() block with the Test Case ID in the name
3. SELECTOR STRATEGY (in this priority order):
   a. If PAGE CONTEXT above lists a known real element matching the action, use its exact selector.
   b. Else if a "Possible UI labels mentioned" hint is given for that test case, use a text/role-based
      locator built from that exact string — this is the PREFERRED approach whenever any UI text is
      available, not just a last resort. Example:
      ${selectorExample}
   c. Only when neither (a) nor (b) gives you anything, fall back to a TODO_SELECTOR placeholder —
      add a comment: // TODO: Replace with actual selector
4. ${tool === 'cypress' ? 'Prefer cy.contains()/attribute selectors over invented CSS classes; use cy.visit(), cy.click(), cy.type(), cy.should()' :
     tool === 'playwright' ? 'Prefer page.getByRole()/getByText()/getByLabel()/getByPlaceholder() over page.locator() with invented CSS; use page.goto(), click(), fill(), expect()' :
     'Prefer By.xpath() text-matching over invented CSS IDs; use driver.get(), driver.findElement(), element.click(), element.sendKeys()'}
5. If test data includes credentials (username/password), use them directly in the test
6. Keep tests independent — each test should work standalone
7. ${baseUrl ? `Use "${baseUrl}" as the base URL for cy.visit() / page.goto() / driver.get() calls` : 'Use TODO_URL for unknown URLs — add comment: // TODO: Replace with actual URL'}
8. Add beforeEach for common setup (e.g. login, navigate to the correct page)

Return ONLY valid code, no markdown, no explanation.`;
}

// Best-effort UI-label hint extraction — pulls quoted substrings out of test
// case text (testers commonly quote the literal button/field/message text,
// e.g. `klik tombol 'Login'`). Not NLP, just a quote scan — absence of a
// quoted label simply means no hint is offered, never a false claim.
function extractQuotedLabels(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/['"]([^'"]{1,40})['"]/g) || [];
  const labels = matches.map(m => m.slice(1, -1).trim()).filter(Boolean);
  return Array.from(new Set(labels)).slice(0, 5);
}

// Escapes a value for safe interpolation into a single-quoted JS/TS string
// literal (e.g. it('...')) — order matters: backslashes first, then quotes,
// then newlines, so an inserted \n sequence isn't re-escaped by a later pass.
function escapeForSingleQuotedString(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n');
}

// Renders a value as a `// `-prefixed comment block, safe for multi-line input
// (a raw embedded newline would otherwise drop the `//` prefix on continuation
// lines, turning "commented out" text into live, uncommented code).
function toCommentBlock(s: string | null | undefined, fallback = 'None'): string {
  const text = (s ?? '').trim() || fallback;
  return text.split(/\r\n|\r|\n/).join('\n    // ');
}

// A quoted-label hint is only used in the deterministic fallback templates if
// it's free of characters that could break the single line of generated code
// it's spliced into — simpler and safer than escaping every edge case.
function safeHint(label: string | null | undefined): string | null {
  if (!label) return null;
  if (/['"\\\n\r]/.test(label)) return null;
  return label;
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
  const visitUrl = baseUrl ? `'${baseUrl}'` : `'TODO_URL'`;
  const visitUrlComment = baseUrl ? '' : ' // TODO: Replace with actual URL';
  const describes = Object.entries(grouped).map(([feature, cases]) => {
    const its = cases.map(tc => {
      const actionHint = safeHint(extractQuotedLabels(`${tc.actionStep} ${tc.testData || ''}`)[0]);
      const resultHint = safeHint(extractQuotedLabels(tc.expectedResult)[0]);
      const actionLine = actionHint
        ? `cy.contains('${actionHint}').click(); // best-effort text-based selector — verify this is the right element`
        : `cy.get('TODO_SELECTOR'); // TODO: Replace selector with actual application selector`;
      const assertLine = resultHint
        ? `cy.contains('${resultHint}').should('be.visible'); // best-effort based on expected result text`
        : `cy.get('TODO_SELECTOR').should('exist'); // TODO: Replace with actual assertion`;
      return `
  // ${tc.testCaseId} - ${tc.type}
  it('${escapeForSingleQuotedString(tc.testScenario)}', () => {
    // Precondition: ${toCommentBlock(tc.precondition)}
    cy.visit(${visitUrl});${visitUrlComment}
    // Test Data: ${toCommentBlock(tc.testData)}
    // Action Steps:
    // ${toCommentBlock(tc.actionStep, '(none)')}
    ${actionLine}
    // Expected: ${toCommentBlock(tc.expectedResult, '(none)')}
    ${assertLine}
  });`;
    }).join('\n');

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
  const gotoUrl = baseUrl ? `'${baseUrl}'` : `'TODO_URL'`;
  const gotoUrlComment = baseUrl ? '' : ' // TODO: Replace with actual URL';
  const describes = Object.entries(grouped).map(([feature, cases]) => {
    const tests = cases.map(tc => {
      const actionHint = safeHint(extractQuotedLabels(`${tc.actionStep} ${tc.testData || ''}`)[0]);
      const resultHint = safeHint(extractQuotedLabels(tc.expectedResult)[0]);
      const actionLine = actionHint
        ? `await page.getByText('${actionHint}').click(); // best-effort text-based locator — verify this is the right element`
        : `await page.locator('TODO_SELECTOR').click(); // TODO: Replace selector`;
      const assertLine = resultHint
        ? `await expect(page.getByText('${resultHint}')).toBeVisible(); // best-effort based on expected result text`
        : `await expect(page.locator('TODO_SELECTOR')).toBeVisible(); // TODO: Replace with actual assertion`;
      return `
  // ${tc.testCaseId} - ${tc.type}
  test('${escapeForSingleQuotedString(tc.testScenario)}', async ({ page }) => {
    // Precondition: ${toCommentBlock(tc.precondition)}
    await page.goto(${gotoUrl});${gotoUrlComment}
    // Test Data: ${toCommentBlock(tc.testData)}
    // Action Steps:
    // ${toCommentBlock(tc.actionStep, '(none)')}
    ${actionLine}
    // Expected: ${toCommentBlock(tc.expectedResult, '(none)')}
    ${assertLine}
  });`;
    }).join('\n');

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
  const getUrl = baseUrl ? `'${baseUrl}'` : `'TODO_URL'`;
  const getUrlComment = baseUrl ? '' : ' // TODO: Replace with actual URL';
  const describes = Object.entries(grouped).map(([feature, cases]) => {
    const its = cases.map(tc => {
      const actionHint = safeHint(extractQuotedLabels(`${tc.actionStep} ${tc.testData || ''}`)[0]);
      const findLine = actionHint
        ? `const el = await driver.findElement(By.xpath("//*[contains(text(),'${actionHint}')]")); // best-effort text-based locator — verify this is the right element`
        : `const el = await driver.findElement(By.css('TODO_SELECTOR')); // TODO: Replace selector`;
      return `
  // ${tc.testCaseId} - ${tc.type}
  it('${escapeForSingleQuotedString(tc.testScenario)}', async () => {
    // Precondition: ${toCommentBlock(tc.precondition)}
    await driver.get(${getUrl});${getUrlComment}
    // Test Data: ${toCommentBlock(tc.testData)}
    // Action Steps:
    // ${toCommentBlock(tc.actionStep, '(none)')}
    ${findLine}
    await el.click();
    // Expected: ${toCommentBlock(tc.expectedResult, '(none)')}
  });`;
    }).join('\n');

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
