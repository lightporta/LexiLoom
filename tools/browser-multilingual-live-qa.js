// Optional live-corpus check. Uses real dictionary requests through an unpacked
// MV3 extension; only the browser UI-language API and reading page are fixtures.
// Never run this network-dependent check as the default CI gate.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openLocaleHarness } from './browser-test-harness.js';
import { waitForLookupState } from './browser-lookup-wait.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = join(root, 'test-results/browser-multilingual-live');
const reportPath = join(root, 'docs/browser-multilingual-live.json');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await mkdir(directory, { recursive: true });
const cases = [
  ['ja', '学校', 'ja-JP'], ['ko', '안녕', 'ko-KR'], ['fr', 'bonjour', 'fr-FR'],
  ['de', 'Haus', 'de-DE'], ['es', 'niño', 'es-ES']
];
const report = {
  version: pkg.version, checkedAt: new Date().toISOString(), platform: process.platform,
  node: process.version, browser: '', status: 'running', uiLanguage: 'zh-CN',
  localeMode: 'controlled chrome.i18n.getUILanguage; original product code and live dictionary requests',
  mode: 'real Chromium; live public WiktApi; no dictionary fetch replacement', results: []
};
let harness;
try {
  harness = await openLocaleHarness(chromium, 'zh-CN', { blockNetwork: false });
  const { page, options } = harness;
  report.browser = harness.context.browser()?.version() || '';
  const requests = [];
  harness.context.on('request', request => {
    const url = new URL(request.url());
    if (url.hostname === 'api.wiktapi.dev') requests.push(url.href);
  });
  for (const [sourceLanguage, word, speechLocale] of cases) {
    const result = { sourceLanguage, word, status: 'running' };
    report.results.push(result);
    const started = performance.now();
    try {
      await page.bringToFront();
      await page.keyboard.press('Escape');
      const saved = await options.evaluate(targetLanguage => chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS', settings: { enabled: true, targetLanguage }
      }), sourceLanguage);
      assert.equal(saved.ok, true, 'target-language setting was not saved');
      await page.evaluate(value => {
        document.querySelector('#live-multilingual-word')?.remove();
        const node = document.createElement('p');
        node.id = 'live-multilingual-word'; node.style.width = 'max-content';
        node.textContent = value; document.body.prepend(node);
      }, word);
      await page.locator('#live-multilingual-word').dblclick();
      await waitForLookupState(() => harness.panel('.panel', `return {cards:[...this.querySelectorAll('.card')].map(card=>({
        word:card.querySelector('.word')?.textContent||'', busy:card.getAttribute('aria-busy')==='true',
        loading:!!card.querySelector('.summary-text.loading')
      }))}`), [word], { timeoutMs: 15000, pollIntervalMs: 50 });
      await harness.panel('.summary', 'if(this.getAttribute("aria-expanded")!=="true")this.click()');
      await harness.waitForPanel('.summary', 'return this.getAttribute("aria-expanded")==="true"');
      await harness.waitForPanel('.panel', 'return this.getAnimations({subtree:true}).length===0');
      const view = await harness.panel('.card', `return {
        word:this.querySelector('.word')?.textContent||'',
        definition:this.querySelector('.definitions .definition')?.textContent||'',
        phonetic:this.querySelector('.phonetic')?.textContent||'',
        pronunciations:[...this.querySelectorAll('.pronunciation')].map(node=>({locale:node.lang,text:node.textContent})),
        exampleCount:this.querySelectorAll('.example').length,
        licenses:[...this.querySelectorAll('.source-license')].map(node=>node.href),
        source:this.querySelector('.entry-footer > .source-link:not(.source-license)')?.href||'',
        summary:this.querySelector('.summary-text')?.textContent||''
      }`);
      assert.equal(view.word, word, 'the card changed the source headword');
      assert.match(view.definition, /\p{Script=Han}/u, 'live source returned no visible Chinese definition');
      assert.ok(view.licenses.some(url => url.startsWith('https://creativecommons.org/licenses/by-sa/')), 'the card omitted its text license');
      assert.equal(new URL(view.source).hostname, 'zh.wiktionary.org', 'the card omitted its actual dictionary source link');
      assert.ok(view.pronunciations.length > 0 && view.pronunciations.every(item => item.locale === speechLocale), 'speech controls use the wrong source-language locale');
      assert.ok(view.exampleCount <= 2, 'the card displayed more than two source examples');
      const apiUrl = requests.find(href => {
        const url = new URL(href);
        return url.searchParams.get('lang') === sourceLanguage && decodeURIComponent(url.pathname.split('/').at(-1)) === word;
      });
      assert.ok(apiUrl, 'no actual source-language dictionary request was observed');
      const systemSpeech = await options.evaluate(() => LexiLoomI18n.t('audioSystem'));
      Object.assign(result, {
        status: 'passed', definitionExcerpt: Array.from(view.definition).slice(0, 8).join(''),
        pronunciationCount: view.pronunciations.filter(item => item.text.trim() !== `▷ ${systemSpeech}`).length,
        systemSpeechAvailable: view.pronunciations.some(item => item.locale === speechLocale),
        pronunciationLocales: [...new Set(view.pronunciations.map(item => item.locale))],
        hasSourcePhonetic: Boolean(view.phonetic), exampleCount: view.exampleCount,
        licenseUrls: view.licenses, sourceUrl: view.source, apiUrl,
        screenshot: `test-results/browser-multilingual-live/${sourceLanguage}.png`
      });
      await page.screenshot({ path: join(directory, `${sourceLanguage}.png`) });
      console.log(`PASS live ${sourceLanguage} ${word}: Chinese definition, source and license visible`);
    } catch (error) {
      result.status = 'failed';
      result.error = { name: error.name, message: error.message };
      result.card = await harness.panel('.card', 'return {word:this.querySelector(".word")?.textContent||"",busy:this.getAttribute("aria-busy"),summaryExcerpt:Array.from(this.querySelector(".summary-text")?.textContent||"").slice(0,8).join("")}').catch(() => null);
      result.screenshot = `test-results/browser-multilingual-live/${sourceLanguage}-failure.png`;
      await page.screenshot({ path: join(directory, `${sourceLanguage}-failure.png`) }).catch(() => {});
      console.error(`FAIL live ${sourceLanguage} ${word}: ${error.message}`);
    } finally {
      result.elapsedMs = Math.round(performance.now() - started);
      await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    }
  }
  report.pageErrors = harness.errors;
  report.status = report.results.every(result => result.status === 'passed') && !harness.errors.length ? 'passed' : 'failed';
} catch (error) {
  report.status = 'failed';
  report.error = { name: error.name, message: error.message };
} finally {
  try { await harness?.close(); }
  catch (error) { report.status = 'failed'; report.cleanupError = { name: error.name, message: error.message }; }
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
}
console.log(`Live multilingual browser report: ${reportPath}`);
if (report.status !== 'passed') process.exitCode = 1;
