import { AIProvider, GenerateResult, TestCaseInput } from './types';

export class GeminiProvider implements AIProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || '';
    this.model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    this.baseUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
    this.timeout = process.env.VERCEL
      ? parseInt(process.env.GEMINI_TIMEOUT || '45000', 10)
      : parseInt(process.env.GEMINI_TIMEOUT || '120000', 10);

    if (!this.apiKey) {
      console.warn('[GeminiProvider] GEMINI_API_KEY is not set');
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
            .map(e => `  - Selector: \`${e.selector}\` (${[e.tag, e.role, e.text ? `"${e.text}"` : ''].filter(Boolean).join(' ')})`)
            .join('\n')
        : '';

    const pageContextBlock = input.pageContext
      ? `\nSCRAPED PAGE CONTEXT (${input.pageContext.name}, path: ${input.pageContext.path}):\n${
          input.pageContext.description ? `Page Description: ${input.pageContext.description}\n` : ''
        }${
          pageElementsList
            ? `Real UI Elements & Selectors scraped from this page (CRITICAL: reference these exact selectors and UI labels in your actionStep so they can be 100% mapped to automation scripts):\n${pageElementsList}`
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
${pageElementsList ? `- IMPORTANT: Saat langkah di actionStep berinteraksi dengan elemen dari SCRAPED PAGE CONTEXT, tuliskan narasi langkahnya dalam Bahasa Indonesia namun sertakan selector/label aslinya di dalam tanda kurung/backtick, contoh: 'Klik tombol "Add Label" (\`button:has-text("Add Label")\`)', 'Ketik kata kunci pencarian pada field \`input[placeholder="Search labels..."]\`'` : ''}
${hasCredentials ? `- For test cases that require login, include the actual credentials in the testData field (e.g. "Username: ${input.username || 'user'}\\nPassword: ${input.password || 'pass'}")` : ''}
- For negative/invalid test cases, use wrong credentials or edge case values in testData
- testData must be specific and useful (not just '-' unless truly no data needed)
- When testData has more than one field, put each field on its own line with "\\n" (e.g. "Username: user@example.com\\nPassword: password123") — do NOT join multiple fields on a single line with "|"

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
    const { content } = await this.callGenerateContent(
      'Anda adalah QA Engineer profesional. Selalu tulis skenario, precondition, langkah aksi (actionStep), dan expectedResult dalam Bahasa Indonesia (kecuali field "type" yang harus tetap berbahasa Inggris: Happy Path, Validation, Error Case, Important edge case). Kembalikan hanya JSON valid tanpa markdown.',
      this.buildPrompt(input),
      { timeoutMs, temperature: 0.3, maxTokens: 8192, jsonMode: true }
    );
    return this.parseResponse(content);
  }

  async generateAutomationScript(
    systemPrompt: string,
    userPrompt: string,
    timeoutMs?: number
  ): Promise<{ script: string; truncated: boolean }> {
    const { content, finishReason } = await this.callGenerateContent(
      systemPrompt,
      userPrompt,
      { timeoutMs, temperature: 0.2, maxTokens: 16384, jsonMode: false }
    );

    let script = content.trim();
    const fenceMatch = script.match(/```(?:javascript|js|typescript|ts|python|java)?\s*\n([\s\S]*?)```/i);
    if (fenceMatch && fenceMatch[1]) {
      script = fenceMatch[1].trim();
    } else if (script.startsWith('```')) {
      script = script.replace(/^```(?:javascript|js|python|java|ts|typescript)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    return { script, truncated: finishReason === 'MAX_TOKENS' || finishReason === 'length' };
  }

  private async callGenerateContent(
    systemPrompt: string,
    userPrompt: string,
    opts?: { timeoutMs?: number; temperature?: number; maxTokens?: number; jsonMode?: boolean }
  ): Promise<{ content: string; finishReason?: string }> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY belum diisi di file .env');
    }

    const candidateModels = Array.from(
      new Set([
        this.model,
        'gemini-2.5-flash',
        'gemini-3-flash-preview',
        'gemini-3.7-flash',
        'gemini-3.5-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash-lite',
        'gemini-2.5-flash-lite',
      ])
    );

    let lastError: Error | null = null;

    for (const modelName of candidateModels) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? this.timeout);

      try {
        const url = `${this.baseUrl}/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: userPrompt }],
              },
            ],
            generationConfig: {
              temperature: opts?.temperature ?? 0.3,
              maxOutputTokens: opts?.maxTokens ?? 8192,
              ...(opts?.jsonMode ? { responseMimeType: 'application/json' } : {}),
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          const errorText = await response.text();
          const err = new Error(`Gemini API error (${modelName}): ${response.status} - ${errorText}`);
          // If 503 (high demand), 429 (rate limit), or 500, try the next Gemini model
          if (response.status === 503 || response.status === 429 || response.status >= 500) {
            console.warn(`[GeminiProvider] Model ${modelName} returned ${response.status}, trying fallback Gemini model...`);
            lastError = err;
            continue;
          }
          throw err;
        }

        const data = await response.json() as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string; thought?: boolean }> };
            finishReason?: string;
          }>;
          error?: { message?: string };
        };

        if (data.error) {
          throw new Error(`Gemini error: ${data.error.message || 'Unknown error'}`);
        }

        const candidate = data.candidates?.[0];
        const content = candidate?.content?.parts
          ?.filter(p => !p.thought)
          .map(p => p.text || '')
          .join('') || '';
        if (!content) {
          lastError = new Error(`Gemini (${modelName}) returned empty response`);
          continue;
        }

        return { content, finishReason: candidate?.finishReason };
      } catch (err) {
        clearTimeout(timer);
        lastError = err as Error;
        console.warn(`[GeminiProvider] Error on model ${modelName}:`, (err as Error).message);
      }
    }

    throw lastError || new Error('All Gemini models failed');
  }

  private parseResponse(content: string): GenerateResult {
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }
    return JSON.parse(cleaned) as GenerateResult;
  }
}
