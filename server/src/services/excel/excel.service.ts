import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

export interface SheetInfo {
  name: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
}

export interface WorkbookInfo {
  fileId: string;
  originalName: string;
  sheets: SheetInfo[];
}

export interface ColumnMapping {
  testCaseId?: string;
  featureModule?: string;
  testScenario?: string;
  type?: string;
  precondition?: string;
  actionStep?: string;
  testData?: string;
  expectedResult?: string;
  actualResult?: string;
  testingResult?: string;
  testDate?: string;
  testBy?: string;
  bugNote?: string;
}

export interface TestCaseRow {
  id: string;
  featureModule: string;
  testScenario: string;
  type: string;
  precondition: string;
  actionStep: string;
  testData: string;
  expectedResult: string;
  actualResult?: string;
  testingResult?: string;
  testDate?: string;
  testBy?: string;
  bugNote?: string;
}

// Sanitize cell value to prevent formula injection
function sanitizeCellValue(value: string | undefined | null): string {
  if (!value) return '';
  const str = String(value).trim();
  // Prevent formula injection
  if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) {
    return `'${str}`;
  }
  return str;
}

export class ExcelService {
  private uploadsDir: string;
  private exportsDir: string;

  constructor() {
    this.uploadsDir = path.resolve(process.cwd(), '../uploads');
    this.exportsDir = path.resolve(process.cwd(), '../exports');
    this.ensureDirs();
  }

  private ensureDirs() {
    [this.uploadsDir, this.exportsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async readWorkbook(filePath: string): Promise<SheetInfo[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    return this.extractSheetsFromWorkbook(workbook);
  }

  async readWorkbookFromBuffer(buffer: Buffer): Promise<SheetInfo[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    return this.extractSheetsFromWorkbook(workbook);
  }

  private extractSheetsFromWorkbook(workbook: ExcelJS.Workbook): SheetInfo[] {
    const sheets: SheetInfo[] = [];

    workbook.worksheets.forEach(ws => {
      const headers: string[] = [];
      const headerRow = ws.getRow(1);
      
      headerRow.eachCell({ includeEmpty: false }, (cell) => {
        const val = cell.value;
        if (val !== null && val !== undefined) {
          headers.push(String(val).trim());
        }
      });

      sheets.push({
        name: ws.name,
        rowCount: ws.rowCount,
        columnCount: ws.columnCount,
        headers,
      });
    });

    return sheets;
  }

  // Smart header matching
  detectColumnMapping(headers: string[]): ColumnMapping {
    const mapping: ColumnMapping = {};
    
    const matchRules: Record<keyof ColumnMapping, string[]> = {
      testCaseId: ['test case id', 'testcaseid', 'tc id', 'id', 'no', 'number'],
      featureModule: ['feature/module', 'feature', 'module', 'fitur', 'modul'],
      testScenario: ['test scenario', 'scenario', 'skenario', 'deskripsi'],
      type: ['type', 'tipe', 'jenis', 'category'],
      precondition: ['precondition', 'pre-condition', 'prasyarat', 'kondisi awal'],
      actionStep: ['action step', 'steps', 'step', 'langkah', 'action', 'test step'],
      testData: ['test data', 'data', 'input data'],
      expectedResult: ['expected result', 'expected', 'ekspektasi', 'hasil yang diharapkan'],
      actualResult: ['actual result', 'actual', 'hasil aktual', 'hasil sebenarnya'],
      testingResult: ['testing result', 'status', 'pass/fail', 'keterangan'],
      testDate: ['test date', 'date', 'tanggal', 'tanggal test'],
      testBy: ['test by', 'tester', 'tested by', 'ditest oleh'],
      bugNote: ['bug note', 'bug', 'catatan bug', 'note', 'catatan'],
    };

    headers.forEach((header) => {
      const normalized = header.toLowerCase().trim();
      
      // 1. First try exact match
      for (const [field, patterns] of Object.entries(matchRules)) {
        if (!mapping[field as keyof ColumnMapping]) {
          if (patterns.some(p => normalized === p)) {
            mapping[field as keyof ColumnMapping] = header;
          }
        }
      }

      // 2. Fallback to contains match
      for (const [field, patterns] of Object.entries(matchRules)) {
        if (!mapping[field as keyof ColumnMapping]) {
          if (patterns.some(p => normalized.includes(p))) {
            mapping[field as keyof ColumnMapping] = header;
          }
        }
      }
    });

    return mapping;
  }

  async addTestCasesToSheet(
    filePath: string,
    sheetName: string,
    testCases: TestCaseRow[],
    columnMapping: ColumnMapping
  ): Promise<{ added: number; lastId: string }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const ws = workbook.getWorksheet(sheetName);
    if (!ws) {
      throw new Error(`Sheet "${sheetName}" not found`);
    }

    // Read headers from row 1
    const headerRow = ws.getRow(1);
    const headerMap: Record<string, number> = {};
    
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const val = String(cell.value || '').trim();
      if (val) headerMap[val] = colNumber;
    });

