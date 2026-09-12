import { describe, it, expect } from 'vitest';
import { NineRouterProvider } from '../services/ai/nine-router.provider';

describe('NineRouterProvider Unit Tests', () => {
  const provider = new NineRouterProvider();

  describe('buildPrompt (via class behavior)', () => {
    it('should generate prompt containing 4 specified test case types', () => {
      const input = {
        feature: 'Payment Checkout',
        description: 'Testing credit card payment flow',
        userFlow: 'User selects item -> Goes to checkout -> Enters card info -> Submits',
        expectedResult: 'Payment succeeds and order confirmation displayed',
        role: 'Customer',
        count: 10,
        username: 'testuser',
        password: 'password123',
        projectUrl: 'https://app.example.com',
      };

      // Access private buildPrompt method for unit testing
      const prompt = (provider as any).buildPrompt(input);

      expect(prompt).toContain('FEATURE: Payment Checkout');
      expect(prompt).toContain('Generate exactly 10 test cases');
      expect(prompt).toContain('Categorize each test case strictly into one of these 4 types: "Happy Path", "Validation", "Error Case", "Important edge case"');
      expect(prompt).toContain('Happy Path|Validation|Error Case|Important edge case');
      expect(prompt).toContain('https://app.example.com');
      expect(prompt).toContain('Username: testuser');
      expect(prompt).toContain('Password: password123');
    });
  });

  describe('parseResponse', () => {
    it('should correctly parse clean JSON response', () => {
      const jsonStr = JSON.stringify({
        testCases: [
          {
            featureModule: 'Login',
            testScenario: 'Valid Login',
            type: 'Happy Path',
            precondition: 'On login page',
            actionStep: '1. Click login',
            testData: 'user@example.com',
            expectedResult: 'Redirected to dashboard',
          },
        ],
      });

      const parsed = (provider as any).parseResponse(jsonStr);
      expect(parsed.testCases.length).toBe(1);
      expect(parsed.testCases[0].type).toBe('Happy Path');
    });

    it('should strip markdown code blocks from response before parsing', () => {
      const markdownJson = `\`\`\`json
{
  "testCases": [
    {
      "featureModule": "Signup",
      "testScenario": "Invalid Email",
      "type": "Validation",
      "precondition": "On signup page",
      "actionStep": "1. Enter invalid email",
      "testData": "invalid",
      "expectedResult": "Error displayed"
    }
  ]
}
\`\`\``;

      const parsed = (provider as any).parseResponse(markdownJson);
      expect(parsed.testCases.length).toBe(1);
      expect(parsed.testCases[0].type).toBe('Validation');
    });
  });
});
