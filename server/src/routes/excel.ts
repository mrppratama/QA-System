import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { upload } from '../middleware/upload';
import { ExcelService } from '../services/excel/excel.service';
import { prisma } from '../lib/prisma';
import { supabase, BUCKET_NAME } from '../lib/supabase';
import { z } from 'zod';

const router = Router();
const excelService = new ExcelService();

// Helper to get Excel file Buffer from Supabase Storage or Local Disk
async function getFileBuffer(fileRecord: { storedName: string; path: string }): Promise<Buffer | null> {
  // 1. Try Supabase Storage SDK download
  if (supabase) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET_NAME).download(fileRecord.storedName);
      if (data && !error) {
        const arrayBuffer = await data.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
    } catch { /* ignore */ }
  }

  // 2. Try Supabase Storage Public URL fetch
  try {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://qgnhykmemphamepbrmmh.supabase.co';
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET_NAME}/${fileRecord.storedName}`;
    const res = await fetch(publicUrl);
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
  } catch { /* ignore */ }

  // 3. Fallback to local disk if available
  if (fs.existsSync(fileRecord.path)) {
    return fs.readFileSync(fileRecord.path);
  }

  return null;
}

// POST /api/excel/import
router.post('/import', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const fileBuffer = req.file.buffer;
    const sheets = await excelService.readWorkbookFromBuffer(fileBuffer);

    const ext = path.extname(req.file.originalname).toLowerCase() || '.xlsx';
    const random = crypto.randomBytes(8).toString('hex');
    const storedName = `upload-${Date.now()}-${random}${ext}`;
    const localUploadPath = path.resolve(process.cwd(), '../uploads', storedName);

    // Try uploading to Supabase Storage if configured
    let filePath = localUploadPath;
    if (supabase) {
      try {
        const { error } = await supabase.storage.from(BUCKET_NAME).upload(storedName, fileBuffer, {
          contentType: req.file.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: true,
        });
        if (error) {
          console.warn('[Supabase Storage Upload Warning]', error.message);
        } else {
          filePath = storedName;
        }
      } catch (err) {
        console.warn('[Supabase Storage Exception]', err);
      }
    }

    // Save local backup if filesystem is writable
    try {
      const uploadsDir = path.resolve(process.cwd(), '../uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(localUploadPath, fileBuffer);
    } catch { /* ignore ephemeral fs errors */ }

    // Save file info to DB
    const excelFile = await prisma.excelFile.create({
      data: {
        originalName: req.file.originalname,
        storedName,
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

    const buffer = await getFileBuffer(file);
    if (!buffer) {
      return res.status(404).json({ success: false, error: 'File no longer exists or could not be downloaded' });
    }

    const sheets = await excelService.readWorkbookFromBuffer(buffer);
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

    const buffer = await getFileBuffer(file);
    if (!buffer) {
      return res.status(404).json({ success: false, error: 'File no longer exists or could not be downloaded' });
    }

    const sheets = await excelService.readWorkbookFromBuffer(buffer);
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

    const parseResult = AddTestCasesSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: parseResult.error.flatten(),
      });
    }

    const { sheetName, testCases, columnMapping } = parseResult.data;

    let tempFilePath = file.path;
    const isLocal = fs.existsSync(file.path);

    if (!isLocal) {
      const buffer = await getFileBuffer(file);
      if (!buffer) {
        return res.status(404).json({ success: false, error: 'File no longer exists or could not be downloaded' });
      }
      tempFilePath = path.resolve(process.cwd(), '../uploads', `temp-${Date.now()}-${file.storedName}`);
      fs.writeFileSync(tempFilePath, buffer);
    }

    // Auto-detect mapping if not provided
    let mapping = columnMapping || {};
    if (Object.keys(mapping).length === 0) {
      const sheets = await excelService.readWorkbook(tempFilePath);
      const sheet = sheets.find(s => s.name === sheetName);
      if (sheet) {
        mapping = excelService.detectColumnMapping(sheet.headers) as Record<string, string>;
      }
    }

    const result = await excelService.addTestCasesToSheet(
      tempFilePath,
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

    // If modified, re-upload to Supabase Storage
    if (supabase) {
      try {
        const updatedBuffer = fs.readFileSync(tempFilePath);
        await supabase.storage.from(BUCKET_NAME).upload(file.storedName, updatedBuffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: true,
        });
      } catch (err) {
        console.warn('[Supabase Re-upload Error]', err);
      }
    }

    if (!isLocal) {
      try { fs.unlinkSync(tempFilePath); } catch {}
    }

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

    const buffer = await getFileBuffer(file);
    if (!buffer) {
      return res.status(404).json({ success: false, error: 'File no longer exists' });
    }

    const safeName = file.originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
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
    const buffer = await excelService.createNewWorkbookBuffer(
      testCases.map(tc => ({ ...tc, id: tc.id }))
    );

    const downloadName = filename
      ? filename.replace(/[^a-zA-Z0-9._-]/g, '_') + '.xlsx'
      : 'QA-Test-Cases.xlsx';

    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
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

    const buffer = await excelService.createNewWorkbookBuffer(
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
      }))
    );

    const downloadName = `${projectName.replace(/[^a-zA-Z0-9]/g, '-')}-TestCases.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (err) {
    console.error('[Export Project]', err);
    return res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
