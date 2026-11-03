// Test-only Chrome API boundary fixture. Product files are copied, never edited.
// Chromium's UI locale follows the OS on some platforms despite --lang; this
// controls that API input while exercising the actual catalog/worker/UI code.
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export async function openLocaleHarness(chromium, tag, { blockNetwork = true, extensionPath = join(root, 'extension'), contentPrelude = '' } = {}) {
  const temporary = await mkdtemp(join(tmpdir(), 'lexiloom-locale-'));
  const extension = join(temporary, 'extension');
  await cp(extensionPath, extension, { recursive: true });
  if (contentPrelude) {
    const content = join(extension, 'content.js');
    await writeFile(content, `${contentPrelude}\n${await readFile(content, 'utf8')}`);
  }
  const shim = `(() => {
  const read = () => ${JSON.stringify(tag)};
  try { chrome.i18n.getUILanguage = read; }
  catch { Object.defineProperty(chrome.i18n, 'getUILanguage', { configurable: true, value: read }); }
})();
`;
  await writeFile(join(extension, 'qa-locale.js'), shim);
  const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
  for (const script of manifest.content_scripts || []) script.js.unshift('qa-locale.js');
  await writeFile(join(extension, 'manifest.json'), JSON.stringify(manifest));
  const workerFile = manifest.background.service_worker;
  const relative = posix.relative(posix.dirname(workerFile), 'qa-locale.js');
  const specifier = relative.startsWith('.') ? relative : `./${relative}`;
  await writeFile(join(extension, workerFile), `import ${JSON.stringify(specifier)};\n${await readFile(join(extension, workerFile), 'utf8')}`);
  for (const name of await readdir(extension)) {
    if (!name.endsWith('.html')) continue;
    const path = join(extension, name);
    const html = await readFile(path, 'utf8');
    await writeFile(path, html.replace(/<head(?:\s[^>]*)?>/i, '$&<script src="qa-locale.js"></script>'));
  }
  let context;
  let closing = false;
  try {
    context = await chromium.launchPersistentContext(join(temporary, 'profile'), {
      channel: 'chromium', headless: true, viewport: { width: 1280, height: 960 },
      // Animation assertions must not inherit the runner OS accessibility setting.
      // The browser suite also explicitly checks reduced-motion behavior.
      locale: tag, reducedMotion: 'no-preference',
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
    const extensionId = new URL(worker.url()).host;
    await worker.evaluate(async blockNetwork => {
      globalThis.__LEXILOOM_QA_ORIGINAL_FETCH__ = globalThis.fetch;
      globalThis.__LEXILOOM_QA_REQUESTS__ = [];
      if (blockNetwork) {
        globalThis.fetch = async (url, init) => {
          if (String(url).startsWith('chrome-extension://')) return globalThis.__LEXILOOM_QA_ORIGINAL_FETCH__(url, init);
          globalThis.__LEXILOOM_QA_REQUESTS__.push(String(url));
          throw new Error('Unexpected external request in locale fixture QA');
        };
      }
      await chrome.storage.local.set({ settings: { enabled: true, provider: 'demo', englishProvider: 'demo', chineseRegion: 'auto', bridgeToken: '' } });
    }, blockNetwork);
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.evaluate(async () => { await globalThis.LexiLoomI18n.ready; });
    const page = await context.newPage();
    // GitHub macOS runners can inherit OS "Reduce motion". Context options are not
    // always enough for later media checks, so force the feature on every page.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const errors = [];
    context.on('page', candidate => {
      candidate.on('pageerror', error => errors.push(error.message));
      candidate.on('load', () => {
        if (closing || candidate.isClosed()) return;
        void candidate.emulateMedia({ reducedMotion: 'no-preference' }).catch(error => {
          if (!closing && !candidate.isClosed()) errors.push(`Media emulation: ${error.message}`);
        });
      });
    });
    page.on('pageerror', error => errors.push(error.message));
    const html = await readFile(join(root, 'tests/fixtures/reading.html'), 'utf8');
    await context.route('http://locale.lexiloom.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('http://locale.lexiloom.test/');
    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
    });
    function find(node, predicate) {
      if (predicate(node)) return node;
      for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
        const value = find(child, predicate); if (value) return value;
      }
    }
    async function panel(selector, expression = 'return true') {
      const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
      const host = find(root, node => node.localName === 'lexiloom-reader');
      const shadow = host?.shadowRoots?.[0]?.nodeId;
      if (!shadow) return null;
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: shadow, selector });
      if (!nodeId) return null;
      const { object } = await cdp.send('DOM.resolveNode', { nodeId });
      const { result, exceptionDetails } = await cdp.send('Runtime.callFunctionOn', {
        objectId: object.objectId, functionDeclaration: `function(){${expression}}`, returnByValue: true, awaitPromise: true
      });
      if (exceptionDetails) throw new Error(exceptionDetails.text);
      return result.value;
    }
    async function waitForPanel(selector, expression = 'return true') {
      for (let attempt = 0; attempt < 80; attempt++) {
        const value = await panel(selector, expression);
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error(`Locale ${tag}: timed out waiting for ${selector}`);
    }
    return {
      context, worker, options, page, panel, waitForPanel, extensionId, errors,
      async close() { closing = true; await context.close(); await rm(temporary, { recursive: true, force: true }); }
    };
  } catch (error) {
    closing = true;
    await context?.close();
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export async function evidenceFolder() {
  const folder = join(root, 'test-results', 'browser-locales');
  await mkdir(folder, { recursive: true });
  return folder;
}
