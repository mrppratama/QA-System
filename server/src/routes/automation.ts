import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { aiRateLimiter } from '../middleware/rateLimiter';
import { createAIProvider } from '../services/ai';
import { HttpError } from '../lib/httpError';
import { runAutomationScript } from '../services/runner/automation-runner';

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

export const GenerateAutomationSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  tool: z.enum(SUPPORTED_TOOLS).default('playwright'),
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

// Core generation logic, extracted so it can be called both from the
// synchronous route below and from the background job runner (routes/jobs.ts)
// used to dodge Vercel's request/response timeout for slow AI calls.
export async function runGenerateAutomation(input: z.infer<typeof GenerateAutomationSchema>) {
  const { projectId, name, description, tool, groupBy, featureModules, testCaseIds, pageId } = input;

  // Verify project exists
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new HttpError(404, 'Project not found');
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
    throw new HttpError(400, 'Provide featureModules or testCaseIds');
  }

  if (testCases.length === 0) {
    throw new HttpError(404, 'No test cases found for given selection');
  }

  // Group test cases by featureModule
  const grouped: Record<string, typeof testCases> = {};
  for (const tc of testCases) {
    const key = tc.featureModule;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(tc);
  }

  // Load all Pages for this project so we can:
  // 1) Resolve explicit `pageId` AND auto-match pages corresponding to the selected `featureModule`s
  // 2) Automatically include scraped Login Page selectors when the target page requiresAuth or tests use credentials
  const allPages = await prisma.page.findMany({ where: { projectId } });
  const parseElements = (raw: string | null | undefined): ScannedPageElement[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const matchedPages: typeof allPages = [];
  if (pageId) {
    const explicitPage = allPages.find(p => p.id === pageId);
    if (explicitPage) matchedPages.push(explicitPage);
  }

  const featureNames = Object.keys(grouped).map(f => f.toLowerCase().trim());
  for (const p of allPages) {
    if (matchedPages.some(mp => mp.id === p.id)) continue;
    const pName = p.name.toLowerCase().trim();
    const pPath = p.path.replace(/^\/+/, '').toLowerCase().trim();
    if (
      featureNames.some(
        fn =>
          fn === pName ||
          (pName.length >= 3 && (fn.includes(pName) || pName.includes(fn))) ||
          (pPath.length >= 3 && fn === pPath)
      )
    ) {
      matchedPages.push(p);
    }
  }

  let pageContext: PagePromptContext | null = null;
  if (matchedPages.length > 0) {
    const seenSelectors = new Set<string>();
    const mergedElements: ScannedPageElement[] = [];
    for (const mp of matchedPages) {
      for (const el of parseElements(mp.elements)) {
        if (el && typeof el.selector === 'string' && el.selector && !seenSelectors.has(el.selector)) {
          seenSelectors.add(el.selector);
          mergedElements.push(el);
        }
      }
    }
    const primary = matchedPages[0];
    pageContext = {
      name: matchedPages.map(p => p.name).join(' / '),
      path: primary.path,
      description: matchedPages.map(p => p.description).filter(Boolean).join('\n') || null,
      requiresAuth: matchedPages.some(p => p.requiresAuth),
      loginPath: '/login',
      elements: mergedElements,
    };
  }

  // Detect scraped Login Page in the project so login steps in beforeEach use real selectors
  let loginPageContext: PagePromptContext | null = null;
  const loginPage = allPages.find(
    p =>
      p.path.toLowerCase().includes('login') ||
      p.name.toLowerCase().includes('login')
  );
  if (loginPage && pageContext) {
    pageContext.loginPath = loginPage.path || '/login';
  }
  if (loginPage && (!pageContext || loginPage.id !== matchedPages[0]?.id || matchedPages.length > 1)) {
    const loginEls = parseElements(loginPage.elements);
    if (loginEls.length > 0) {
      loginPageContext = {
        name: loginPage.name,
        path: loginPage.path,
        description: loginPage.description,
        elements: loginEls,
      };
    }
  }

  // Build prompt
  const prompt = buildAutomationPrompt(tool, name, grouped, description, baseUrl, pageContext, loginPageContext);

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
    if (result.truncated) {
      // A truncated response is likely incomplete/syntactically broken —
      // treat it the same as an AI failure (fall back to the deterministic
      // template) rather than silently persisting broken code as a success.
      truncated = true;
      throw new Error('AI response was truncated (hit max_tokens)');
    }
    script = result.script;
  } catch (aiErr) {
    console.warn('[Automation] AI failed, using fallback template:', aiErr);
    script = generateFallbackScript(tool, name, grouped, baseUrl, pageContext, loginPageContext);
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

  return { script: automationScript, tool, truncated };
}

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

    const result = await runGenerateAutomation(parseResult.data);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Automation Generate]', err);
    const status = err instanceof HttpError ? err.status : 500;
    return res.status(status).json({ success: false, error: (err as Error).message });
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
        const result = await prisma.testCase.updateMany({
          where: { id: { in: testCaseIds } },
          data: { automationStatus: newAutomationStatus },
        });
        // Actual rows touched, not the stored id-list length — testCaseIds is
        // a denormalized JSON blob, so some ids may no longer exist.
        updatedTestCaseCount = result.count;
      }
    }

    return res.json({ success: true, script: updated, updatedTestCaseCount });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Helper: sync automation run results back to linked TestCase rows
