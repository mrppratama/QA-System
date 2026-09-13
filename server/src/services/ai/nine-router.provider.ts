import { AIProvider, GenerateResult, TestCaseInput } from './types';

export class NineRouterProvider implements AIProvider {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private timeout: number;

  constructor() {
    this.baseUrl = process.env.NINE_ROUTER_BASE_URL || 'https://api.9router.ai/v1';
    this.apiKey = process.env.NINE_ROUTER_API_KEY || '';
    this.model = process.env.NINE_ROUTER_MODEL || 'gpt-4o';
    // Default kept comfortably under Vercel's maxDuration (see vercel.json) so a
    // hung request is caught by our own AbortController instead of the platform
    // killing the whole function with an opaque FUNCTION_INVOCATION_TIMEOUT.
    // Callers with an actual time budget (see routes/ai.ts, routes/automation.ts)
    // pass an explicit timeoutMs per call instead of relying on this default —
    // this constructor default is only a fallback for any caller that doesn't.
    // No Vercel maxDuration applies to a local `npm run dev` server, so this
    // fallback is generous there too rather than inheriting the prod-safe value.
    this.timeout = process.env.VERCEL
      ? parseInt(process.env.NINE_ROUTER_TIMEOUT || '45000', 10)
      : 120_000;

    if (!this.apiKey) {
      console.warn('[NineRouterProvider] NINE_ROUTER_API_KEY is not set');
    }
  }

  private buildPrompt(input: TestCaseInput): string {
    const count = input.count || 20;
    const hasCredentials = input.username || input.password;
    const credentialInfo = hasCredentials
      ? `\nLOGIN CREDENTIALS (use in testData for scenarios that require login):\n${input.username ? `  Username: ${input.username}` : ''}\n${input.password ? `  Password: ${input.password}` : ''}`
      : '';

    const urlContext = input.projectUrl
      ? `\nAPPLICATION URL: ${input.projectUrl} (use this as the base when referencing specific pages/paths in action steps)`
      : '';

    return `You are a professional QA engineer. Generate ${count} MANUAL test cases (not automation scripts) for the following feature.

FEATURE: ${input.feature}
${input.description ? `DESCRIPTION: ${input.description}` : ''}
${input.userFlow ? `USER FLOW: ${input.userFlow}` : ''}
${input.expectedResult ? `EXPECTED RESULT: ${input.expectedResult}` : ''}
${input.role ? `ROLE / USER: ${input.role}` : ''}${urlContext}${credentialInfo}

Requirements:
- Generate exactly ${count} test cases
- Categorize each test case strictly into one of these 4 types: "Happy Path", "Validation", "Error Case", "Important edge case"
- Ensure a good mix of these 4 test case types
- Do NOT invent business rules not mentioned above
- Do NOT generate test cases unrelated to the feature
- Each action step should be numbered (e.g. "1. Open page\n2. Click button")
${hasCredentials ? `- For test cases that require login, include the actual credentials in the testData field (e.g. "Username: ${input.username || 'user'} | Password: ${input.password || 'pass'}")` : ''}
- For negative/invalid test cases, use wrong credentials or edge case values in testData
- testData must be specific and useful (not just '-' unless truly no data needed)

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "testCases": [
    {
      "featureModule": "${input.feature}",
      "testScenario": "Clear description of what is being tested",
      "type": "Happy Path|Validation|Error Case|Important edge case",
      "precondition": "What needs to be true before the test",
      "actionStep": "1. Step one\\n2. Step two\\n3. Step three",
      "testData": "Specific data used in the test (credentials, input values, etc.)",
      "expectedResult": "What should happen"
    }
  ]
}`;
  }

  async generateTestCases(input: TestCaseInput, timeoutMs?: number): Promise<GenerateResult> {
    const { content } = await this.callChatCompletion(
      'You are a professional QA engineer. Always return valid JSON only, no markdown formatting.',
      this.buildPrompt(input),
      { timeoutMs, temperature: 0.3, maxTokens: 8000 }
    );
    return this.parseResponse(content);
  }

  async generateAutomationScript(
    systemPrompt: string,
    userPrompt: string,
    timeoutMs?: number
  ): Promise<{ script: string; truncated: boolean }> {
    const { content, finishReason } = await this.callChatCompletion(
      systemPrompt,
      userPrompt,
      { timeoutMs, temperature: 0.2, maxTokens: 8000 }
    );

    let script = content.trim();
    if (script.startsWith('```')) {
      script = script.replace(/^```(?:javascript|js|python|java|ts|typescript)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    return { script, truncated: finishReason === 'length' };
  }

  private async callChatCompletion(
    systemPrompt: string,
    userPrompt: string,
    opts?: { timeoutMs?: number; temperature?: number; maxTokens?: number }
  ): Promise<{ content: string; finishReason?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: opts?.temperature ?? 0.3,
          max_tokens: opts?.maxTokens ?? 8000,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        error?: { message?: string };
      };

      if (data.error) {
        throw new Error(`AI error: ${data.error.message || 'Unknown error'}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('AI returned empty response');
      }

      return { content, finishReason: data.choices?.[0]?.finish_reason };
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  private parseResponse(content: string): GenerateResult {
    // Strip markdown code blocks if present
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    const parsed = JSON.parse(cleaned) as GenerateResult;
    return parsed;
  }
}
