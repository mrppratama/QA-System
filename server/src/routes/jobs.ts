import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { waitUntil } from '@vercel/functions';
import { prisma } from '../lib/prisma';
import { aiRateLimiter } from '../middleware/rateLimiter';
import { GenerateInputSchema, GenerateInput } from '../validators/testcase.validator';
import { runGenerateTestCases } from './ai';
import { runGenerateAutomation, GenerateAutomationSchema } from './automation';

const router = Router();

type JobType = 'test-case' | 'automation';

const StartJobSchema = z.object({
  type: z.enum(['test-case', 'automation']),
  payload: z.record(z.any()),
});

// `GenerateInput` (test-case payloads) can carry real credentials for the
// app under test (`username`/`password`). Those are needed in-memory to run
// the actual generation, but have no reason to be persisted at rest in the
// job row — redact them from what gets written to `GenerationJob.input`.
function redactForStorage(payload: Record<string, unknown>): Record<string, unknown> {
  const { username, password, ...rest } = payload;
  return {
    ...rest,
    ...(username !== undefined ? { username: '[redacted]' } : {}),
    ...(password !== undefined ? { password: '[redacted]' } : {}),
  };
}

// Runs the actual (possibly slow) generation work in the background, after
// the HTTP response for POST /api/jobs has already been sent — this is what
// lets the client stop blocking on a single request/response cycle. Note:
// this does NOT lift Vercel's maxDuration ceiling — the invocation that
// creates the job is the same one `waitUntil` keeps alive to run this, so a
// call that genuinely needs longer than maxDuration still gets killed, just
// without the client hanging on an open connection while it happens.
async function processJob(jobId: string, type: JobType, payload: GenerateInput | z.infer<typeof GenerateAutomationSchema>) {
  try {
    await prisma.generationJob.update({ where: { id: jobId }, data: { status: 'processing' } });

    const result = type === 'test-case'
      ? await runGenerateTestCases(payload as GenerateInput)
      : await runGenerateAutomation(payload as z.infer<typeof GenerateAutomationSchema>);

    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: 'completed', result: JSON.stringify(result) },
    });
  } catch (err) {
    console.error(`[Job ${jobId}] failed:`, err);
    // Best-effort — if the process is being killed by the platform right now
    // (hard maxDuration timeout), this update may never land, and the job
    // stays stuck at 'processing' forever. Callers must give up polling after
    // a reasonable ceiling rather than assume this always fires.
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: (err as Error).message || 'Unknown error' },
    }).catch(() => { /* nothing more we can do */ });
  }
}

// POST /api/jobs — start a background generation job, return immediately.
router.post('/', aiRateLimiter, async (req: Request, res: Response) => {
  try {
    const parseResult = StartJobSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: parseResult.error.flatten() });
    }
    const { type, payload } = parseResult.data;

    const schema = type === 'test-case' ? GenerateInputSchema : GenerateAutomationSchema;
    const payloadResult = schema.safeParse(payload);
    if (!payloadResult.success) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: payloadResult.error.flatten() });
    }
    const validatedPayload = payloadResult.data;

    const projectId = typeof (validatedPayload as { projectId?: unknown }).projectId === 'string'
      ? (validatedPayload as { projectId: string }).projectId
      : null;

    const job = await prisma.generationJob.create({
      data: {
        type,
        status: 'pending',
        input: JSON.stringify(redactForStorage(validatedPayload as Record<string, unknown>)),
        projectId,
      },
    });

    // Kick off the actual work without blocking this response. `waitUntil`
    // only matters on Vercel (it keeps the invocation alive after the
    // response is sent); locally the dev server process just keeps running
    // regardless, so a plain fire-and-forget call is enough there.
    const run = () => processJob(job.id, type, validatedPayload);
    if (process.env.VERCEL) {
      waitUntil(run());
    } else {
      void run();
    }

    return res.json({ success: true, jobId: job.id });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/jobs/:id — poll for job status/result.
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const job = await prisma.generationJob.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

    let result: unknown = null;
    if (job.result) {
      try { result = JSON.parse(job.result); } catch { result = null; }
    }

    return res.json({
      success: true,
      id: job.id,
      type: job.type,
      status: job.status,
      result,
      error: job.error,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