async function syncAutomationRunResults(
  linkedIds: string[],
  summary: Awaited<ReturnType<typeof runAutomationScript>>,
  testedBy?: string
): Promise<number> {
  if (linkedIds.length === 0) return 0;

  const linkedCases = await prisma.testCase.findMany({
    where: { id: { in: linkedIds } },
    orderBy: [{ featureModule: 'asc' }, { testCaseId: 'asc' }],
  });

  const today = new Date().toISOString().slice(0, 10);
  const matchedDbIds = new Set<string>();
  let updatedTestCaseCount = 0;

  for (let i = 0; i < summary.results.length; i++) {
    const runItem = summary.results[i];
    const targetTc =
      (runItem.testCaseId
        ? linkedCases.find(tc => tc.testCaseId.toUpperCase() === runItem.testCaseId!.toUpperCase())
        : undefined) ||
      linkedCases.find(
        tc =>
          !matchedDbIds.has(tc.id) &&
          (runItem.title.toLowerCase().includes(tc.testScenario.toLowerCase()) ||
            tc.testScenario.toLowerCase().includes(runItem.title.toLowerCase()))
      ) ||
      (!matchedDbIds.has(linkedCases[i]?.id || '') ? linkedCases[i] : undefined);

    if (targetTc && !matchedDbIds.has(targetTc.id)) {
      matchedDbIds.add(targetTc.id);
      const isPassed = runItem.status === 'passed';
      await prisma.testCase.update({
        where: { id: targetTc.id },
        data: {
          testingResult: isPassed ? 'Passed' : 'Failed',
          actualResult: isPassed
            ? `Automation Passed (${runItem.durationMs}ms)`
            : `Automation Failed: ${(runItem.error || 'Unknown error').slice(0, 250)}`,
          bugNote: isPassed ? null : (runItem.error || 'Automation test failed').slice(0, 500),
          testDate: today,
          ...(testedBy ? { testBy: testedBy } : {}),
          automationStatus: 'Automated',
        },
      });
      updatedTestCaseCount++;
    }
  }
  return updatedTestCaseCount;
}

// POST /api/automation/run-direct — directly run Playwright automation for selected feature(s)
// with live browser preview, auto-generating or reusing the Playwright script behind the scenes.
const RunDirectAutomationSchema = z.object({
  projectId: z.string().min(1),
  featureModules: z.array(z.string().min(1)).min(1),
  pageId: z.string().optional(),
  headless: z.boolean().optional().default(false),
  forceRegenerate: z.boolean().optional().default(false),
  testedBy: z.string().optional(),
});

router.post('/run-direct', async (req: Request, res: Response) => {
  try {
    const parseResult = RunDirectAutomationSchema.safeParse(req.body || {});
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: parseResult.error.flatten(),
      });
    }

    const { projectId, featureModules, pageId, headless, forceRegenerate, testedBy } = parseResult.data;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const defaultName =
      featureModules.length === 1
        ? `${featureModules[0]} Tests`
        : `${project.name} - ${featureModules.length} Features`;

    // Check if we already have a Playwright script for this feature set
    let targetScript = !forceRegenerate
      ? await prisma.automationScript.findFirst({
          where: {
            projectId,
            name: defaultName,
            tool: 'playwright',
          },
          orderBy: { updatedAt: 'desc' },
        })
      : null;

    if (
      !targetScript ||
      targetScript.generationSource === 'fallback' ||
      targetScript.script.includes('TODO_SELECTOR') ||
      targetScript.script.includes('Forgot password?')
    ) {
      const oldScriptId = targetScript?.id;
      const generated = await runGenerateAutomation({
        projectId,
        name: defaultName,
        tool: 'playwright',
        groupBy: 'feature',
        featureModules,
        pageId,
      });
      if (oldScriptId && oldScriptId !== generated.script.id) {
        await prisma.automationScript.delete({ where: { id: oldScriptId } }).catch(() => {});
      }
      targetScript = generated.script;
    }

    const summary = await runAutomationScript({
      script: targetScript.script,
      tool: 'playwright',
      baseUrl: project.projectUrl,
      headless,
    });

    const updatedScript = await prisma.automationScript.update({
      where: { id: targetScript.id },
      data: { status: 'Automated' },
    });

    const linkedIds = safeParseIdArray(targetScript.testCaseIds);
    const updatedTestCaseCount = await syncAutomationRunResults(linkedIds, summary, testedBy);

    return res.json({
      success: true,
      summary,
      updatedTestCaseCount,
      script: updatedScript,
    });
  } catch (err) {
    console.error('[Automation Run Direct]', err);
    const status = err instanceof HttpError ? err.status : 500;
    return res.status(status).json({
      success: false,
      error: (err as Error).message || 'Gagal menjalankan automation',
    });
  }
});

