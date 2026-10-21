import { describe, it, expect } from 'vitest';
import { formatPageElements, getSelectorPriorityList } from '../routes/automation';

describe('formatPageElements', () => {
  it('returns an empty placeholder when elements array is empty', () => {
    expect(formatPageElements([])).toBe('  (no readable elements)');
  });

  it('formats a well-formed element as "selector → role:text"', () => {
    const out = formatPageElements([
      { selector: '[data-testid="login-btn"]', tag: 'button', role: 'button', text: 'Login' },
    ]);
    expect(out).toContain('<button> [data-testid="login-btn"]  →  button:Login');
  });

  it('skips entries without a selector string', () => {
    const out = formatPageElements([
      { selector: '', tag: 'button', text: 'Orphan' },
      { selector: '[data-testid="ok"]', tag: 'div', text: 'OK' },
    ]);
    expect(out).not.toContain('Orphan');
    expect(out).toContain('[data-testid="ok"]');
  });

  it('handles non-object / non-array items gracefully without throwing', () => {
    const out = formatPageElements([null, 'string', 42, { tag: 'div' }, { selector: '#a' }]);
    expect(out).toContain('#a');
    expect(out).not.toContain('[object Object]');
  });
});

describe('getSelectorPriorityList', () => {
  it('returns a six-step prioritized list for each supported tool', () => {
    for (const tool of ['cypress', 'playwright', 'selenium'] as const) {
      const list = getSelectorPriorityList(tool);
      expect(list.startsWith('1. ')).toBe(true);
      expect(list.match(/^[1-6]\./gm)).toHaveLength(6);
    }
  });

  it('mentions the validated-library TODO fallback for every tool', () => {
    expect(getSelectorPriorityList('cypress')).toContain('// TODO: verify selector');
    expect(getSelectorPriorityList('playwright')).toContain('// TODO: verify selector');
    expect(getSelectorPriorityList('selenium')).toContain('// TODO: verify selector');
  });

  it('contains the tool-correct locator API', () => {
    expect(getSelectorPriorityList('cypress')).toContain('cy.contains');
    expect(getSelectorPriorityList('playwright')).toContain('page.getByRole');
    expect(getSelectorPriorityList('selenium')).toContain('driver.findElement(By.');
  });
});
