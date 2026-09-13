import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

const router = Router();

const CreatePageSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1).optional(),
  description: z.string().optional(),
  requiresAuth: z.boolean().optional(),
});

const UpdatePageSchema = z.object({
  name: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  description: z.string().optional(),
  requiresAuth: z.boolean().optional(),
});

// GET /api/pages?projectId=xxx
router.get('/', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId query param required' });
    }
    const pages = await prisma.page.findMany({
      where: { projectId: projectId as string },
      orderBy: { createdAt: 'asc' },
    });
    return res.json({ success: true, pages });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/pages
router.post('/', async (req: Request, res: Response) => {
  try {
    const parseResult = CreatePageSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: parseResult.error.flatten() });
    }
    const { projectId, name, path, description, requiresAuth } = parseResult.data;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const page = await prisma.page.create({
      data: { projectId, name, path: path || '/', description, requiresAuth: requiresAuth ?? false },
    });
    return res.json({ success: true, page });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// PUT /api/pages/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const parseResult = UpdatePageSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: 'Invalid input', details: parseResult.error.flatten() });
    }
    const existing = await prisma.page.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Page not found' });

    const page = await prisma.page.update({ where: { id: req.params.id }, data: parseResult.data });
    return res.json({ success: true, page });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// DELETE /api/pages/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.page.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Page not found' });

    await prisma.page.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/pages/:id/scan
// Not wired up to a real hosted-browser API yet — this is deliberately a
// clear, honest stub rather than a fake success. Plug a real client in here
// (e.g. via SCRAPER_API_KEY / SCRAPER_WS_ENDPOINT env vars, connecting with
// playwright-core/puppeteer-core to a service like Browserless/Browserbase)
// when that's actually set up.
router.post('/:id/scan', async (req: Request, res: Response) => {
  try {
    const page = await prisma.page.findUnique({ where: { id: req.params.id }, include: { project: true } });
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });

    if (page.requiresAuth) {
      return res.status(501).json({
        success: false,
        error: 'Halaman yang butuh login belum didukung untuk scan otomatis. Isi deskripsi/elemen secara manual dulu.',
      });
    }

    if (!page.project.projectUrl) {
      return res.status(400).json({
        success: false,
        error: 'Project URL belum diisi. Isi dulu di halaman Projects sebelum scan halaman ini.',
      });
    }

    const scraperConfigured = !!process.env.SCRAPER_API_KEY;
    if (!scraperConfigured) {
      return res.status(501).json({
        success: false,
        error: 'Page scanning belum dikonfigurasi. Perlu setup hosted browser API (misal Browserless/Browserbase) dan set SCRAPER_API_KEY di environment variables server.',
      });
    }

    // Real scan would happen here once SCRAPER_API_KEY is configured.
    return res.status(501).json({ success: false, error: 'Scraper client not implemented yet.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