// POST /api/automation/:id/run — execute the automation script locally and sync results to TestCase rows
const RunAutomationSchema = z.object({
  headless: z.boolean().optional().default(false),
  script: z.string().optional(),
  testedBy: z.string().optional(),
});

router.post('/:id/run', async (req: Request, res: Response) => {
  try {
    const parseResult = RunAutomationSchema.safeParse(req.body || {});
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: 'Invalid input' });
    }
    const { headless, script: overrideScript, testedBy } = parseResult.data;

    const existing = await prisma.automationScript.findUnique({
      where: { id: req.params.id },
      include: { project: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Script not found' });
    }

    const scriptToRun = overrideScript !== undefined ? overrideScript : existing.script;
    const tool = (SUPPORTED_TOOLS.includes(existing.tool as AutomationTool) ? existing.tool : 'playwright') as AutomationTool;

    const summary = await runAutomationScript({
      script: scriptToRun,
      tool,
      baseUrl: existing.project.projectUrl,
      headless,
    });

    // Save any script edits and mark script as Automated
    const updatedScript = await prisma.automationScript.update({
      where: { id: existing.id },
      data: {
        ...(overrideScript !== undefined ? { script: overrideScript } : {}),
        status: 'Automated',
      },
    });

    // Sync results back to linked TestCase rows
    const linkedIds = safeParseIdArray(existing.testCaseIds);
    const updatedTestCaseCount = await syncAutomationRunResults(linkedIds, summary, testedBy);

    return res.json({
      success: true,
      summary,
      updatedTestCaseCount,
      script: updatedScript,
    });
  } catch (err) {
    console.error('[Automation Run]', err);
    return res.status(500).json({
      success: false,
      error: (err as Error).message || 'Gagal menjalankan automation script',
    });
  }
});

// DELETE /api/automation/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.automationScript.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Script not found' });

    const testCaseIds = safeParseIdArray(existing.testCaseIds);

    const [revertResult] = await prisma.$transaction([
      prisma.testCase.updateMany({
        where: { id: { in: testCaseIds } },
        data: { automationStatus: 'Not Automated' },
      }),
      prisma.automationScript.delete({ where: { id: req.params.id } }),
    ]);

    // Actual rows reverted, not the stored id-list length (some ids may no
    // longer exist — testCaseIds is a denormalized JSON blob, not a relation).
    return res.json({ success: true, updatedTestCaseCount: revertResult.count });
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

interface ScannedPageElement {
  selector: string;
  tag?: string;
  role?: string;
  text?: string;
}

interface PagePromptContext {
  name: string;
  path: string;
  description: string | null;
  requiresAuth?: boolean;
  loginPath?: string;
  elements: ScannedPageElement[];
}

function getSystemPrompt(tool: AutomationTool): string {
  const selectorPrinciple =
    'CRITICAL SELECTOR RULE: Whenever VALIDATED ELEMENTS from a live DOM scan are provided in PAGE CONTEXT or LOGIN PAGE CONTEXT, you MUST use those exact scraped selectors (e.g. via page.locator(...) in Playwright or cy.get(...) in Cypress) instead of inventing selectors or ignoring them. Only use text/role fallbacks when an element was not part of the scan (such as a newly opened modal dialog).';
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

function formatToolLocator(tool: AutomationTool, selector: string): string {
  const escaped = escapeForSingleQuotedString(selector);
  if (tool === 'playwright') {
    return `page.locator('${escaped}')`;
  }
  if (tool === 'cypress') {
    // Playwright `:has-text("...")` pseudo-selector translates cleanly to cy.contains(tag, text) in Cypress
    const hasTextMatch = selector.match(/^([a-z0-9_-]+):has-text\("(.+)"\)$/i);
    if (hasTextMatch) {
      return `cy.contains('${escapeForSingleQuotedString(hasTextMatch[1])}', '${escapeForSingleQuotedString(hasTextMatch[2])}')`;
    }
    return `cy.get('${escaped}')`;
  }
  const hasTextMatch = selector.match(/^([a-z0-9_-]+):has-text\("(.+)"\)$/i);
  if (hasTextMatch) {
    return `driver.findElement(By.xpath("//${hasTextMatch[1]}[contains(normalize-space(.), '${escapeForSingleQuotedString(hasTextMatch[2])}')]"))`;
  }
  return `driver.findElement(By.css('${escaped}'))`;
}

function formatPageElementsForTool(elements: unknown[], tool: AutomationTool): string {
  const lines: string[] = [];
  for (const raw of elements) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    const selector = typeof e.selector === 'string' ? e.selector : '';
    if (!selector) continue;
    const tag = typeof e.tag === 'string' ? e.tag : '';
    const role = typeof e.role === 'string' ? e.role : '';
    const text = typeof e.text === 'string' ? e.text : '';
    const meta = [role, text].filter(Boolean).join(':');
    const tagPrefix = tag ? `<${tag}> ` : '';
    const locatorCode = formatToolLocator(tool, selector);
    lines.push(`  - ${tagPrefix}${selector}${meta ? '  →  ' + meta : ''}   [Use: ${locatorCode}]`);
  }
  return lines.length > 0 ? lines.join('\n') : '  (no readable elements)';
}

