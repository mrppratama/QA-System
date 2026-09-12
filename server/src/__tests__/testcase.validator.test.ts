import { describe, it, expect } from 'vitest';
import {
  GenerateInputSchema,
  GeneratedTestCaseSchema,
  GenerateResultSchema,
} from '../validators/testcase.validator';

describe('TestCase Validators', () => {
  describe('GenerateInputSchema', () => {
    it('should validate valid generate input', () => {
      const input = {
        feature: 'Login Page',
        description: 'Testing user login with credentials',
        userFlow: 'Open page -> Enter credentials -> Click login',
        expectedResult: 'User redirected to dashboard',
        role: 'Admin',
        testedBy: 'David',
        username: 'david@example.com',
        password: 'password123',
        count: 20,
      };

      const result = GenerateInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.feature).toBe('Login Page');
        expect(result.data.count).toBe(20);
      }
    });

    it('should fail when feature is empty', () => {
      const input = {
        feature: '',
        count: 20,
      };

      const result = GenerateInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should enforce count bounds (min 1, max 100)', () => {
      const tooLow = GenerateInputSchema.safeParse({ feature: 'Search', count: 0 });
      expect(tooLow.success).toBe(false);

      const tooHigh = GenerateInputSchema.safeParse({ feature: 'Search', count: 150 });
      expect(tooHigh.success).toBe(false);
    });

    it('should transform empty projectUrl to undefined', () => {
      const input = {
        feature: 'Checkout',
        projectUrl: '',
      };

      const result = GenerateInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.projectUrl).toBeUndefined();
      }
    });

    it('should validate a correct URL', () => {
      const input = {
        feature: 'Checkout',
        projectUrl: 'https://example.com/checkout',
      };

      const result = GenerateInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.projectUrl).toBe('https://example.com/checkout');
      }
    });
  });

  describe('GeneratedTestCaseSchema', () => {
    it('should validate a single generated test case', () => {
      const tc = {
        featureModule: 'Login',
        testScenario: 'Login with valid credentials',
        type: 'Happy Path',
        precondition: 'User is on login page',
        actionStep: '1. Enter email\n2. Enter password\n3. Click Login',
        testData: 'Email: test@example.com | Pass: 123456',
        expectedResult: 'Successfully logged in',
      };

      const result = GeneratedTestCaseSchema.safeParse(tc);
      expect(result.success).toBe(true);
    });

    it('should provide default values for precondition and testData', () => {
      const tc = {
        featureModule: 'Login',
        testScenario: 'Login with valid credentials',
        type: 'Happy Path',
        actionStep: '1. Click button',
        expectedResult: 'Success',
      };

      const result = GeneratedTestCaseSchema.safeParse(tc);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.precondition).toBe('');
        expect(result.data.testData).toBe('-');
      }
    });
  });

  describe('GenerateResultSchema', () => {
    it('should validate non-empty array of generated test cases', () => {
      const res = {
        testCases: [
          {
            featureModule: 'Login',
            testScenario: 'Valid Login',
            type: 'Happy Path',
            actionStep: '1. Click',
            expectedResult: 'OK',
          },
          {
            featureModule: 'Login',
            testScenario: 'Invalid Password',
            type: 'Error Case',
            actionStep: '1. Enter wrong pass',
            expectedResult: 'Error shown',
          },
        ],
      };

      const result = GenerateResultSchema.safeParse(res);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.testCases.length).toBe(2);
      }
    });

    it('should fail if testCases array is empty', () => {
      const res = { testCases: [] };
      const result = GenerateResultSchema.safeParse(res);
      expect(result.success).toBe(false);
    });
  });
});
