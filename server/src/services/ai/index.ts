import { AIProvider, GenerateResult, TestCaseInput } from './types';
import { NineRouterProvider } from './nine-router.provider';
import { GeminiProvider } from './gemini.provider';

class FallbackAIProvider implements AIProvider {
  constructor(
    private primary: AIProvider,
    private primaryName: string,
    private fallback: AIProvider,
    private fallbackName: string
  ) {}

  async generateTestCases(input: TestCaseInput, timeoutMs?: number): Promise<GenerateResult> {
    try {
      return await this.primary.generateTestCases(input, timeoutMs);
    } catch (primaryErr) {
      console.warn(`[AIProvider] Primary (${this.primaryName}) failed, falling back to ${this.fallbackName}:`, (primaryErr as Error).message);
      return await this.fallback.generateTestCases(input, timeoutMs);
    }
  }

  async generateAutomationScript(
    systemPrompt: string,
    userPrompt: string,
    timeoutMs?: number
  ): Promise<{ script: string; truncated: boolean }> {
    try {
      return await this.primary.generateAutomationScript(systemPrompt, userPrompt, timeoutMs);
    } catch (primaryErr) {
      console.warn(`[AIProvider] Primary (${this.primaryName}) failed, falling back to ${this.fallbackName}:`, (primaryErr as Error).message);
      return await this.fallback.generateAutomationScript(systemPrompt, userPrompt, timeoutMs);
    }
  }
}

export function createAIProvider(): AIProvider {
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const hasGeminiKey = !!process.env.GEMINI_API_KEY?.trim();
  const hasNineRouterKey = !!process.env.NINE_ROUTER_API_KEY?.trim();

  if (provider === 'gemini') {
    const gemini = new GeminiProvider();
    if (hasNineRouterKey) {
      return new FallbackAIProvider(gemini, 'gemini', new NineRouterProvider(), 'nine-router');
    }
    return gemini;
  }

  if (provider === 'nine-router') {
    const nineRouter = new NineRouterProvider();
    if (hasGeminiKey) {
      return new FallbackAIProvider(nineRouter, 'nine-router', new GeminiProvider(), 'gemini');
    }
    return nineRouter;
  }

  console.warn(`Unknown AI provider: ${provider}, falling back to gemini/nine-router`);
  if (hasGeminiKey) {
    return new GeminiProvider();
  }
  return new NineRouterProvider();
}

export * from './types';
export { GeminiProvider } from './gemini.provider';
export { NineRouterProvider } from './nine-router.provider';