function matchElementsForTestCase(
  tc: { testScenario: string; actionStep: string; testData?: string | null; expectedResult: string },
  elements: ScannedPageElement[]
): ScannedPageElement[] {
  if (!elements || elements.length === 0) return [];
  const haystack = `${tc.testScenario} ${tc.actionStep} ${tc.testData || ''} ${tc.expectedResult}`.toLowerCase();
  const matched: ScannedPageElement[] = [];

  for (const el of elements) {
    if (!el || !el.selector) continue;
    const selLower = el.selector.toLowerCase();
    const textLower = (el.text || '').toLowerCase().trim();
    if (
      haystack.includes(selLower) ||
      (textLower.length >= 3 && haystack.includes(textLower)) ||
      (selLower.includes('search') && (haystack.includes('search') || haystack.includes('cari') || haystack.includes('pencarian') || haystack.includes('filter'))) ||
      (selLower.includes('add') && (haystack.includes('add') || haystack.includes('tambah') || haystack.includes('buat') || haystack.includes('create'))) ||
      (selLower.includes('email') && (haystack.includes('email') || haystack.includes('username') || haystack.includes('login'))) ||
      (selLower.includes('password') && (haystack.includes('password') || haystack.includes('kata sandi') || haystack.includes('login')))
    ) {
      matched.push(el);
    }
  }
  return matched;
}

function extractCredentialsFromCases(
  grouped: Record<string, Array<{ precondition?: string | null; actionStep: string; testData?: string | null }>>
): { username?: string; password?: string } {
  for (const cases of Object.values(grouped)) {
    for (const tc of cases) {
      const combined = `${tc.testData || ''}\n${tc.precondition || ''}\n${tc.actionStep || ''}`;
      const userMatch = combined.match(/(?:username|email|user)\s*[:=]\s*([^\s,;|\n]+)/i);
      const passMatch = combined.match(/(?:password|pass|kata\s*sandi)\s*[:=]\s*([^\s,;|\n]+)/i);
      if (userMatch && passMatch) {
        return { username: userMatch[1].trim(), password: passMatch[1].trim() };
      }
    }
  }
  return {};
}

