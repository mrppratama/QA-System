import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { upload } from '../middleware/upload';
import { ExcelService } from '../services/excel/excel.service';
import { prisma } from '../lib/prisma';
import { z } from 'zod';

const router = Router();
const excelService = new ExcelService();

// POST /api/excel/import
router.post('/import', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const sheets = await excelService.readWorkbook(filePath);

    // Save file info to DB
    const excelFile = await prisma.excelFile.create({
      data: {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        path: filePath,
        sheets: JSON.stringify(sheets.map(s => s.name)),
      },
    });

    return res.json({
      success: true,
      fileId: excelFile.id,
      originalName: req.file.originalname,
      sheets,
    });
  } catch (err) {
    console.error('[Excel Import]', err);
    return res.status(500).json({
      success: false,
      error: (err as Error).message || 'Failed to import Excel file',
    });
  }
});

// GET /api/excel/:id/sheets
router.get('/:id/sheets', async (req: Request, res: Response) => {
  try {
    const file = await prisma.excelFile.findUnique({ where: { id: req.params.id } });
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    if (!fs.existsSync(file.path)) {
      return res.status(404).json({ success: false, error: 'File no longer exists on disk' });
    }

    const sheets = await excelService.readWorkbook(file.path);
    return res.json({ success: true, sheets });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/excel/:id/mapping?sheet=SheetName
router.get('/:id/mapping', async (req: Request, res: Response) => {
  try {
    const file = await prisma.excelFile.findUnique({ where: { id: req.params.id } });
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const sheetName = req.query.sheet as string;
    if (!sheetName) {
      return res.status(400).json({ success: false, error: 'sheet query param required' });
    }

    const sheets = await excelService.readWorkbook(file.path);
    const sheet = sheets.find(s => s.name === sheetName);
    if (!sheet) {
      return res.status(404).json({ success: false, error: `Sheet "${sheetName}" not found` });
    }

    const mapping = excelService.detectColumnMapping(sheet.headers);
    return res.json({ success: true, headers: sheet.headers, mapping });
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/excel/:id/add-test-cases
const AddTestCasesSchema = z.object({
  sheetName: z.string().min(1),
  testCases: z.array(z.object({
    id: z.string(),
    featureModule: z.string(),
    testScenario: z.string(),
    type: z.string(),
    precondition: z.string().default(''),
    actionStep: z.string(),
    testData: z.string().default('-'),
    expectedResult: z.string(),
    actualResult: z.string().optional(),
    testingResult: z.string().optional(),
    testDate: z.string().optional(),
    testBy: z.string().optional(),
    bugNote: z.string().optional(),
  })).min(1),
  columnMapping: z.record(z.string()).optional(),
});

router.post('/:id/add-test-cases', async (req: Request, res: Response) => {
  try {
    const file = await prisma.excelFile.findUnique({ where: { id: req.params.id } });
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    if (!fs.existsSync(file.path)) {
      return res.status(404).json({ success: false, error: 'File no longer exists on disk' });
    }

    const parseResult = AddTestCasesSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: parseResult.error.flatten(),
      });
    }

    const { sheetName, testCases, columnMapping } = parseResult.data;

    // Auto-detect mapping if not provided
    let mapping = columnMapping || {};
    if (Object.keys(mapping).length === 0) {
      const sheets = await excelService.readWorkbook(file.path);
      const sheet = sheets.find(s => s.name === sheetName);
      if (sheet) {
        mapping = excelService.detectColumnMapping(sheet.headers) as Record<string, string>;
      }
    }

    const result = await excelService.addTestCasesToSheet(
      file.path,
      sheetName,
      testCases.map(tc => ({
        id: tc.id,
        featureModule: tc.featureModule,
        testScenario: tc.testScenario,
        type: tc.type,
        precondition: tc.precondition,
        actionStep: tc.actionStep,
        testData: tc.testData,
        expectedResult: tc.expectedResult,
        actualResult: tc.actualResult,
        testingResult: tc.testingResult,
        testDate: tc.testDate,
        testBy: tc.testBy,
        bugNote: tc.bugNote,
      })),
      mapping
    );

    return res.json({
      success: true,
      added: result.added,
      lastId: result.lastId,
    });
  } catch (err) {
    console.error('[Add Test Cases]', err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// GET /api/excel/:id/export
router.get('/:id/export', async (req: Request, res: Response) => {
  try {
    const file = await prisma.excelFile.findUnique({ where: { id: req.params.id } });
    if (!file) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    if (!fs.existsSync(file.path)) {
      return res.status(404).json({ success: false, error: 'File no longer exists' });
    }

    const safeName = file.originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const fileStream = fs.createReadStream(file.path);
    fileStream.pipe(res);
  } catch (err) {
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/excel/export-new — export given test cases as new xlsx
const ExportNewSchema = z.object({
  testCases: z.array(z.object({
    id: z.string(),
    featureModule: z.string(),
    testScenario: z.string(),
    type: z.string(),
    precondition: z.string().default(''),
    actionStep: z.string(),
    testData: z.string().default('-'),
    expectedResult: z.string(),
    actualResult: z.string().optional(),
    testingResult: z.string().optional(),
    testDate: z.string().optional(),
    testBy: z.string().optional(),
    bugNote: z.string().optional(),
  })).min(1),
  filename: z.string().optional(),
});

router.post('/export-new', async (req: Request, res: Response) => {
  try {
    const parseResult = ExportNewSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }

    const { testCases, filename } = parseResult.data;
    const safeFilename = `QA-Test-Cases-${Date.now()}.xlsx`;

    const exportPath = await excelService.createNewWorkbook(
      testCases.map(tc => ({ ...tc, id: tc.id })),
      safeFilename
    );

    const downloadName = filename
      ? filename.replace(/[^a-zA-Z0-9._-]/g, '_') + '.xlsx'
      : 'QA-Test-Cases.xlsx';

    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const stream = fs.createReadStream(exportPath);
    stream.pipe(res);
    stream.on('close', () => {
      setTimeout(() => {
        try { fs.unlinkSync(exportPath); } catch {}
      }, 5000);
    });
  } catch (err) {
    console.error('[Export New]', err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST /api/excel/export-project/:projectId — export all test cases for a project
router.post('/export-project/:projectId', async (req: Request, res: Response) => {
  try {
    const testCases = await prisma.testCase.findMany({
      where: { testCaseSet: { projectId: req.params.projectId } },
      orderBy: { createdAt: 'asc' },
    });

    if (testCases.length === 0) {
      return res.status(404).json({ success: false, error: 'No test cases found for this project' });
    }

    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
    const projectName = project?.name || 'Project';
    const safeFilename = `${projectName.replace(/[^a-zA-Z0-9]/g, '-')}-TestCases-${Date.now()}.xlsx`;

    const exportPath = await excelService.createNewWorkbook(
      testCases.map(tc => ({
        id: tc.testCaseId,
        featureModule: tc.featureModule,
        testScenario: tc.testScenario,
        type: tc.type,
        precondition: tc.precondition || '',
        actionStep: tc.actionStep,
        testData: tc.testData || '-',
        expectedResult: tc.expectedResult,
        actualResult: tc.actualResult || '',
        testingResult: tc.testingResult || 'Not Tested',
        testDate: tc.testDate || '',
        testBy: tc.testBy || '',
        bugNote: tc.bugNote || '',
      })),
      safeFilename
    );

    const downloadName = `${projectName.replace(/[^a-zA-Z0-9]/g, '-')}-TestCases.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const stream = fs.createReadStream(exportPath);
    stream.pipe(res);
    stream.on('close', () => {
      setTimeout(() => {
        try { fs.unlinkSync(exportPath); } catch {}
      }, 5000);
    });
  } catch (err) {
    console.error('[Export Project]', err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
