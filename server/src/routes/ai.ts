import { Router, Request, Response } from 'express';
import { createAIProvider } from '../services/ai';
import { GenerateInputSchema, GenerateResultSchema } from '../validators/testcase.validator';
import { prisma } from '../lib/prisma';
import { aiRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/generate-test-cases', aiRateLimiter, async (req: Request, res: Response) => {
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
    // maxDuration (see vercel.json) — each attempt is given exactly the time
    // budget remaining (not the provider's own fixed default), so a slow first
    // attempt plus a retry can never together exceed the platform limit and
    // get killed with an opaque FUNCTION_INVOCATION_TIMEOUT instead of the
    // error handling below. This budget only matters on Vercel — a local
    // `npm run dev` server has no such platform-imposed ceiling, so give it a
    // much longer budget instead of aborting real (if slow) AI responses.
    const startedAt = Date.now();
    const FUNCTION_BUDGET_MS = process.env.VERCEL ? 55_000 : 300_000;
    const SAFETY_MARGIN_MS = 3_000;    // room for validation + response after the call returns
    const MIN_ATTEMPT_MS = 10_000;     // not worth attempting with less time than this
    const RETRY_DELAY_MS = 500;

    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = FUNCTION_BUDGET_MS - (Date.now() - startedAt) - SAFETY_MARGIN_MS;
      if (remaining < MIN_ATTEMPT_MS) {
        if (!lastError) lastError = new Error('Not enough time left in this request to call the AI provider');
        break;
      }
      try {
        result = await aiProvider.generateTestCases(input, remaining);
        break;
      } catch (err) {
        lastError = err as Error;
        if (attempt === 0) {
          console.warn('[AI] First attempt failed, retrying...', err);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
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