function buildAutomationPrompt(
  tool: AutomationTool,
  name: string,
  grouped: Record<string, Array<{ testCaseId: string; testScenario: string; type: string; precondition?: string | null; actionStep: string; testData?: string | null; expectedResult: string }>>,
  description?: string,
  baseUrl?: string | null,
  pageContext?: PagePromptContext | null,
  loginPageContext?: PagePromptContext | null
): string {
  const ext = getFileExtension(tool);
  const toolName = tool.charAt(0).toUpperCase() + tool.slice(1);
  const cleanBase = baseUrl ? baseUrl.replace(/\/+$/, '') : null;
  const targetUrl = cleanBase && pageContext?.path
    ? `${cleanBase}${pageContext.path.startsWith('/') ? pageContext.path : '/' + pageContext.path}`
    : baseUrl;

  const urlNote = baseUrl
    ? `BASE URL of the application under test: ${baseUrl}${targetUrl && targetUrl !== baseUrl ? `\nTARGET PAGE URL: ${targetUrl} (path: ${pageContext?.path})` : ''}`
    : 'BASE URL: unknown — use TODO_URL placeholder and add a comment: // TODO: Replace with actual URL';

  const creds = extractCredentialsFromCases(grouped);

  const loginFormElements = loginPageContext?.elements.filter(
    e => e.tag === 'input' || e.role?.startsWith('input') || e.tag === 'button' || e.role === 'button'
  ) || [];

  const loginNote = loginFormElements.length > 0 && loginPageContext ? `
LOGIN PAGE CONTEXT (${loginPageContext.name}, path: ${loginPageContext.path}):
Use these exact scraped Login form selectors inside beforeEach() when logging in${creds.username ? ` (Credentials found in test data: username="${creds.username}", password="${creds.password}")` : ''}:
${formatPageElementsForTool(loginFormElements, tool)}
` : '';

  const pageNote = pageContext ? `
TARGET PAGE CONTEXT (${pageContext.name}, path: ${pageContext.path}):
${pageContext.description ? pageContext.description + '\n' : ''}${
    pageContext.elements.length > 0
      ? `MANDATORY SCRAPED SELECTORS ON THIS PAGE (verified from live DOM scan — YOU MUST USE THESE EXACT SELECTORS in your generated code instead of guessing or inventing locators):\n${formatPageElementsForTool(pageContext.elements, tool)}\n`
      : '(No scanned elements yet for this page — use text/role-based locators or TODO_SELECTOR.)'
  }
` : '';

  const featuresText = Object.entries(grouped).map(([feature, cases]) => {
    const casesText = cases.map(tc => {
      const matchedEls = pageContext?.elements ? matchElementsForTestCase(tc, pageContext.elements) : [];
      const matchedLine = matchedEls.length > 0
        ? `\n    REQUIRED SCRAPED SELECTORS FOR THIS TEST CASE:\n${matchedEls.map(e => `      * ${formatToolLocator(tool, e.selector)}  (for ${e.role || e.tag || 'element'}: "${e.text || e.selector}")`).join('\n')}`
        : '';
      const hints = extractQuotedLabels([tc.testScenario, tc.actionStep, tc.testData, tc.expectedResult].join(' '));
      const hintLine = hints.length > 0
        ? `\n    UI text/labels mentioned in steps (use for modal fields/assertions not in top-level scan): ${hints.map(h => `"${h}"`).join(', ')}`
        : '';
      return `
    Test Case ID: ${tc.testCaseId}
    Scenario: ${tc.testScenario}
    Type: ${tc.type}
    Precondition: ${tc.precondition || 'None'}
    Action Steps: ${tc.actionStep}
    Test Data: ${tc.testData || 'None'}
    Expected Result: ${tc.expectedResult}${matchedLine}${hintLine}
`;
    }).join('\n---\n');

    return `
=== FEATURE: ${feature} ===
${casesText}`;
  }).join('\n\n');

  const selectorPriority = getSelectorPriorityList(tool);

  return `Generate a ${toolName} automation test file (${ext}) named "${name}" for the following test cases, grouped by feature.

${description ? `DESCRIPTION: ${description}\n` : ''}
${urlNote}
${loginNote}${pageNote}
${featuresText}

RULES:
1. Group tests using describe() per feature module.
2. Each test case = one it()/test() block with the Test Case ID and exact Bahasa Indonesia Scenario title in the name, e.g. '[TC001] ${Object.values(grouped)[0]?.[0]?.testScenario || 'Skenario pengujian'}'. Do NOT translate the test title into English.
3. MANDATORY SELECTOR RULE (HIGHEST PRIORITY):
   a. For every element listed in "MANDATORY SCRAPED SELECTORS ON THIS PAGE" or "REQUIRED SCRAPED SELECTORS FOR THIS TEST CASE" or "LOGIN PAGE CONTEXT", you MUST use the exact scraped selector shown in [Use: ...] (e.g. ${tool === 'playwright' ? `page.locator('input[placeholder="Search labels..."]'), page.locator('button:has-text("Add Label")'), page.locator('#email'), page.locator('#password')` : tool === 'cypress' ? `cy.get('input[placeholder="Search labels..."]'), cy.contains('button', 'Add Label'), cy.get('#email')` : `driver.findElement(By.css('#email'))`}).
   b. DO NOT replace scraped selectors with generic guessed selectors! The user specifically scraped the page so these exact selectors are used in the script.
   c. Only for elements that appear dynamically after clicking a button (such as inputs/buttons inside a popup modal that were not part of the initial page scan), use accessible text/label/placeholder locators from the test step text:
   ${selectorPriority}
4. In beforeEach():
   - If the page requires login or test cases include credentials (e.g. Username/Password), navigate to the login URL (${cleanBase ? `${cleanBase}${pageContext?.loginPath || loginPageContext?.path || '/login'}` : '/login'}), fill the scraped <input> login fields (${loginFormElements.length ? loginFormElements.map(e => e.selector).join(', ') : '#email, #password, button:has-text("Login")'}) with the credentials from Test Data${creds.username ? ` ("${creds.username}" / "${creds.password}")` : ''}, click the Login submit button, wait briefly for redirect, and then navigate to the target page (${targetUrl || pageContext?.path || '/'}).
5. Keep tests independent — each test should work standalone.
6. Return ONLY valid executable ${toolName} code, no markdown fences, no prose explanation.`;
}

// Tool-specific preferred-locator ordering, shown to the AI as a fallback
// when PAGE CONTEXT doesn't have a matching element and there are no quoted
// UI labels to anchor on. Format mirrors what the test will actually contain
// so the model can copy-paste and adapt it.
export function getSelectorPriorityList(tool: AutomationTool): string {
  if (tool === 'playwright') {
    return `1. page.getByTestId('xxx')         // if a data-testid is conventionally used
2. page.getByRole('role', { name: 'Visible Label' })  // accessible name match
3. page.getByLabel('Field Label')            // form-field label
4. page.locator('#knownId')                  // real id you saw in DOM/devtools
5. page.getByText('Visible Text')            // last resort among textual options
6. 'TODO_SELECTOR' with // TODO: verify selector - not in validated library`;
  }
  if (tool === 'cypress') {
    return `1. cy.get('[data-cy="xxx"]') / cy.get('[data-testid="xxx"]')  // stable test attribute
2. cy.contains('button', 'Visible Label')    // role + text combo
3. cy.contains('Field Label')                // plain label match
4. cy.get('#knownId')                        // real id from DOM
5. cy.contains('Visible Text')               // last resort
6. cy.get('TODO_SELECTOR') with // TODO: verify selector - not in validated library`;
  }
  // selenium
  return `1. driver.findElement(By.css('[data-testid="xxx"]'))   // stable test attribute
2. driver.findElement(By.xpath("//*[contains(text(),'Visible Text')]"))  // text-based
3. driver.findElement(By.xpath("//label[contains(., 'Label')]/following::input[1]"))  // label
4. driver.findElement(By.id('knownId'))      // real id from DOM
5. driver.findElement(By.css('#knownId'))    // fallback css id
6. driver.findElement(By.css('TODO_SELECTOR')) with // TODO: verify selector - not in validated library`;
}

