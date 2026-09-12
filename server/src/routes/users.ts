import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// GET /api/users — registered (Supabase Auth) users, for pickers like "Test By".
// Intentionally minimal: id + email + optional display name (self-set via
// user_metadata.full_name) — nothing else from the auth record.
router.get('/', async (_req: Request, res: Response) => {
  if (!supabase) {
    return res.status(503).json({ success: false, error: 'Auth is not configured on the server' });
  }
  try {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    const users = data.users
      .filter((u): u is typeof u & { email: string } => !!u.email)
      .map(u => ({
        id: u.id,
        email: u.email,
        name: typeof u.user_metadata?.full_name === 'string' ? u.user_metadata.full_name : undefined,
      }))
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    return res.json({ success: true, users });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
