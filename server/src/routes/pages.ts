import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import { scanPageElementsLocal } from '../services/runner/automation-runner';

const router = Router();

const CreatePageSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1).optional(),
  description: z.string().nullable().optional().transform(v => (v && v.trim() !== '' ? v.trim() : null)),
  requiresAuth: z.boolean().optional(),
});

const UpdatePageSchema = z.object({
  name: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  description: z.string().nullable().optional().transform(v => (v && v.trim() !== '' ? v.trim() : null)),
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

const ScanPageSchema = z.object({
  username: z.string().optional(),
  password: z.string().optional(),
  loginPath: z.string().optional(),
  showBrowser: z.boolean().optional(),
});

// POST /api/pages/:id/scan
router.post('/:id/scan', async (req: Request, res: Response) => {
  try {
    const page = await prisma.page.findUnique({ where: { id: req.params.id }, include: { project: true } });
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });

    if (!page.project.projectUrl) {
      return res.status(400).json({
        success: false,
        error: 'Project URL belum diisi. Isi dulu di halaman Projects sebelum scan halaman ini.',
      });
    }

    const scanOpts = ScanPageSchema.safeParse(req.body || {});
    const { username, password, loginPath, showBrowser } = scanOpts.success ? scanOpts.data : {};

    if (page.requiresAuth && (!username || !password)) {
      return res.status(400).json({
        success: false,
        error: 'Halaman ini butuh login. Masukkan Username/Email dan Password untuk melakukan scan.',
      });
    }

    // When running locally, use local Playwright/Chrome scanner directly
    if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
      const base = page.project.projectUrl.endsWith('/') ? page.project.projectUrl : `${page.project.projectUrl}/`;
      const targetUrl = new URL(page.path || '/', base).toString();
      const loginUrl = loginPath
        ? /^https?:\/\//i.test(loginPath)
          ? loginPath
          : new URL(loginPath, base).toString()
        : new URL('/login', base).toString();

      const elements = await scanPageElementsLocal(targetUrl, 25000, {
        ...(username && password ? { loginUrl, username, password } : {}),
        headless: showBrowser === false ? true : false,
      });
      const updatedPage = await prisma.page.update({
        where: { id: page.id },
        data: {
          elements: JSON.stringify(elements),
          lastScannedAt: new Date(),
        },
      });
      return res.json({
        success: true,
        page: updatedPage,
        scannedCount: elements.length,
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
