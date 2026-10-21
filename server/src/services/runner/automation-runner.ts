import vm from 'vm';
import fs from 'fs';

export interface SingleTestRunResult {
  suite: string;
  title: string;
  testCaseId?: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
}

export interface AutomationRunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  results: SingleTestRunResult[];
}

export interface ScannedElement {
  selector: string;
  tag: string;
  role: string;
  text: string;
}

// Finds a usable local Chrome/Chromium executable on macOS/Linux/Windows if
// Playwright's bundled browser is not downloaded.
function findSystemChromePath(): string | undefined {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter((p): p is string => !!p);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }
  return undefined;
}

// Dynamically loads playwright-core or playwright so the server still compiles
// and runs on environments where playwright isn't bundled.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadChromium(): Promise<any> {
  const moduleNames = ['playwright-core', 'playwright', '@playwright/test'];
  for (const modName of moduleNames) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(modName);
      if (mod?.chromium) return mod.chromium;
    } catch {
      // try next
    }
  }
  throw new Error(
    'Playwright belum terinstall di environment lokal. Jalankan: npm install -D playwright-core'
  );
}

// Launches a local Chromium/Chrome browser instance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function launchLocalBrowser(headless = false): Promise<any> {
  const chromium = await loadChromium();
  const executablePath = findSystemChromePath();
  const slowMo = headless ? 0 : 180;

  try {
    return await chromium.launch({
      headless,
      slowMo,
      ...(executablePath ? { executablePath } : {}),
    });
  } catch (firstErr) {
    // If default launch failed without executablePath, or vice versa, try without executablePath
    if (executablePath) {
      return await chromium.launch({ headless, slowMo });
    }
    throw firstErr;
  }
}

// Extracts a Test Case ID like TC001 from a test title or comment if present.
export function extractTestCaseId(text: string): string | undefined {
  const match = text.match(/\b(TC[-_]?\d+)\b/i);
  return match ? match[1].toUpperCase().replace(/[-_]/, '') : undefined;
}