// Renders a scanned `elements` JSON array as a compact "selector → role:text"
// list for the prompt — raw JSON.dumps is too verbose for the model to scan
// quickly, and a flat list with the most useful fields per element makes it
// obvious what the AI can pick from. Unrecognised shapes degrade gracefully
// (we just print the JSON for that entry) rather than dropping it.
export function formatPageElements(elements: unknown[]): string {
  const lines: string[] = [];
  for (const raw of elements) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    const selector = typeof e.selector === 'string' ? e.selector : '';
    if (!selector) continue;
    const tag = typeof e.tag === 'string' ? e.tag : '';
    const role = typeof e.role === 'string' ? e.role : '';
    const text = typeof e.text === 'string' ? e.text : '';
    const meta = [role, text].filter(Boolean).join(':');
    const tagPrefix = tag ? `<${tag}> ` : '';
    lines.push(`  - ${tagPrefix}${selector}${meta ? '  →  ' + meta : ''}`);
  }
  return lines.length > 0 ? lines.join('\n') : '  (no readable elements)';
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

// Collapses a value to a single line, safe to splice into a `//`-prefixed
// header comment — an embedded newline there would otherwise turn everything
// after it into live, uncommented code at the top of the generated file.
function sanitizeForHeaderComment(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim();
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
  baseUrl?: string | null,
  pageContext?: PagePromptContext | null,
  loginPageContext?: PagePromptContext | null
): string {
  if (tool === 'cypress') return generateCypressFallback(name, grouped, baseUrl, pageContext, loginPageContext);
  if (tool === 'playwright') return generatePlaywrightFallback(name, grouped, baseUrl, pageContext, loginPageContext);
  return generateSeleniumFallback(name, grouped, baseUrl, pageContext, loginPageContext);
}

function generateCypressFallback(
  name: string,
  grouped: Record<string, Array<{ testCaseId: string; testScenario: string; type: string; precondition?: string | null; actionStep: string; testData?: string | null; expectedResult: string }>>,
  baseUrl?: string | null,
  pageContext?: PagePromptContext | null,
  loginPageContext?: PagePromptContext | null
): string {
  const cleanBase = baseUrl ? baseUrl.replace(/\/+$/, '') : null;
  const targetUrl = cleanBase && pageContext?.path
    ? `${cleanBase}${pageContext.path.startsWith('/') ? pageContext.path : '/' + pageContext.path}`
    : baseUrl;
  const visitUrl = targetUrl ? `'${targetUrl}'` : `'TODO_URL'`;
  const visitUrlComment = targetUrl ? '' : ' // TODO: Replace with actual URL';
  const creds = extractCredentialsFromCases(grouped);

  const loginSetupLines: string[] = [];
  if ((pageContext?.requiresAuth || creds.username) && cleanBase) {
    const loginPath = pageContext?.loginPath || loginPageContext?.path || '/login';
    const emailSel =
      loginPageContext?.elements.find(
        e => (e.tag === 'input' || e.role?.startsWith('input')) && (e.selector.toLowerCase().includes('email') || e.role?.includes('email') || e.selector.toLowerCase().includes('user'))
      )?.selector || '#email';
    const passSel =
      loginPageContext?.elements.find(
        e => (e.tag === 'input' || e.role?.startsWith('input')) && (e.selector.toLowerCase().includes('password') || e.role?.includes('password'))
      )?.selector || '#password';
    const btnSel =
      loginPageContext?.elements.find(
        e => (e.tag === 'button' || e.role === 'button') && /login|masuk|sign in|submit/i.test(`${e.selector} ${e.text || ''}`)
      )?.selector || 'button:has-text("Login")';
    loginSetupLines.push(`    cy.visit('${cleanBase}${loginPath.startsWith('/') ? loginPath : '/' + loginPath}');`);
    loginSetupLines.push(`    ${formatToolLocator('cypress', emailSel)}.type('${escapeForSingleQuotedString(creds.username || 'admin@example.com')}');`);
    loginSetupLines.push(`    ${formatToolLocator('cypress', passSel)}.type('${escapeForSingleQuotedString(creds.password || 'password')}');`);
    loginSetupLines.push(`    ${formatToolLocator('cypress', btnSel)}.click();`);
  }
  loginSetupLines.push(`    cy.visit(${visitUrl});${visitUrlComment}`);

  const describes = Object.entries(grouped).map(([feature, cases]) => {
    const its = cases.map(tc => {
      const matched = pageContext?.elements ? matchElementsForTestCase(tc, pageContext.elements) : [];
      const actionHint = safeHint(extractQuotedLabels(`${tc.actionStep} ${tc.testData || ''}`)[0]);
      const resultHint = safeHint(extractQuotedLabels(tc.expectedResult)[0]);

      let actionLine: string;
      if (matched.length > 0) {
        actionLine = matched.map(el => {
          const loc = formatToolLocator('cypress', el.selector);
          if (el.tag === 'input' || el.role?.startsWith('input')) {
            return `${loc}.should('be.visible').type('${escapeForSingleQuotedString(actionHint || 'test')}');`;
          }
          return `${loc}.should('be.visible').click();`;
        }).join('\n    ');
      } else if (actionHint) {
        actionLine = `cy.contains('${actionHint}').click();`;
      } else if (pageContext?.elements && pageContext.elements.length > 0) {
        const firstEl = pageContext.elements[0];
        actionLine = `${formatToolLocator('cypress', firstEl.selector)}.should('be.visible');`;
      } else {
        actionLine = `cy.get('TODO_SELECTOR'); // TODO: Replace selector with actual application selector`;
      }

      const assertLine = resultHint
        ? `cy.contains('${resultHint}').should('be.visible');`
        : matched.length > 0
        ? `${formatToolLocator('cypress', matched[0].selector)}.should('exist');`
        : `cy.get('body').should('be.visible');`;
      return `
  // ${tc.testCaseId} - ${tc.type}
  it('[${tc.testCaseId}] ${escapeForSingleQuotedString(tc.testScenario)}', () => {
    // Precondition: ${toCommentBlock(tc.precondition)}
    // Test Data: ${toCommentBlock(tc.testData)}
    // Action Steps:
    // ${toCommentBlock(tc.actionStep, '(none)')}
    ${actionLine}
    // Expected: ${toCommentBlock(tc.expectedResult, '(none)')}
    ${assertLine}
  });`;
    }).join('\n');

    return `
describe('${escapeForSingleQuotedString(feature)}', () => {
  beforeEach(() => {
${loginSetupLines.join('\n')}
  });
${its}
});`;
  }).join('\n\n');

  const urlComment = baseUrl ? `// Base URL: ${baseUrl}\n` : '';
  return `// ${sanitizeForHeaderComment(name)}.cy.js — Generated by QA Test Case Generator\n${urlComment}${describes}\n`;
}

