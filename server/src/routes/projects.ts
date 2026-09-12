import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

const router = Router();

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  projectUrl: z.string().url('Invalid URL format').optional().or(z.literal('')).transform(v => v || null),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  projectUrl: z.string().url('Invalid URL format').optional().or(z.literal('')).transform(v => v || null),
});

// GET /api/projects
router.get('/', async (_req: Request, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { testCaseSets: true } },
      },
    });
    return res.json({ success: true, projects });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/projects
router.post('/', async (req: Request, res: Response) => {
  try {
    const parseResult = CreateProjectSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: 'Invalid input' });
    }
    const project = await prisma.project.create({ data: parseResult.data });
    return res.json({ success: true, project });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// PUT /api/projects/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const parseResult = UpdateProjectSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: 'Invalid input' });
    }
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: parseResult.data,
    });
    return res.json({ success: true, project });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// DELETE /api/projects/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    // Cascade: testCaseSets -> testCases are deleted via Prisma relations
    await prisma.project.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/projects/:id/history
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const sets = await prisma.testCaseSet.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        testCases: true,
        _count: { select: { testCases: true } },
      },
    });
    return res.json({ success: true, sets });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/projects/:id/test-cases
router.get('/:id/test-cases', async (req: Request, res: Response) => {
  try {
    const { search, type, testingResult, automationStatus, page = '1', limit = '50' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {
      testCaseSet: { projectId: req.params.id },
    };

    if (type) where.type = type as string;
    if (testingResult) where.testingResult = testingResult as string;
    if (automationStatus) where.automationStatus = automationStatus as string;

    if (search) {
      const s = search as string;
      where.OR = [
        { testCaseId: { contains: s } },
        { featureModule: { contains: s } },
        { testScenario: { contains: s } },
        { expectedResult: { contains: s } },
      ];
    }

    const [total, testCases] = await Promise.all([
      prisma.testCase.count({ where }),
      prisma.testCase.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip,
        take: limitNum,
        include: {
          testCaseSet: { select: { feature: true, testedBy: true } },
        },
      }),
    ]);

    return res.json({
      success: true,
      testCases,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/projects/:id/save-test-cases — save selected generated test cases
const SaveTestCasesSchema = z.object({
  feature: z.string().min(1),
  description: z.string().optional(),
  userFlow: z.string().optional(),
  expectedResult: z.string().optional(),
  role: z.string().optional(),
  testedBy: z.string().optional(),
  testCases: z.array(z.object({
    featureModule: z.string(),
    testScenario: z.string(),
    type: z.string(),
    precondition: z.string().default(''),
    actionStep: z.string(),
    testData: z.string().default('-'),
    expectedResult: z.string(),
    testBy: z.string().optional(),
  })).min(1),
});

router.post('/:id/save-test-cases', async (req: Request, res: Response) => {
  try {
    // Verify project exists
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const parseResult = SaveTestCasesSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: parseResult.error.flatten(),
      });
    }

    const { feature, description, userFlow, expectedResult, role, testedBy, testCases } = parseResult.data;

    // Find existing set for this feature/project to avoid duplicates, or create new
    const set = await prisma.testCaseSet.create({
      data: {
        projectId: req.params.id,
        feature,
        description,
        userFlow,
        expectedResult,
        role,
        testedBy,
        count: testCases.length,
      },
    });

    // Get the current max testCaseId number for this project
    const existingCases = await prisma.testCase.findMany({
      where: { testCaseSet: { projectId: req.params.id } },
      select: { testCaseId: true },
      orderBy: { createdAt: 'asc' },
    });

    let maxNum = 0;
    for (const tc of existingCases) {
      const match = tc.testCaseId.match(/(\d+)$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }

    const created = await prisma.testCaseSet.update({
      where: { id: set.id },
      data: {
        testCases: {
          create: testCases.map((tc, i) => ({
            testCaseId: `TC${String(maxNum + i + 1).padStart(3, '0')}`,
            featureModule: tc.featureModule,
            testScenario: tc.testScenario,
            type: tc.type,
            precondition: tc.precondition,
            actionStep: tc.actionStep,
            testData: tc.testData,
            expectedResult: tc.expectedResult,
            testBy: tc.testBy || testedBy || null,
            testingResult: 'Not Tested',
            automationStatus: 'Not Automated',
          })),
        },
      },
      include: { testCases: true },
    });

    return res.json({
      success: true,
      saved: created.testCases.length,
      testCaseSetId: set.id,
      testCases: created.testCases,
    });
  } catch (err) {
    console.error('[Save Test Cases]', err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// ─── Dashboard & Stats ───────────────────────────────────────────────────────

// GET /api/projects/dashboard/stats  —  workspace-wide overview
router.get('/dashboard/stats', async (_req: Request, res: Response) => {
  try {
    const [projects, totalScripts, total, resultGroups, autoGroups, featureGroups] = await Promise.all([
      prisma.project.findMany({
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { testCaseSets: true } } },
      }),
      prisma.automationScript.count(),
      prisma.testCase.count(),
      prisma.testCase.groupBy({ by: ['testingResult'], _count: { _all: true } }),
      prisma.testCase.groupBy({ by: ['automationStatus'], _count: { _all: true } }),
      prisma.testCase.groupBy({ by: ['featureModule'] }),
    ]);

    const byResult: Record<string, number> = { 'Not Tested': 0, Passed: 0, Failed: 0, Blocked: 0 };
    for (const g of resultGroups) byResult[g.testingResult] = g._count._all;

    const byAuto: Record<string, number> = { 'Not Automated': 0, Generated: 0, Automated: 0 };
    for (const g of autoGroups) byAuto[g.automationStatus] = g._count._all;

    const automated = (byAuto['Generated'] || 0) + (byAuto['Automated'] || 0);

    return res.json({
      success: true,
      overview: {
        totalProjects: projects.length,
        totalTestCases: total,
        totalFeatures: featureGroups.length,
        totalScripts,
        automationCoverage: total > 0 ? Math.round((automated / total) * 100) : 0,
      },
      byTestingResult: byResult,
      byAutomationStatus: byAuto,
      projects: projects.map(p => ({ id: p.id, name: p.name, testSets: p._count.testCaseSets })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/projects/:id/stats  —  single project overview
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { _count: { select: { testCaseSets: true, automationScripts: true } } },
    });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const where = { testCaseSet: { projectId } };

    const [total, resultGroups, autoGroups, featureGroups, recentSets] = await Promise.all([
      prisma.testCase.count({ where }),
      prisma.testCase.groupBy({ by: ['testingResult'], where, _count: { _all: true } }),
      prisma.testCase.groupBy({ by: ['automationStatus'], where, _count: { _all: true } }),
      prisma.testCase.groupBy({ by: ['featureModule'], where, _count: { _all: true } }),
      prisma.testCaseSet.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { _count: { select: { testCases: true } } },
      }),
    ]);

    const byResult: Record<string, number> = { 'Not Tested': 0, Passed: 0, Failed: 0, Blocked: 0 };
    for (const g of resultGroups) byResult[g.testingResult] = g._count._all;

    const byAuto: Record<string, number> = { 'Not Automated': 0, Generated: 0, Automated: 0 };
    for (const g of autoGroups) byAuto[g.automationStatus] = g._count._all;

    const automated = (byAuto['Generated'] || 0) + (byAuto['Automated'] || 0);
    const passed = byResult['Passed'] || 0;
    const topFeatures = featureGroups
      .map(g => ({ feature: g.featureModule, count: g._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return res.json({
      success: true,
      project: { id: project.id, name: project.name, url: project.projectUrl, description: project.description },
      stats: {
        totalTestCases: total,
        totalFeatures: featureGroups.length,
        totalTestSets: project._count.testCaseSets,
        totalScripts: project._count.automationScripts,
        automationCoverage: total > 0 ? Math.round((automated / total) * 100) : 0,
        passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
      },
      byTestingResult: byResult,
      byAutomationStatus: byAuto,
      topFeatures,
      recentSets: recentSets.map(s => ({
        id: s.id,
        feature: s.feature,
        count: s._count.testCases,
        createdAt: s.createdAt,
        testedBy: s.testedBy,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
