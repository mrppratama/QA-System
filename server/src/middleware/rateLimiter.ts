import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response } from 'express';
import type { AuthedRequest } from './auth';

// Limits calls to the paid AI provider. Keyed by the authenticated user
// (set by requireAuth, which always runs before these routes) so one user
// hammering the endpoint can't starve out the rest of the team, falling
// back to IP only if req.user is somehow missing.
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (req as AuthedRequest).user?.id || ipKeyGenerator(req.ip || ''),
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Terlalu banyak permintaan AI generation. Coba lagi dalam beberapa saat.',
    });
  },
});