function generatePlaywrightFallback(
  name: string,
  grouped: Record<string, Array<{ testCaseId: string; testScenario: string; type: string; precondition?: string | null; actionStep: string; testData?: string | null; expectedResult: string }>>,
  baseUrl?: string | null,
  pageContext?: PagePromptContext | null,
  loginPageContext?: PagePromptContext | null
): string {
  const cleanBase = baseUrl ? baseUrl.replace(/\/+$/, '') : null;
  const targetUrl = cleanBase && pageContext?.path
    ? `${cleanBase}${pageContext.path.startsWith('/') ? pageContext.path : '/' + pageContext.path}`
    : baseUrl;
  const gotoUrl = targetUrl ? `'${targetUrl}'` : `'TODO_URL'`;
  const gotoUrlComment = targetUrl ? '' : ' // TODO: Replace with actual URL';
  const creds = extractCredentialsFromCases(grouped);

  const loginSetupLines: string[] = [];
  if ((pageContext?.requiresAuth || creds.username) && cleanBase) {
    const loginPath = pageContext?.loginPath || loginPageContext?.path || '/login';
    const emailSel =
      loginPageContext?.elements.find(
        e => (e.tag === 'input' || e.role?.startsWith('input')) && (e.selector.toLowerCase().includes('email') || e.role?.includes('email') || e.selector.toLowerCase().includes('user'))
      )?.selector || '#email';
    const passSel =
      loginPageContext?.elements.find(
        e => (e.tag === 'input' || e.role?.startsWith('input')) && (e.selector.toLowerCase().includes('password') || e.role?.includes('password'))
      )?.selector || '#password';
    const btnSel =
      loginPageContext?.elements.find(
        e => (e.tag === 'button' || e.role === 'button') && /login|masuk|sign in|submit/i.test(`${e.selector} ${e.text || ''}`)
      )?.selector || 'button:has-text("Login")';
    loginSetupLines.push(`    await page.goto('${cleanBase}${loginPath.startsWith('/') ? loginPath : '/' + loginPath}');`);
    loginSetupLines.push(`    await ${formatToolLocator('playwright', emailSel)}.fill('${escapeForSingleQuotedString(creds.username || 'admin@example.com')}');`);
    loginSetupLines.push(`    await ${formatToolLocator('playwright', passSel)}.fill('${escapeForSingleQuotedString(creds.password || 'password')}');`);
    loginSetupLines.push(`    await ${formatToolLocator('playwright', btnSel)}.click();`);
    loginSetupLines.push(`    await page.waitForTimeout(1500);`);
  }
  loginSetupLines.push(`    await page.goto(${gotoUrl});${gotoUrlComment}`);

  const describes = Object.entries(grouped).map(([feature, cases]) => {
    const tests = cases.map(tc => {
      const matched = pageContext?.elements ? matchElementsForTestCase(tc, pageContext.elements) : [];
      const actionHint = safeHint(extractQuotedLabels(`${tc.actionStep} ${tc.testData || ''}`)[0]);
      const resultHint = safeHint(extractQuotedLabels(tc.expectedResult)[0]);

      let actionLine: string;
      if (matched.length > 0) {
        actionLine = matched.map(el => {
          const loc = formatToolLocator('playwright', el.selector);
          if (el.tag === 'input' || el.role?.startsWith('input')) {
            return `await ${loc}.fill('${escapeForSingleQuotedString(actionHint || 'test')}');`;
          }
          return `await ${loc}.click();`;
        }).join('\n    ');
      } else if (actionHint) {
        actionLine = `await page.getByText('${actionHint}').click();`;
      } else if (pageContext?.elements && pageContext.elements.length > 0) {
        const firstEl = pageContext.elements[0];
        actionLine = `await expect(${formatToolLocator('playwright', firstEl.selector)}).toBeVisible();`;
      } else {
        actionLine = `await page.locator('TODO_SELECTOR').click(); // TODO: Replace selector`;
      }

      const assertLine = resultHint
        ? `await expect(page.getByText('${resultHint}')).toBeVisible();`
        : matched.length > 0
        ? `await expect(${formatToolLocator('playwright', matched[0].selector)}).toBeVisible();`
        : `await expect(page.locator('body')).toBeVisible();`;
      return `
  // ${tc.testCaseId} - ${tc.type}
  test('[${tc.testCaseId}] ${escapeForSingleQuotedString(tc.testScenario)}', async ({ page }) => {
    // Precondition: ${toCommentBlock(tc.precondition)}
    // Test Data: ${toCommentBlock(tc.testData)}
    // Action Steps:
    // ${toCommentBlock(tc.actionStep, '(none)')}
    ${actionLine}
    // Expected: ${toCommentBlock(tc.expectedResult, '(none)')}
    ${assertLine}
  });`;
    }).join('\n');

    return `
test.describe('${escapeForSingleQuotedString(feature)}', () => {
  test.beforeEach(async ({ page }) => {
${loginSetupLines.join('\n')}
  });
${tests}
});`;
  }).join('\n\n');

  const urlComment = baseUrl ? `// Base URL: ${baseUrl}\n` : '';
  return `// ${sanitizeForHeaderComment(name)}.spec.ts — Generated by QA Test Case Generator\n${urlComment}import { test, expect } from '@playwright/test';\n${describes}\n`;
}

