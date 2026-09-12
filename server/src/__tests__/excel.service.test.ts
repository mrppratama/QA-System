import { describe, it, expect } from 'vitest';
import { ExcelService } from '../services/excel/excel.service';

describe('ExcelService Unit Tests', () => {
  const excelService = new ExcelService();

  describe('detectColumnMapping', () => {
    it('should map English headers correctly', () => {
      const headers = [
        'Test Case ID',
        'Feature/Module',
        'Test Scenario',
        'Type',
        'Precondition',
        'Action Step',
        'Test Data',
        'Expected Result',
        'Actual Result',
        'Testing Result',
        'Test Date',
        'Test By',
        'Bug Note',
      ];

      const mapping = excelService.detectColumnMapping(headers);

      expect(mapping.testCaseId).toBe('Test Case ID');
      expect(mapping.featureModule).toBe('Feature/Module');
      expect(mapping.testScenario).toBe('Test Scenario');
      expect(mapping.type).toBe('Type');
      expect(mapping.precondition).toBe('Precondition');
      expect(mapping.actionStep).toBe('Action Step');
      expect(mapping.testData).toBe('Test Data');
      expect(mapping.expectedResult).toBe('Expected Result');
      expect(mapping.actualResult).toBe('Actual Result');
      expect(mapping.testingResult).toBe('Testing Result');
      expect(mapping.testDate).toBe('Test Date');
      expect(mapping.testBy).toBe('Test By');
      expect(mapping.bugNote).toBe('Bug Note');
    });

    it('should map Indonesian headers correctly', () => {
      const headers = [
        'No',
        'Fitur',
        'Skenario',
        'Jenis',
        'Prasyarat',
        'Langkah',
        'Input Data',
        'Hasil yang diharapkan',
        'Hasil aktual',
        'Keterangan',
        'Tanggal',
        'Ditest Oleh',
        'Catatan Bug',
      ];

      const mapping = excelService.detectColumnMapping(headers);

      expect(mapping.testCaseId).toBe('No');
      expect(mapping.featureModule).toBe('Fitur');
      expect(mapping.testScenario).toBe('Skenario');
      expect(mapping.type).toBe('Jenis');
      expect(mapping.precondition).toBe('Prasyarat');
      expect(mapping.actionStep).toBe('Langkah');
      expect(mapping.testData).toBe('Input Data');
      expect(mapping.expectedResult).toBe('Hasil yang diharapkan');
      expect(mapping.actualResult).toBe('Hasil aktual');
      expect(mapping.testingResult).toBe('Keterangan');
      expect(mapping.testDate).toBe('Tanggal');
      expect(mapping.testBy).toBe('Ditest Oleh');
      expect(mapping.bugNote).toBe('Catatan Bug');
    });
  });

  describe('createNewWorkbookBuffer & readWorkbookFromBuffer', () => {
    it('should create an Excel workbook buffer and read it back', async () => {
      const testCases = [
        {
          id: 'TC001',
          featureModule: 'Login',
          testScenario: 'Login with valid user',
          type: 'Happy Path',
          precondition: 'On login page',
          actionStep: '1. Enter email\n2. Click Submit',
          testData: 'user@example.com',
          expectedResult: 'Success',
          actualResult: 'Success',
          testingResult: 'Passed',
          testDate: '2026-09-12',
          testBy: 'David',
          bugNote: '',
        },
        {
          id: 'TC002',
          featureModule: 'Login',
          testScenario: 'Login with invalid email format',
          type: 'Validation',
          precondition: 'On login page',
          actionStep: '1. Enter invalid email\n2. Click Submit',
          testData: 'invalid-email',
          expectedResult: 'Validation error',
          actualResult: '',
          testingResult: 'Not Tested',
          testDate: '',
          testBy: '',
          bugNote: '',
        },
      ];

      // 1. Generate buffer
      const buffer = await excelService.createNewWorkbookBuffer(testCases);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // 2. Read buffer back
      const sheets = await excelService.readWorkbookFromBuffer(buffer);
      expect(sheets.length).toBe(1);
      expect(sheets[0].name).toBe('Test Cases');
      expect(sheets[0].headers).toContain('Test Case ID');
      expect(sheets[0].headers).toContain('Feature/Module');
      expect(sheets[0].headers).toContain('Expected Result');
      expect(sheets[0].rowCount).toBe(3); // 1 header + 2 data rows
    });
  });
});