    // Find the last row with data and last TC ID
    let lastDataRow = 1;
    let lastTcNumber = 0;

    for (let r = 2; r <= ws.rowCount + 1; r++) {
      const row = ws.getRow(r);
      let hasData = false;
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== '') {
          hasData = true;
        }
      });
      if (hasData) {
        lastDataRow = r;
        // Try to read TC ID
        if (columnMapping.testCaseId) {
          const tcColNum = headerMap[columnMapping.testCaseId];
          if (tcColNum) {
            const tcCell = row.getCell(tcColNum);
            const tcVal = String(tcCell.value || '').trim();
            const match = tcVal.match(/(\d+)$/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > lastTcNumber) lastTcNumber = num;
            }
          }
        }
      }
    }

    // Add new test cases starting from next row
    let insertRow = lastDataRow + 1;
    let added = 0;

    for (const tc of testCases) {
      lastTcNumber++;
      const newTcId = `TC${String(lastTcNumber).padStart(3, '0')}`;
      const row = ws.getRow(insertRow);

      const fieldToHeader: Record<string, string | undefined> = {
        testCaseId: columnMapping.testCaseId,
        featureModule: columnMapping.featureModule,
        testScenario: columnMapping.testScenario,
        type: columnMapping.type,
        precondition: columnMapping.precondition,
        actionStep: columnMapping.actionStep,
        testData: columnMapping.testData,
        expectedResult: columnMapping.expectedResult,
        actualResult: columnMapping.actualResult,
        testingResult: columnMapping.testingResult,
        testDate: columnMapping.testDate,
        testBy: columnMapping.testBy,
        bugNote: columnMapping.bugNote,
      };

      const fieldValues: Record<string, string> = {
        testCaseId: newTcId,
        featureModule: tc.featureModule,
        testScenario: tc.testScenario,
        type: tc.type,
        precondition: tc.precondition,
        actionStep: tc.actionStep,
        testData: tc.testData,
        expectedResult: tc.expectedResult,
        actualResult: tc.actualResult || '',
        testingResult: tc.testingResult || '',
        testDate: tc.testDate || '',
        testBy: tc.testBy || '',
        bugNote: tc.bugNote || '',
      };

      for (const [field, headerName] of Object.entries(fieldToHeader)) {
        if (headerName && headerMap[headerName]) {
          const colNum = headerMap[headerName];
          const cell = row.getCell(colNum);
          cell.value = sanitizeCellValue(fieldValues[field]);
        }
      }

      // If no mapping, write in default columns
      if (Object.keys(headerMap).length === 0) {
        row.getCell(1).value = newTcId;
        row.getCell(2).value = sanitizeCellValue(tc.featureModule);
        row.getCell(3).value = sanitizeCellValue(tc.testScenario);
        row.getCell(4).value = sanitizeCellValue(tc.type);
        row.getCell(5).value = sanitizeCellValue(tc.precondition);
        row.getCell(6).value = sanitizeCellValue(tc.actionStep);
        row.getCell(7).value = sanitizeCellValue(tc.testData);
        row.getCell(8).value = sanitizeCellValue(tc.expectedResult);
      }

      row.commit();
      insertRow++;
      added++;
    }

    await workbook.xlsx.writeFile(filePath);

    return {
      added,
      lastId: `TC${String(lastTcNumber).padStart(3, '0')}`,
    };
  }

  async createNewWorkbook(testCases: TestCaseRow[], filename: string): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QA Test Case Generator';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Test Cases');

    // Define columns
    ws.columns = [
      { header: 'Test Case ID', key: 'testCaseId', width: 15 },
      { header: 'Feature/Module', key: 'featureModule', width: 20 },
      { header: 'Test Scenario', key: 'testScenario', width: 40 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Precondition', key: 'precondition', width: 30 },
      { header: 'Action Step', key: 'actionStep', width: 40 },
      { header: 'Test Data', key: 'testData', width: 20 },
      { header: 'Expected Result', key: 'expectedResult', width: 40 },
      { header: 'Actual Result', key: 'actualResult', width: 30 },
      { header: 'Testing Result', key: 'testingResult', width: 15 },
      { header: 'Test Date', key: 'testDate', width: 15 },
      { header: 'Test By', key: 'testBy', width: 15 },
      { header: 'Bug Note', key: 'bugNote', width: 30 },
    ];

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // Add data
    testCases.forEach(tc => {
      ws.addRow({
        testCaseId: sanitizeCellValue(tc.id),
        featureModule: sanitizeCellValue(tc.featureModule),
        testScenario: sanitizeCellValue(tc.testScenario),
        type: sanitizeCellValue(tc.type),
        precondition: sanitizeCellValue(tc.precondition),
        actionStep: sanitizeCellValue(tc.actionStep),
        testData: sanitizeCellValue(tc.testData),
        expectedResult: sanitizeCellValue(tc.expectedResult),
        actualResult: '',
        testingResult: '',
        testDate: '',
        testBy: '',
        bugNote: '',
      });
    });

    // Enable word wrap for step columns
    ws.getColumn('actionStep').alignment = { wrapText: true, vertical: 'top' };
    ws.getColumn('expectedResult').alignment = { wrapText: true, vertical: 'top' };
    ws.getColumn('precondition').alignment = { wrapText: true, vertical: 'top' };

    const exportPath = path.join(this.exportsDir, filename);
    await workbook.xlsx.writeFile(exportPath);
    return exportPath;
  }

  async createNewWorkbookBuffer(testCases: TestCaseRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QA Test Case Generator';
    workbook.created = new Date();

    const ws = workbook.addWorksheet('Test Cases');

    ws.columns = [
      { header: 'Test Case ID', key: 'testCaseId', width: 15 },
      { header: 'Feature/Module', key: 'featureModule', width: 20 },
      { header: 'Test Scenario', key: 'testScenario', width: 40 },
      { header: 'Type', key: 'type', width: 15 },
      { header: 'Precondition', key: 'precondition', width: 30 },
      { header: 'Action Step', key: 'actionStep', width: 40 },
      { header: 'Test Data', key: 'testData', width: 20 },
      { header: 'Expected Result', key: 'expectedResult', width: 40 },
      { header: 'Actual Result', key: 'actualResult', width: 30 },
      { header: 'Testing Result', key: 'testingResult', width: 15 },
      { header: 'Test Date', key: 'testDate', width: 15 },
      { header: 'Test By', key: 'testBy', width: 15 },
      { header: 'Bug Note', key: 'bugNote', width: 30 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' },
    };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    testCases.forEach(tc => {
      ws.addRow({
        testCaseId: sanitizeCellValue(tc.id),
        featureModule: sanitizeCellValue(tc.featureModule),
        testScenario: sanitizeCellValue(tc.testScenario),
        type: sanitizeCellValue(tc.type),
        precondition: sanitizeCellValue(tc.precondition),
        actionStep: sanitizeCellValue(tc.actionStep),
        testData: sanitizeCellValue(tc.testData),
        expectedResult: sanitizeCellValue(tc.expectedResult),
        actualResult: sanitizeCellValue(tc.actualResult || ''),
        testingResult: sanitizeCellValue(tc.testingResult || ''),
        testDate: sanitizeCellValue(tc.testDate || ''),
        testBy: sanitizeCellValue(tc.testBy || ''),
        bugNote: sanitizeCellValue(tc.bugNote || ''),
      });
    });

    ws.getColumn('actionStep').alignment = { wrapText: true, vertical: 'top' };
    ws.getColumn('expectedResult').alignment = { wrapText: true, vertical: 'top' };
    ws.getColumn('precondition').alignment = { wrapText: true, vertical: 'top' };

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  getUploadPath(filename: string): string {
    return path.join(this.uploadsDir, filename);
  }

  getExportPath(filename: string): string {
    return path.join(this.exportsDir, filename);
  }
}
