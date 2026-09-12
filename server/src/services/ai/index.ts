import { AIProvider } from './types';
import { NineRouterProvider } from './nine-router.provider';

export function createAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER || 'nine-router';

  switch (provider) {
    case 'nine-router':
      return new NineRouterProvider();
    default:
      console.warn(`Unknown AI provider: ${provider}, falling back to nine-router`);
      return new NineRouterProvider();
  }
}

export * from './types';
