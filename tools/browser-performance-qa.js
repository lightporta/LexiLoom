// Deterministic request-efficiency check through a real MV3 worker and Chrome IPC.
// The 150ms dictionary responses are synthetic; timings are not internet claims.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openLocaleHarness } from './browser-test-harness.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = join(root, 'test-results/browser-performance');
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const report = {
  version, checkedAt: new Date().toISOString(), platform: process.platform, node: process.version,
  mode: 'real Chromium MV3 + Chrome IPC; synthetic 150ms Free Dictionary responses; controlled English UI locale',
  checks: [], runs: []
};
const variants = process.env.LEXILOOM_BASELINE_EXTENSION
  ? [['baseline', process.env.LEXILOOM_BASELINE_EXTENSION], ['current', undefined]]
  : [['current', undefined]];
let harness;
function check(name, condition) {
  report.checks.push({ name, passed: Boolean(condition) });
  assert.ok(condition, name);
  console.log(`PASS ${name}`);
}
try {
  for (const [label, extensionPath] of variants) {
    harness = await openLocaleHarness(chromium, 'en-US', { extensionPath });
    report.browser = harness.context.browser()?.version() || '';
    const { options, worker, page } = harness;
    const sourceVersion = await options.evaluate(() => chrome.runtime.getManifest().version);
    await worker.evaluate(() => {
      globalThis.__performanceRequests = [];
      globalThis.__performanceActive = 0;
      globalThis.__performancePeak = 0;
      globalThis.__performanceFail = false;
      const originalFetch = globalThis.__LEXILOOM_QA_ORIGINAL_FETCH__;
      globalThis.fetch = async (input, init) => {
        const url = new URL(String(input));
        if (url.protocol === 'chrome-extension:') return originalFetch(input, init);
        if (url.hostname !== 'api.dictionaryapi.dev') throw new Error(`Unexpected performance request: ${url.hostname}`);
        globalThis.__performanceRequests.push(url.href);
        globalThis.__performancePeak = Math.max(globalThis.__performancePeak, ++globalThis.__performanceActive);
        try {
          await new Promise(resolve => setTimeout(resolve, 150));
          if (globalThis.__performanceFail) throw new TypeError('Controlled temporary dictionary outage');
          return Response.json([{
            word: decodeURIComponent(url.pathname.split('/').at(-1)),
            meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'An original synthetic performance definition.' }] }]
          }]);
        } finally { globalThis.__performanceActive--; }
      };
    });
    assert.equal((await options.evaluate(() => chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS', settings: { enabled: true, targetLanguage: 'auto', englishProvider: 'free' }
    }))).ok, true);
    // Measure inside the extension page, avoiding automation round trips in timings.
    const measurements = await options.evaluate(async () => {
      const query = async word => {
        const started = performance.now();
        const entry = await chrome.runtime.sendMessage({ type: 'LOOKUP', word });
        return { elapsedMs: performance.now() - started, status: entry.status, word: entry.word };
      };
      const sequential = [];
      for (let i = 0; i < 6; i++) sequential.push(await query('latency'));
      const started = performance.now();
      const parallel = await Promise.all(Array.from({ length: 8 }, () => query('efficiency')));
      return { sequential, parallel, parallelWallMs: performance.now() - started };
    });
    const requests = await worker.evaluate(() => ({
      sequential: __performanceRequests.filter(url => url.endsWith('/latency')).length,
      parallel: __performanceRequests.filter(url => url.endsWith('/efficiency')).length,
      peak: __performancePeak
    }));
    check(`${label}: every repeated and concurrent lookup returns the requested entry`,
      measurements.sequential.every(item => item.status === 'ok' && item.word === 'latency')
      && measurements.parallel.every(item => item.status === 'ok' && item.word === 'efficiency'));
    check(`${label}: shared request limit remains at four`, requests.peak <= 4);
    if (label === 'current') {
      check('six sequential lookups reuse one successful response', requests.sequential === 1);
      check('eight simultaneous lookups share one in-flight request', requests.parallel === 1);
    }
    await worker.evaluate(() => { globalThis.__performanceFail = true; });
    const failed = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'LOOKUP', word: 'recovery' }));
    await worker.evaluate(() => { globalThis.__performanceFail = false; });
    const recovered = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'LOOKUP', word: 'recovery' }));
    check(`${label}: a transient error can recover immediately`, failed.status === 'error' && recovered.status === 'ok');
    // Also exercise the visible card twice. The word's network response is cold
    // initially; the second selection benefits from the worker result cache.
    await page.evaluate(() => {
      const node = document.createElement('p'); node.id = 'performance-word';
      node.textContent = 'responsiveness'; node.style.width = 'max-content'; document.body.prepend(node);
    });
    const cards = [];
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Escape');
      const started = performance.now();
      await page.locator('#performance-word').dblclick();
      await harness.waitForPanel('.card', 'return this.getAttribute("aria-busy")!=="true" && !!this.querySelector(".summary-text")?.textContent.includes("synthetic")');
      cards.push({ elapsedMs: performance.now() - started });
    }
    check(`${label}: cold and repeated webpage selections both show a word card`, cards.length === 2);
    const repeat = measurements.sequential.slice(1).map(item => item.elapsedMs).sort((a, b) => a - b);
    report.runs.push({ label, sourceVersion, ...measurements, requests, cards, warmMedianMs: repeat[2] });
    await harness.close(); harness = null;
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  await harness?.close();
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  for (const run of report.runs) console.log(JSON.stringify({
    label: run.label, sourceVersion: run.sourceVersion, requests: run.requests,
    coldMs: run.sequential[0].elapsedMs, warmMedianMs: run.warmMedianMs,
    parallelWallMs: run.parallelWallMs, cards: run.cards
  }));
  if (report.error) console.error(report.error.message);
}
