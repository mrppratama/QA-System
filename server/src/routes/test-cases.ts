import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

const router = Router();

const UpdateTestCaseSchema = z.object({
  featureModule: z.string().min(1).optional(),
  testScenario: z.string().min(1).optional(),
  type: z.string().optional(),
  precondition: z.string().optional(),
  actionStep: z.string().optional(),
  testData: z.string().optional(),
  expectedResult: z.string().optional(),
  actualResult: z.string().optional(),
  testingResult: z.string().optional(),
  testDate: z.string().optional(),
  testBy: z.string().optional(),
  bugNote: z.string().optional(),
  automationStatus: z.string().optional(),
});

// GET /api/test-cases/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const testCase = await prisma.testCase.findUnique({
      where: { id: req.params.id },
      include: {
        testCaseSet: { select: { projectId: true, feature: true } },
      },
    });
    if (!testCase) {
      return res.status(404).json({ success: false, error: 'Test case not found' });
    }
    return res.json({ success: true, testCase });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// PUT /api/test-cases/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const parseResult = UpdateTestCaseSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input',
        details: parseResult.error.flatten(),
      });
    }

    const testCase = await prisma.testCase.update({
      where: { id: req.params.id },
      data: parseResult.data,
    });

    return res.json({ success: true, testCase });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// DELETE /api/test-cases/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.testCase.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// DELETE /api/test-cases/bulk — delete multiple
router.post('/bulk-delete', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids array required' });
    }
    const { count } = await prisma.testCase.deleteMany({
      where: { id: { in: ids } },
    });
    return res.json({ success: true, deleted: count });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
