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
    const hasExplicitCount = typeof input.count === 'number' && input.count > 0;
    const hasCredentials = input.username || input.password;
    const credentialInfo = hasCredentials
      ? `\nLOGIN CREDENTIALS (use in testData for scenarios that require login):\n${input.username ? `  Username: ${input.username}` : ''}\n${input.password ? `  Password: ${input.password}` : ''}`
      : '';

    const urlContext = input.projectUrl
      ? `\nAPPLICATION URL: ${input.projectUrl} (use this as the base when referencing specific pages/paths in action steps)`
      : '';

    const pageElementsList =
      input.pageContext?.elements && input.pageContext.elements.length > 0
        ? input.pageContext.elements
            .map(e => `  - <${e.tag || 'el'}> ${e.selector}${e.role || e.text ? `  →  ${[e.role, e.text].filter(Boolean).join(':')}` : ''}`)
            .join('\n')
        : '';

    const pageContextBlock = input.pageContext
      ? `\nSCRAPED PAGE CONTEXT (${input.pageContext.name}, path: ${input.pageContext.path}):\n${
          input.pageContext.description ? `Page Description: ${input.pageContext.description}\n` : ''
        }${
          pageElementsList
            ? `Real UI Elements & Selectors scraped from this page (use these exact labels/controls/selectors in your test scenarios, action steps, and test data so they can be directly converted to automation scripts):\n${pageElementsList}`
            : ''
        }`
      : '';

    const countHeader = hasExplicitCount
      ? `Generate ${input.count} MANUAL test cases (not automation scripts) for the following feature.`
      : `Generate a comprehensive set of MANUAL test cases (not automation scripts) for the following feature. Determine the number of test cases naturally based on the actual scope, flows, and scraped elements of the page/feature.`;

    const countRequirement = hasExplicitCount
      ? `- Generate exactly ${input.count} test cases`
      : `- Generate as many test cases as genuinely needed to cover all real scenarios and scraped UI elements of this feature thoroughly`;

    return `Anda adalah QA Engineer profesional. ${countHeader}

FEATURE: ${input.feature}
${input.description ? `DESCRIPTION: ${input.description}` : ''}
${input.userFlow ? `USER FLOW: ${input.userFlow}` : ''}
${input.expectedResult ? `EXPECTED RESULT: ${input.expectedResult}` : ''}
${input.role ? `ROLE / USER: ${input.role}` : ''}${urlContext}${credentialInfo}${pageContextBlock}

Requirements:
${countRequirement}
- Categorize each test case strictly into one of these 4 types: "Happy Path", "Validation", "Error Case", "Important edge case"
- WAJIB BAHASA INDONESIA: Seluruh narasi pada field "testScenario", "precondition", "actionStep", dan "expectedResult" HARUS ditulis dalam Bahasa Indonesia yang jelas dan natural (jangan gunakan bahasa Inggris untuk narasi).
- KECUALI Nilai State/Dropdown: Field "type" WAJIB tetap menggunakan salah satu dari 4 nilai bahasa Inggris di atas persis ("Happy Path", "Validation", "Error Case", "Important edge case"). Jangan terjemahkan nilai field "type".
- Ensure a good mix of these 4 test case types
- Do NOT invent business rules not mentioned above
- Do NOT generate test cases unrelated to the feature
- Each action step should be numbered in Bahasa Indonesia (e.g. "1. Buka halaman ...\n2. Klik tombol ...")
${pageElementsList ? `- Reference the actual UI labels/selectors from SCRAPED PAGE CONTEXT in actionStep (e.g. quote the button text or mention the selector/field name) so downstream automation conversion can map them directly` : ''}
${hasCredentials ? `- For test cases that require login, include the actual credentials in the testData field (e.g. "Username: ${input.username || 'user'}\\nPassword: ${input.password || 'pass'}")` : ''}
- For negative/invalid test cases, use wrong credentials or edge case values in testData
- testData must be specific and useful (not just '-' unless truly no data needed)
- When testData has more than one field, put each field on its own line with "\\n" (e.g. "Name: John Doe\\nEmail: john@example.com\\nRole: Tenant") — do NOT join multiple fields on a single line with "|", it becomes unreadable in the test case table

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "testCases": [
    {
      "featureModule": "${input.feature}",
      "testScenario": "Deskripsi skenario pengujian dalam Bahasa Indonesia",
      "type": "Happy Path|Validation|Error Case|Important edge case",
      "precondition": "Kondisi awal sebelum pengujian dalam Bahasa Indonesia",
      "actionStep": "1. Langkah pertama dalam Bahasa Indonesia\\n2. Langkah kedua\\n3. Langkah ketiga",
      "testData": "Field: value\\nAnother field: another value (one field per line via \\n, never joined with |)",
      "expectedResult": "Hasil yang diharapkan dalam Bahasa Indonesia"
    }
  ]
}`;
  }

  async generateTestCases(input: TestCaseInput, timeoutMs?: number): Promise<GenerateResult> {
    const { content } = await this.callChatCompletion(
      'Anda adalah QA Engineer profesional. Selalu tulis skenario, precondition, langkah aksi (actionStep), dan expectedResult dalam Bahasa Indonesia (kecuali field "type" yang harus tetap berbahasa Inggris: Happy Path, Validation, Error Case, Important edge case). Kembalikan hanya JSON valid tanpa markdown.',
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