function generateSeleniumFallback(
  name: string,
  grouped: Record<string, Array<{ testCaseId: string; testScenario: string; type: string; precondition?: string | null; actionStep: string; testData?: string | null; expectedResult: string }>>,
  baseUrl?: string | null,
  pageContext?: PagePromptContext | null,
  _loginPageContext?: PagePromptContext | null
): string {
  const cleanBase = baseUrl ? baseUrl.replace(/\/+$/, '') : null;
  const targetUrl = cleanBase && pageContext?.path
    ? `${cleanBase}${pageContext.path.startsWith('/') ? pageContext.path : '/' + pageContext.path}`
    : baseUrl;
  const getUrl = targetUrl ? `'${targetUrl}'` : `'TODO_URL'`;
  const getUrlComment = targetUrl ? '' : ' // TODO: Replace with actual URL';
  const describes = Object.entries(grouped).map(([feature, cases]) => {
    const its = cases.map(tc => {
      const matched = pageContext?.elements ? matchElementsForTestCase(tc, pageContext.elements) : [];
      const actionHint = safeHint(extractQuotedLabels(`${tc.actionStep} ${tc.testData || ''}`)[0]);
      const findLine = matched.length > 0
        ? `const el = await ${formatToolLocator('selenium', matched[0].selector)};`
        : actionHint
        ? `const el = await driver.findElement(By.xpath("//*[contains(text(),'${actionHint}')]"));`
        : `const el = await driver.findElement(By.css('TODO_SELECTOR')); // TODO: Replace selector`;
      return `
  // ${tc.testCaseId} - ${tc.type}
  it('[${tc.testCaseId}] ${escapeForSingleQuotedString(tc.testScenario)}', async () => {
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
describe('${escapeForSingleQuotedString(feature)}', () => {
  before(async () => { /* TODO: init driver */ });
  after(async () => { await driver.quit(); });
${its}
});`;
  }).join('\n\n');

  const urlComment = baseUrl ? `// Base URL: ${baseUrl}\n` : '';
  return `// ${sanitizeForHeaderComment(name)}.test.js — Generated by QA Test Case Generator\n${urlComment}const { Builder, By } = require('selenium-webdriver');\nlet driver;\n${describes}\n`;
}

export default router;
