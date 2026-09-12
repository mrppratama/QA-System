import { Router, Request, Response } from 'express';
import { createAIProvider } from '../services/ai';
import { GenerateInputSchema, GenerateResultSchema } from '../validators/testcase.validator';
import { prisma } from '../lib/prisma';

const router = Router();

router.post('/generate-test-cases', async (req: Request, res: Response) => {
  try {
    // Validate input
    const parseResult = GenerateInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: parseResult.error.flatten(),
      });
    }

    const input = parseResult.data;

    // If projectId provided but no projectUrl, try fetching from DB
    if (input.projectId && !input.projectUrl) {
      try {
        const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { projectUrl: true } });
        if (project?.projectUrl) (input as typeof input & { projectUrl?: string }).projectUrl = project.projectUrl;
      } catch { /* non-fatal */ }
    }

    const aiProvider = createAIProvider();

    let result;
    let lastError: Error | null = null;

    // Retry only if there's still enough time left in the Vercel function's
    // maxDuration (see vercel.json) — otherwise a slow/timed-out first attempt
    // plus a full-length retry would exceed the platform limit and get killed
    // with an opaque 504 instead of the error handling below.
    const startedAt = Date.now();
    const FUNCTION_BUDGET_MS = 55_000; // stay under vercel.json's 60s maxDuration
    const RETRY_DELAY_MS = 500;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await aiProvider.generateTestCases(input);
        break;
      } catch (err) {
        lastError = err as Error;
        const elapsed = Date.now() - startedAt;
        const canRetry = attempt === 0 && elapsed + RETRY_DELAY_MS < FUNCTION_BUDGET_MS;
        if (canRetry) {
          console.warn('[AI] First attempt failed, retrying...', err);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        } else {
          break;
        }
      }
    }

    if (!result) {
      return res.status(502).json({
        success: false,
        error: lastError?.message || 'AI generation failed after retries',
        hint: 'Check NINE_ROUTER_BASE_URL and NINE_ROUTER_API_KEY configuration.',
      });
    }

    // Validate AI response with Zod
    const validationResult = GenerateResultSchema.safeParse(result);
    if (!validationResult.success) {
      return res.status(502).json({
        success: false,
        error: 'AI returned invalid response format. Please retry.',
        details: validationResult.error.flatten(),
      });
    }

    const validated = validationResult.data;

    // Return generated test cases WITHOUT saving to DB
    // Saving is done via /api/projects/:id/save-test-cases
    return res.json({
      success: true,
      testCases: validated.testCases.map((tc, i) => ({
        tempId: `TC${String(i + 1).padStart(3, '0')}`, // temporary ID for display
        ...tc,
      })),
      count: validated.testCases.length,
    });
  } catch (err) {
    console.error('[Generate] Error:', err);
    return res.status(500).json({
      success: false,
      error: (err as Error).message || 'Internal server error',
    });
  }
});

export default router;
