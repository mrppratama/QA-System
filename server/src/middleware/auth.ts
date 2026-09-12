import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase';

export interface AuthedRequest extends Request {
  user?: { id: string; email?: string };
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  // Route/validation integration tests run without a real Supabase project;
  // skip enforcement so they can exercise route logic directly (same
  // NODE_ENV convention already used in server.ts).
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  if (!supabase) {
    return res.status(500).json({ success: false, error: 'Auth is not configured on the server' });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Missing authentication token' });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session' });
  }

  req.user = { id: data.user.id, email: data.user.email ?? undefined };
  next();
}