// Strips TypeScript type annotations from Playwright `.spec.ts` scripts so they
// can be executed inside Node's VM without needing a separate TS compiler pass.
export function transpileScriptForVm(rawCode: string): string {
  return rawCode
    // Remove `import ... from ...;` lines
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    // Remove `const { ... } = require(...);` for selenium-webdriver / @playwright/test
    .replace(/^\s*const\s+\{[^}]*\}\s*=\s*require\(['"](?:selenium-webdriver|@playwright\/test)['"]\);?\s*$/gm, '')
    // Remove common inline TS type annotations like `: Page`, `: string`, `: any` in params
    .replace(/(\(\s*\{[^}]+\}\s*):\s*[A-Za-z0-9_<>{}[\],\s|]+(\))/g, '$1$2')
    // Remove `as any` / `as string` / `as HTMLElement`
    .replace(/\s+as\s+[A-Za-z0-9_<>{}[\]|]+/g, '');
}

interface CollectedTest {
  suite: string;
  title: string;
  testCaseId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  beforeEachFns: Array<(arg?: any) => any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (arg?: any) => any;
}

/**
 * Runs an automation script (Cypress, Playwright, or Selenium) against a real
 * local browser using Playwright's engine.
 */
export async function runAutomationScript(options: {
  script: string;
  tool: 'cypress' | 'playwright' | 'selenium';
  baseUrl?: string | null;
  headless?: boolean;
  timeoutMs?: number;
}): Promise<AutomationRunSummary> {
  if (process.env.VERCEL) {
    throw new Error(
      'Fitur Run Automation lokal hanya dapat dijalankan di server lokal (npm run dev), tidak di Vercel Serverless.'
    );
  }

  const { tool, baseUrl, headless = false, timeoutMs = 15000 } = options;
  let code = options.script;

  // Replace TODO_URL with actual project baseUrl if available
  if (baseUrl) {
    code = code.replace(/['"]TODO_URL['"]/g, JSON.stringify(baseUrl));
  }

  // Annotate each `it(` / `test(` with preceding `// TCxxx` comment if the comment has the ID
  code = code.replace(
    /\/\/\s*(TC[-_]?\d+)[^\n]*\n(\s*(?:it|test)\s*\(\s*(['"`]))/gi,
    (_m, tcId: string, prefix: string, quote: string) => `${prefix}[${tcId.toUpperCase()}] ` + (quote ? '' : '')
  );

  const cleanedCode = transpileScriptForVm(code);

  // Collect suites and tests by evaluating the test file structure
  const collectedTests: CollectedTest[] = [];
  const suiteStack: Array<{
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeEachFns: Array<(arg?: any) => any>;
  }> = [{ name: 'Root', beforeEachFns: [] }];

  // Pending Cypress command queue for the current running test
  let cyQueue: Array<() => Promise<void>> = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activePage: any = null;

  // Resolve relative URLs against baseUrl
  const resolveUrl = (url: string): string => {
    if (!url || url === 'TODO_URL') {
      if (baseUrl) return baseUrl;
      throw new Error('URL belum diisi (masih TODO_URL). Isi Project URL di pengaturan Project atau ganti TODO_URL di script.');
    }
    if (/^https?:\/\//i.test(url)) return url;
    if (baseUrl) {
      return new URL(url, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
    }
    return url;
  };

  // --- Cypress (`cy.*`) Shim backed by Playwright `activePage` ---
  const createChainable = (getLocatorPromise: () => Promise<any>) => {
    const chain = {
      click: () => {
        cyQueue.push(async () => {
          const loc = await getLocatorPromise();
          await loc.first().click({ timeout: timeoutMs });
        });
        return chain;
      },
      type: (value: string) => {
        cyQueue.push(async () => {
          const loc = await getLocatorPromise();
          await loc.first().fill(String(value), { timeout: timeoutMs });
        });
        return chain;
      },
      clear: () => {
        cyQueue.push(async () => {
          const loc = await getLocatorPromise();
          await loc.first().fill('', { timeout: timeoutMs });
        });
        return chain;
      },
      check: () => {
        cyQueue.push(async () => {
          const loc = await getLocatorPromise();
          await loc.first().check({ timeout: timeoutMs });
        });
        return chain;
      },
      uncheck: () => {
        cyQueue.push(async () => {
          const loc = await getLocatorPromise();
          await loc.first().uncheck({ timeout: timeoutMs });
        });
        return chain;
      },
      select: (value: string) => {
        cyQueue.push(async () => {
          const loc = await getLocatorPromise();
          await loc.first().selectOption(String(value), { timeout: timeoutMs });
        });
        return chain;
      },
      first: () => createChainable(async () => (await getLocatorPromise()).first()),
      last: () => createChainable(async () => (await getLocatorPromise()).last()),
      eq: (index: number) => createChainable(async () => (await getLocatorPromise()).nth(index)),
      contains: (textOrSelector: string, maybeText?: string) => {
        return createChainable(async () => {
          const base = await getLocatorPromise();
          if (maybeText !== undefined) {
            return base.locator(textOrSelector).filter({ hasText: maybeText });
          }
          return base.getByText(textOrSelector);
        });
      },
      should: (assertion: string, expected?: unknown) => {
        cyQueue.push(async () => {
          const target = await getLocatorPromise();
          // URL / string assertion when comes from cy.url()
          if (typeof target === 'string') {
            const actualUrl = activePage.url();
            if (assertion.includes('include') || assertion.includes('contain')) {
              if (!actualUrl.includes(String(expected ?? ''))) {
                throw new Error(`Expected URL "${actualUrl}" to include "${expected}"`);
              }
            } else if (assertion.includes('eq')) {
              if (actualUrl !== String(expected ?? '')) {
                throw new Error(`Expected URL "${actualUrl}" to equal "${expected}"`);
              }
            }
            return;
          }

          const loc = target.first();
          const norm = assertion.toLowerCase();
          if (norm === 'be.visible') {
            await loc.waitFor({ state: 'visible', timeout: timeoutMs });
          } else if (norm === 'not.be.visible' || norm === 'be.hidden') {
            await loc.waitFor({ state: 'hidden', timeout: timeoutMs });
          } else if (norm === 'exist') {
            await loc.waitFor({ state: 'attached', timeout: timeoutMs });
          } else if (norm === 'not.exist') {
            await loc.waitFor({ state: 'detached', timeout: timeoutMs });
          } else if (norm === 'contain' || norm === 'contain.text' || norm === 'include.text') {
            await loc.waitFor({ state: 'attached', timeout: timeoutMs });
            const text = (await loc.textContent()) || '';
            if (!text.toLowerCase().includes(String(expected ?? '').toLowerCase())) {
              throw new Error(`Expected element text "${text.trim()}" to contain "${expected}"`);
            }
          } else if (norm === 'have.text') {
            await loc.waitFor({ state: 'attached', timeout: timeoutMs });
            const text = ((await loc.textContent()) || '').trim();
            if (text !== String(expected ?? '').trim()) {
              throw new Error(`Expected element text "${text}" to equal "${expected}"`);
            }
          } else if (norm === 'have.value') {
            const val = await loc.inputValue({ timeout: timeoutMs });
            if (val !== String(expected ?? '')) {
              throw new Error(`Expected input value "${val}" to equal "${expected}"`);
            }
          } else if (norm === 'be.disabled') {
            const disabled = await loc.isDisabled({ timeout: timeoutMs });
            if (!disabled) throw new Error('Expected element to be disabled');
          } else if (norm === 'be.enabled' || norm === 'not.be.disabled') {
            const enabled = await loc.isEnabled({ timeout: timeoutMs });
            if (!enabled) throw new Error('Expected element to be enabled');
          } else {
            await loc.waitFor({ state: 'attached', timeout: timeoutMs });
          }
        });
        return chain;
      },
      and: (assertion: string, expected?: unknown) => chain.should(assertion, expected),
    };
    return chain;
  };

  const cy = {
    visit: (url: string) => {
      cyQueue.push(async () => {
        await activePage.goto(resolveUrl(url), { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      });
      return createChainable(async () => activePage.locator('body'));
    },
    get: (selector: string) => {
      if (selector.includes('TODO_SELECTOR')) {
        cyQueue.push(async () => {
          throw new Error(
            'Script masih menggunakan placeholder "TODO_SELECTOR". Ganti TODO_SELECTOR di Editor dengan selector elemen asli (atau gunakan fitur Scan Page).'
          );
        });
      }
      return createChainable(async () => activePage.locator(selector));
    },
    contains: (arg1: string, arg2?: string) => {
      return createChainable(async () => {
        if (arg2 !== undefined) {
          return activePage.locator(arg1).filter({ hasText: arg2 });
        }
        return activePage.getByText(arg1);
      });
    },
    url: () => createChainable(async () => activePage.url()),
    wait: (ms: number) => {
      cyQueue.push(async () => {
        if (typeof ms === 'number') {
          await activePage.waitForTimeout(Math.min(ms, 10000));
        }
      });
      return createChainable(async () => activePage.locator('body'));
    },
    reload: () => {
      cyQueue.push(async () => {
        await activePage.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs });
      });
      return createChainable(async () => activePage.locator('body'));
    },
  };

  // --- Playwright `expect` Shim ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expectShim = (actual: any) => {
    const buildMatchers = (isNot = false) => ({
      toBeVisible: async () => {
        if (actual && typeof actual.first === 'function') {
          await actual.first().waitFor({ state: isNot ? 'hidden' : 'visible', timeout: timeoutMs });
        }
      },
      toBeHidden: async () => {
        if (actual && typeof actual.first === 'function') {
          await actual.first().waitFor({ state: isNot ? 'visible' : 'hidden', timeout: timeoutMs });
        }
      },
      toBeAttached: async () => {
        if (actual && typeof actual.first === 'function') {
          await actual.first().waitFor({ state: isNot ? 'detached' : 'attached', timeout: timeoutMs });
        }
      },
      toContainText: async (expected: string | RegExp) => {
        if (actual && typeof actual.first === 'function') {
          await actual.first().waitFor({ state: 'attached', timeout: timeoutMs });
          const text = (await actual.first().textContent()) || '';
          const matched = expected instanceof RegExp ? expected.test(text) : text.toLowerCase().includes(String(expected).toLowerCase());
          if (isNot ? matched : !matched) {
            throw new Error(`Expected element text "${text.trim()}" ${isNot ? 'not ' : ''}to contain "${expected}"`);
          }
        }
      },
      toHaveText: async (expected: string | RegExp) => {
        if (actual && typeof actual.first === 'function') {
          await actual.first().waitFor({ state: 'attached', timeout: timeoutMs });
          const text = ((await actual.first().textContent()) || '').trim();
          const matched = expected instanceof RegExp ? expected.test(text) : text === String(expected).trim();
          if (isNot ? matched : !matched) {
            throw new Error(`Expected element text "${text}" ${isNot ? 'not ' : ''}to equal "${expected}"`);
          }
        }
      },
      toHaveValue: async (expected: string | RegExp) => {
        if (actual && typeof actual.first === 'function') {
          const val = await actual.first().inputValue({ timeout: timeoutMs });
          const matched = expected instanceof RegExp ? expected.test(val) : val === String(expected);
          if (isNot ? matched : !matched) {
            throw new Error(`Expected input value "${val}" ${isNot ? 'not ' : ''}to equal "${expected}"`);
          }
        }
      },
      toHaveURL: async (expected: string | RegExp) => {
        const currentUrl = typeof actual?.url === 'function' ? actual.url() : String(actual);
        const matched = expected instanceof RegExp ? expected.test(currentUrl) : currentUrl.includes(String(expected));
        if (isNot ? matched : !matched) {
          throw new Error(`Expected URL "${currentUrl}" ${isNot ? 'not ' : ''}to match "${expected}"`);
        }
      },
      toHaveTitle: async (expected: string | RegExp) => {
        const title = typeof actual?.title === 'function' ? await actual.title() : String(actual);
        const matched = expected instanceof RegExp ? expected.test(title) : title.includes(String(expected));
        if (isNot ? matched : !matched) {
          throw new Error(`Expected title "${title}" ${isNot ? 'not ' : ''}to match "${expected}"`);
        }
      },
      toBeEnabled: async () => {
        if (actual && typeof actual.first === 'function') {
          const enabled = await actual.first().isEnabled({ timeout: timeoutMs });
          if (isNot ? enabled : !enabled) throw new Error(`Expected element ${isNot ? 'not ' : ''}to be enabled`);
        }
      },
      toBeDisabled: async () => {
        if (actual && typeof actual.first === 'function') {
          const disabled = await actual.first().isDisabled({ timeout: timeoutMs });
          if (isNot ? disabled : !disabled) throw new Error(`Expected element ${isNot ? 'not ' : ''}to be disabled`);
        }
      },
      toBe: (expected: unknown) => {
        const pass = actual === expected;
        if (isNot ? pass : !pass) throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not ' : ''}to be ${JSON.stringify(expected)}`);
      },
      toEqual: (expected: unknown) => {
        const pass = JSON.stringify(actual) === JSON.stringify(expected);
        if (isNot ? pass : !pass) throw new Error(`Expected ${JSON.stringify(actual)} ${isNot ? 'not ' : ''}to equal ${JSON.stringify(expected)}`);
      },
      toContain: (expected: unknown) => {
        const pass = String(actual).includes(String(expected));
        if (isNot ? pass : !pass) throw new Error(`Expected "${actual}" ${isNot ? 'not ' : ''}to contain "${expected}"`);
      },
      toBeTruthy: () => {
        const pass = Boolean(actual);
        if (isNot ? pass : !pass) throw new Error(`Expected value ${isNot ? 'not ' : ''}to be truthy`);
      },
    });

    return {
      ...buildMatchers(false),
      not: buildMatchers(true),
    };
  };

  // --- Selenium (`driver`, `By`) Shim backed by Playwright `activePage` ---
  const By = {
    css: (sel: string) => ({ type: 'css', value: sel }),
    id: (id: string) => ({ type: 'css', value: `#${id}` }),
    xpath: (xp: string) => ({ type: 'xpath', value: `xpath=${xp}` }),
    name: (name: string) => ({ type: 'css', value: `[name="${name}"]` }),
    className: (cls: string) => ({ type: 'css', value: `.${cls}` }),
    linkText: (txt: string) => ({ type: 'text', value: txt }),
  };

  const driver = {
    get: async (url: string) => {
      await activePage.goto(resolveUrl(url), { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    },
    findElement: async (locator: { type: string; value: string }) => {
      if (locator?.value?.includes('TODO_SELECTOR')) {
        throw new Error(
          'Script masih menggunakan placeholder "TODO_SELECTOR". Ganti TODO_SELECTOR di Editor dengan selector elemen asli.'
        );
      }
      const pwLocator =
        locator?.type === 'text'
          ? activePage.getByText(locator.value).first()
          : activePage.locator(locator?.value || 'body').first();
      await pwLocator.waitFor({ state: 'attached', timeout: timeoutMs });
      return {
        click: () => pwLocator.click({ timeout: timeoutMs }),
        sendKeys: (val: string) => pwLocator.fill(String(val), { timeout: timeoutMs }),
        clear: () => pwLocator.fill('', { timeout: timeoutMs }),
        getText: async () => (await pwLocator.textContent()) || '',
        isDisplayed: () => pwLocator.isVisible(),
      };
    },
    getCurrentUrl: async () => activePage.url(),
    getTitle: async () => activePage.title(),
    quit: async () => {},
  };

  // --- Suite & Test registration DSL ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const describeFn = (suiteName: string, fn: () => any) => {
    const parentBeforeEach = suiteStack[suiteStack.length - 1]?.beforeEachFns || [];
    suiteStack.push({ name: suiteName, beforeEachFns: [...parentBeforeEach] });
    try {
      fn();
    } finally {
      suiteStack.pop();
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const beforeEachFn = (fn: (arg?: any) => any) => {
    const current = suiteStack[suiteStack.length - 1];
    if (current) {
      current.beforeEachFns.push(fn);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registerTest = (title: string, fn: (arg?: any) => any) => {
    const current = suiteStack[suiteStack.length - 1];
    collectedTests.push({
      suite: current?.name || 'Default',
      title,
      testCaseId: extractTestCaseId(title),
      beforeEachFns: [...(current?.beforeEachFns || [])],
      fn,
    });
  };

  const testFn = Object.assign(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (title: string, fn: (arg?: any) => any) => registerTest(title, fn),
    {
      describe: describeFn,
      beforeEach: beforeEachFn,
      beforeAll: () => {},
      afterEach: () => {},
      afterAll: () => {},
    }
  );

  // Build sandbox and evaluate the script to collect tests
  const sandbox = {
    describe: describeFn,
    context: describeFn,
    it: registerTest,
    test: testFn,
    beforeEach: beforeEachFn,
    before: () => {},
    after: () => {},
    afterEach: () => {},
    cy,
    expect: expectShim,
    By,
    Builder: function () {
      return {
        forBrowser: () => ({
          build: async () => driver,
        }),
      };
    },
    driver,
    console,
    setTimeout,
    clearTimeout,
  };

  try {
    vm.runInNewContext(cleanedCode, sandbox, { timeout: 5000 });
  } catch (syntaxErr) {
    throw new Error(`Script tidak dapat dikompilasi: ${(syntaxErr as Error).message}`);
  }

  if (collectedTests.length === 0) {
    throw new Error('Tidak ditemukan blok it() atau test() di dalam script ini.');
  }

  const browser = await launchLocalBrowser(headless);
  const results: SingleTestRunResult[] = [];
  const overallStart = Date.now();

  try {
    const context = await browser.newContext({
      ...(baseUrl ? { baseURL: baseUrl } : {}),
      viewport: { width: 1280, height: 760 },
    });
    const rawPage = await context.newPage();
    rawPage.setDefaultTimeout(timeoutMs);

    let isInBeforeEach = false;
    let isSessionLoggedIn = false;

    const updateLiveBanner = async (text: string, bg = '#0f172a', accent = '#0ABAB5') => {
      if (headless) return;
      await rawPage.evaluate(
        ({ msg, bgColor, accentColor }: { msg: string; bgColor: string; accentColor: string }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const doc = (globalThis as any).document;
          if (!doc || !doc.body) return;
          let el = doc.getElementById('__qa_studio_live_hud__');
          if (!el) {
            el = doc.createElement('div');
            el.id = '__qa_studio_live_hud__';
            el.style.cssText =
              'position:fixed;bottom:16px;right:16px;z-index:2147483647;padding:10px 14px;border-radius:10px;color:#fff;font-family:system-ui,-apple-system,sans-serif;font-size:12px;font-weight:600;box-shadow:0 10px 25px rgba(0,0,0,0.35);pointer-events:none;max-width:420px;line-height:1.4;transition:all 0.2s ease;';
            doc.body.appendChild(el);
          }
          el.style.background = bgColor;
          el.style.borderLeft = `4px solid ${accentColor}`;
          el.textContent = msg;
        },
        { msg: text, bgColor: bg, accentColor: accent }
      ).catch(() => {});
    };

    // Wrap rawPage.locator / goto so TODO_SELECTOR and relative URLs produce helpful errors,
    // and so repeated beforeEach() login blocks automatically reuse the active logged-in session.
    const wrappedPage = new Proxy(rawPage, {
      get(target, prop) {
        if (prop === 'goto') {
          return async (url: string, opts?: Record<string, unknown>) => {
            const resolved = resolveUrl(url);
            if (isInBeforeEach && isSessionLoggedIn && /\/login\b/i.test(resolved)) {
              return null;
            }
            const res = await target.goto(resolved, { waitUntil: 'domcontentloaded', timeout: timeoutMs, ...opts });
            await target.waitForTimeout(400).catch(() => {});
            return res;
          };
        }
        if (prop === 'locator') {
          return (selector: string, opts?: Record<string, unknown>) => {
            if (typeof selector === 'string' && selector.includes('TODO_SELECTOR')) {
              throw new Error(
                'Script masih menggunakan placeholder "TODO_SELECTOR". Ganti TODO_SELECTOR di Editor dengan selector elemen asli (atau gunakan fitur Scan Page).'
              );
            }
            // Safeguard: if a script mistakenly targeted a "Forgot password?" link for password input, redirect to actual password input
            const effectiveSelector =
              typeof selector === 'string' && /^a:has-text\([^)]*password[^)]*\)$/i.test(selector.trim())
                ? '#password, input[type="password"]'
                : selector;
            const realLoc = target.locator(effectiveSelector, opts);
            if (
              isInBeforeEach &&
              isSessionLoggedIn &&
              typeof selector === 'string' &&
              /(#email|#password|type=["']email["']|type=["']password["']|:has-text\(["'](?:login|masuk|sign in)["']\))/i.test(selector)
            ) {
              return new Proxy(realLoc, {
                get(locTarget, locProp) {
                  if (locProp === 'fill' || locProp === 'click' || locProp === 'type') {
                    return async (...args: unknown[]) => {
                      const visible = await locTarget.first().isVisible().catch(() => false);
                      if (!visible) return;
                      return locTarget[locProp](...args);
                    };
                  }
                  const v = locTarget[locProp];
                  return typeof v === 'function' ? v.bind(locTarget) : v;
                },
              });
            }
            return realLoc;
          };
        }
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    try {
      for (let idx = 0; idx < collectedTests.length; idx++) {
        const item = collectedTests[idx];
        const testStart = Date.now();
        const cleanTitle = item.title.replace(/^\[TC\d+\]\s*/i, '');
        const labelPrefix = item.testCaseId ? `[${item.testCaseId}] ` : '';

        activePage = wrappedPage;
        cyQueue = [];

        // Dismiss any leftover modal/dialog from previous test case
        if (idx > 0) {
          await rawPage.keyboard.press('Escape').catch(() => {});
          await rawPage.waitForTimeout(200).catch(() => {});
        }

        await updateLiveBanner(`▶ (${idx + 1}/${collectedTests.length}) ${labelPrefix}${cleanTitle}`);

        try {
          isInBeforeEach = true;
          for (const hook of item.beforeEachFns) {
            await hook({ page: wrappedPage });
          }
          isInBeforeEach = false;

          // If we are no longer on /login after beforeEach, mark session as logged in
          const currentUrl = rawPage.url();
          if (currentUrl && currentUrl !== 'about:blank' && !/\/login\b/i.test(currentUrl)) {
            isSessionLoggedIn = true;
          }

          await updateLiveBanner(`▶ (${idx + 1}/${collectedTests.length}) ${labelPrefix}${cleanTitle}`);
          await item.fn({ page: wrappedPage });

          // Drain queued Cypress commands if tool is cypress (or if cy.* was used)
          if (tool === 'cypress' || cyQueue.length > 0) {
            for (const step of cyQueue) {
              await step();
            }
          }

          await updateLiveBanner(`✓ PASSED (${idx + 1}/${collectedTests.length}) ${labelPrefix}${cleanTitle}`, '#064e3b', '#10b981');
          results.push({
            suite: item.suite,
            title: cleanTitle,
            testCaseId: item.testCaseId,
            status: 'passed',
            durationMs: Date.now() - testStart,
          });
        } catch (err) {
          isInBeforeEach = false;
          const rawMsg = (err as Error).message || String(err);
          const conciseError = rawMsg.split('\n').slice(0, 4).join('\n');
          await updateLiveBanner(`✕ FAILED (${idx + 1}/${collectedTests.length}) ${labelPrefix}${cleanTitle}`, '#7f1d1d', '#ef4444');
          results.push({
            suite: item.suite,
            title: cleanTitle,
            testCaseId: item.testCaseId,
            status: 'failed',
            durationMs: Date.now() - testStart,
            error: conciseError,
          });
        }
      }

      if (!headless) {
        await rawPage.waitForTimeout(1000).catch(() => {});
      }
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  return {
    total: results.length,
    passed,
    failed,
    skipped,
    durationMs: Date.now() - overallStart,
    results,
  };
}

export interface ScanAuthOptions {
  loginUrl?: string;
  username?: string;
  password?: string;
  headless?: boolean;
}

/**
 * Scans a live page URL using local Chromium and extracts interactive
 * DOM elements so the AI generator can use real, verified selectors.
 * Supports automatic login when `auth.username` and `auth.password` are provided.
 */
export async function scanPageElementsLocal(
  targetUrl: string,
  timeoutMs = 25000,
  auth?: ScanAuthOptions
): Promise<ScannedElement[]> {
  const headless = auth?.headless ?? false;
  const browser = await launchLocalBrowser(headless);
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    // Perform automatic login first if credentials are provided
    if (auth?.username && auth?.password) {
      const loginTarget = auth.loginUrl || targetUrl;
      await page.goto(loginTarget, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForTimeout(1500);

      // Find username / email input
      const userSelectors = [
        'input[type="email"]',
        'input[name*="email" i]',
        'input[name*="user" i]',
        'input[id*="email" i]',
        'input[id*="user" i]',
        'input[placeholder*="email" i]',
        'input[placeholder*="user" i]',
        'input[type="text"]',
      ];
      let userFilled = false;
      for (const sel of userSelectors) {
        const loc = page.locator(sel).first();
        if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
          await loc.fill(auth.username);
          userFilled = true;
          break;
        }
      }

      // Find password input
      const passLoc = page.locator('input[type="password"]').first();
      if ((await passLoc.count()) > 0 && (await passLoc.isVisible().catch(() => false))) {
        await passLoc.fill(auth.password);
      } else if (!userFilled) {
        throw new Error(
          `Form login tidak ditemukan di ${loginTarget}. Pastikan Login Path sudah benar.`
        );
      }

      // Click submit / login button or press Enter
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("Masuk")',
        'button:has-text("Sign in")',
        'button:has-text("Log in")',
        '[role="button"]:has-text("Login")',
        '[role="button"]:has-text("Masuk")',
      ];
      let submitted = false;
      for (const sel of submitSelectors) {
        const btn = page.locator(sel).first();
        if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
          await btn.click();
          submitted = true;
          break;
        }
      }
      if (!submitted) {
        await passLoc.press('Enter').catch(() => {});
      }

      // Wait for login request + redirect/token storage to complete
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    // Brief wait for client-side SPA frameworks (React/Vite/Next) to hydrate
    await page.waitForTimeout(2000);

    const extractVisibleDomElements = async (): Promise<ScannedElement[]> =>
      page.evaluate(() => {
        const results: Array<{ selector: string; tag: string; role: string; text: string }> = [];
        const seen = new Set<string>();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = (globalThis as any).document;
        const nodes = doc.querySelectorAll(
          'button, a[href], input, select, textarea, [role="button"], [data-testid], [data-cy]'
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodes.forEach((el: any) => {
          const htmlEl = el;
          const tag = el.tagName.toLowerCase();

          // Build best stable selector
          let selector = '';
          const testId = el.getAttribute('data-testid');
          const dataCy = el.getAttribute('data-cy');
          const id = el.getAttribute('id');
          const name = el.getAttribute('name');
          const type = el.getAttribute('type');
          const placeholder = el.getAttribute('placeholder');
          const ariaLabel = el.getAttribute('aria-label');
          const visibleText = (htmlEl.innerText || htmlEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50);

          if (testId) {
            selector = `[data-testid="${testId}"]`;
          } else if (dataCy) {
            selector = `[data-cy="${dataCy}"]`;
          } else if (id && !/\d{5,}/.test(id) && !/^(_r_|radix-|:[rR])/i.test(id)) {
            selector = `#${id}`;
          } else if (name) {
            selector = `${tag}[name="${name}"]`;
          } else if (ariaLabel) {
            selector = `${tag}[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
          } else if (placeholder) {
            selector = `${tag}[placeholder="${placeholder.replace(/"/g, '\\"')}"]`;
          } else if ((tag === 'button' || tag === 'a') && visibleText) {
            selector = `${tag}:has-text("${visibleText.replace(/"/g, '\\"')}")`;
          } else if (tag === 'input' && type) {
            selector = `input[type="${type}"]`;
          }

          if (!selector || seen.has(selector)) return;
          seen.add(selector);

          const role = el.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'input' ? `input:${type || 'text'}` : tag);
          const text = visibleText || placeholder || ariaLabel || name || id || '';

          results.push({ selector, tag, role, text });
        });

        return results.slice(0, 80);
      });

    const elements = await extractVisibleDomElements();
    const seenSelectors = new Set(elements.map(e => e.selector));

    // Also probe safe modal/drawer trigger buttons (e.g. "Add ...", "Tambah ...", "Create ...", "New ...")
    // so form inputs and buttons inside modals get captured in the same scan!
    const modalTriggers = elements.filter(
      e =>
        e.tag === 'button' &&
        /^(add|tambah|create|buat|new)\b/i.test((e.text || '').trim())
    );
    for (const trigger of modalTriggers.slice(0, 2)) {
      try {
        const loc = page.locator(trigger.selector).first();
        if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
          await loc.click({ timeout: 2500 });
          await page.waitForTimeout(800);
          const modalElements = await extractVisibleDomElements();
          for (const me of modalElements) {
            if (!seenSelectors.has(me.selector)) {
              seenSelectors.add(me.selector);
              elements.push(me);
            }
          }
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(300);
        }
      } catch {
        // Ignore if trigger navigated or couldn't be clicked cleanly
      }
    }

    await context.close().catch(() => {});
    return elements.slice(0, 100);
  } finally {
    await browser.close().catch(() => {});
  }
}
