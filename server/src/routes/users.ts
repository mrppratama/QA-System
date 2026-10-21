import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /api/users — registered users (or distinct local testers when running in local mode), for pickers like "Test By".
router.get('/', async (_req: Request, res: Response) => {
  if (!supabase || process.env.LOCAL_MODE === 'true') {
    try {
      const [tcTesters, setTesters] = await Promise.all([
        prisma.testCase.findMany({
          where: { testBy: { not: null } },
          distinct: ['testBy'],
          select: { testBy: true },
        }),
        prisma.testCaseSet.findMany({
          where: { testedBy: { not: null } },
          distinct: ['testedBy'],
          select: { testedBy: true },
        }),
      ]);

      const names = new Set<string>(['Pratama']);
      for (const r of tcTesters) {
        if (r.testBy?.trim()) names.add(r.testBy.trim());
      }
      for (const r of setTesters) {
        if (r.testedBy?.trim()) names.add(r.testedBy.trim());
      }

      const users = Array.from(names)
        .sort((a, b) => a.localeCompare(b))
        .map((name, idx) => ({
          id: `local-${idx + 1}`,
          email: `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@local.qa`,
          name,
        }));

      return res.json({ success: true, users });
    } catch (err) {
      return res.status(500).json({ success: false, error: (err as Error).message });
    }
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
