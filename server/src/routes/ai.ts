import { Router, Request, Response } from 'express';
import { createAIProvider } from '../services/ai';
import { GenerateInput, GenerateInputSchema, GenerateResultSchema } from '../validators/testcase.validator';
import { prisma } from '../lib/prisma';
import { aiRateLimiter } from '../middleware/rateLimiter';
import { HttpError } from '../lib/httpError';

const router = Router();

// Core generation logic, extracted so it can be called both from the
// synchronous route below and from the background job runner (routes/jobs.ts)
// used to dodge Vercel's request/response timeout for slow AI calls.
export async function runGenerateTestCases(input: GenerateInput) {
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
    throw new HttpError(502, lastError?.message || 'AI generation failed after retries');
  }

  // Validate AI response with Zod
  const validationResult = GenerateResultSchema.safeParse(result);
  if (!validationResult.success) {
    throw new HttpError(502, 'AI returned invalid response format. Please retry.', validationResult.error.flatten());
  }

  const validated = validationResult.data;

  // Return generated test cases WITHOUT saving to DB
  // Saving is done via /api/projects/:id/save-test-cases
  return {
    testCases: validated.testCases.map((tc, i) => ({
      tempId: `TC${String(i + 1).padStart(3, '0')}`, // temporary ID for display
      ...tc,
    })),
    count: validated.testCases.length,
  };
}

router.post('/generate-test-cases', aiRateLimiter, async (req: Request, res: Response) => {
  try {
    const parseResult = GenerateInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: parseResult.error.flatten(),
      });
    }

    const result = await runGenerateTestCases(parseResult.data);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[Generate] Error:', err);
    const status = err instanceof HttpError ? err.status : 500;
    const details = err instanceof HttpError ? err.details : undefined;
    return res.status(status).json({
      success: false,
      error: (err as Error).message || 'Internal server error',
      ...(details ? { details } : {}),
      // Only the "no result after retries" 502 is a provider/config problem —
      // the "AI returned invalid response format" 502 (which carries `details`
      // instead) means the provider responded fine, it just wasn't valid JSON,
      // so the config hint would be misleading there.
      ...(status === 502 && !details ? { hint: 'Check NINE_ROUTER_BASE_URL and NINE_ROUTER_API_KEY configuration.' } : {}),
    });
  }
});

export default router;
