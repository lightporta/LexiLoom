// Real extension-page checks. Dictionary links are inspected, never followed.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openLocaleHarness } from './browser-test-harness.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const directory = fileURLToPath(new URL('../test-results/browser-navigation/', import.meta.url));
await mkdir(directory, { recursive: true });
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); console.log(`PASS ${name}`); };

async function links(page) {
  return page.locator('#nav-sites a').evaluateAll(nodes => nodes.map(node => ({
    href: node.href, name: node.querySelector('.navigation-site-name').textContent,
    host: node.querySelector('.navigation-site-host').textContent,
    rel: node.rel, target: node.target
  })));
}
async function query(page, word, language, region = 'auto') {
  await page.locator('#nav-word').fill(word);
  await page.locator('#nav-language').selectOption(language);
  if (language === 'zh') await page.locator('#nav-region').selectOption(region);
  await page.locator('#nav-word').press('Enter');
  await page.waitForFunction(({ word, language }) => {
    const results = document.querySelector('#nav-results');
    return !results.hidden && results.dataset.word === word && results.dataset.language === language;
  }, { word, language });
  return links(page);
}
async function save(harness, settings) {
  const result = await harness.options.evaluate(settings => chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }), settings);
  assert.equal(result.ok, true);
}
async function hash(page, value) {
  await page.evaluate(value => new Promise(resolve => {
    addEventListener('hashchange', () => resolve(), { once: true });
    location.hash = value;
  }), value);
}

for (const tag of ['en-US', 'zh-TW']) {
  const harness = await openLocaleHarness(chromium, tag);
  const requests = [];
  harness.context.on('request', request => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://locale.lexiloom.test/')) requests.push(request.url());
  });
  const navigation = await harness.context.newPage();
  const base = `chrome-extension://${harness.extensionId}/navigation.html`;
  try {
    const prefill = tag === 'en-US' ? '#word=%C3%84rger&language=de' : '';
    await navigation.goto(base + prefill);
    await navigation.waitForFunction(() => document.documentElement.dataset.navigationReady === 'true');
    if (tag === 'en-US') {
      check('Hash prefills an explicit German target and preserves the original headword',
        await navigation.locator('#nav-language').inputValue() === 'de' && await navigation.locator('#nav-word').inputValue() === 'Ärger');
      for (const [language, word] of [['ja', '学校'], ['ko', '안녕'], ['fr', 'école'], ['de', 'Haus'], ['es', 'niño']]) {
        const result = await query(navigation, word, language);
        check(`${language} navigation uses its own dictionary directory and encodes the headword`,
          result.length > 0 && result.some(link => link.host === `${language}.wiktionary.org`) && result.every(link => link.href.includes(encodeURIComponent(word))));
        assert.ok(result.every(link => link.rel.includes('noopener') && link.rel.includes('noreferrer') && link.target === '_blank'));
      }
      const german = await query(navigation, 'Ärger', 'de');
      check('German navigation preserves uppercase letters and umlauts', german.every(link => link.href.includes('%C3%84rger')));
      const english = await query(navigation, 'Gift', 'en');
      const selectedGerman = await query(navigation, 'Gift', 'de');
      check('An ambiguous Latin word follows the selected language instead of English detection',
        english.some(link => link.host === 'en.wiktionary.org') && selectedGerman.some(link => link.host === 'de.wiktionary.org')
          && selectedGerman.every(link => link.host !== 'en.wiktionary.org'));
      const complete = await query(navigation, 'learning', 'en');
      check('Navigation exposes the complete matching directory beyond the three card links', complete.length > 3);

      const cn = await query(navigation, '学习', 'zh', 'CN');
      const hk = await query(navigation, '學習', 'zh', 'HK');
      const tw = await query(navigation, '學習', 'zh', 'TW');
      check('Chinese navigation selects Mainland, Hong Kong and Taiwan dictionary routes',
        cn.some(link => link.href.includes('zdic.net/hans/')) && hk.some(link => link.host === 'words.hk')
          && hk.every(link => !link.href.includes('/hans/')) && tw.some(link => link.host === 'www.moedict.tw'));

      await save(harness, { guidanceCustom: [{ name: 'French custom', template: 'https://fr.example/search?q={word}', language: 'fr' }] });
      const frenchCustom = await query(navigation, 'maison', 'fr');
      const germanCustom = await query(navigation, 'Haus', 'de');
      check('A language-scoped custom dictionary appears only for its configured language',
        frenchCustom.some(link => link.host === 'fr.example') && germanCustom.every(link => link.host !== 'fr.example'));
      await harness.page.bringToFront();
      await harness.page.locator('#serendipity').dblclick();
      await harness.waitForPanel('.summary-text', 'return !this.classList.contains("loading")');
      await harness.panel('.summary', 'this.click()');
      check('An English webpage word card excludes a French-only custom dictionary',
        await harness.panel('.card', 'return ![...this.querySelectorAll(".guidance-link")].some(link => new URL(link.href).hostname === "fr.example")'));
      await harness.page.keyboard.press('Escape');

      const disabled = await harness.worker.evaluate(() => globalThis.LexiLoomGuidance.builtinIds());
      await save(harness, { guidanceDisabled: disabled, guidanceCustom: [] });
      await navigation.waitForFunction(() => !document.querySelector('#nav-sites a') && !document.querySelector('#nav-results').hidden && document.querySelector('#nav-status').textContent);
      check('Disabling all sites refreshes the open navigation page and shows a useful empty state',
        await navigation.locator('#nav-status').textContent() === await navigation.evaluate(() => LexiLoomI18n.t('navNoSites')));
      await save(harness, { guidanceDisabled: [], guidanceCustom: [] });
      await navigation.waitForFunction(() => document.querySelectorAll('#nav-sites a').length > 0);
      check('Re-enabling sites refreshes the current query without a page reload', (await links(navigation)).length > 0);

      await navigation.locator('#nav-word').fill('');
      await navigation.locator('#nav-word').press('Enter');
      check('An empty query shows a localized prompt rather than stale links',
        await navigation.locator('#nav-status').textContent() === await navigation.evaluate(() => LexiLoomI18n.t('navEmpty'))
          && await navigation.locator('#nav-sites a').count() === 0);
      const maxLength = await navigation.locator('#nav-word').getAttribute('maxlength');
      await navigation.locator('#nav-word').fill('a'.repeat(64));
      const filledLength = (await navigation.locator('#nav-word').inputValue()).length;
      // The field now caps typing at the same 64 Unicode characters the renderer
      // and worker validate. Inject an overlong programmatic value (what a stale
      // hash or script could do) to keep proving it is rejected, not truncated.
      await navigation.evaluate(() => {
        const input = document.querySelector('#nav-word');
        input.value = 'a'.repeat(65);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await navigation.locator('#nav-word').press('Enter');
      check('An overlong headword is rejected instead of silently truncated',
        maxLength === '64' && filledLength === 64
          && await navigation.locator('#nav-status').textContent() === await navigation.evaluate(() => LexiLoomI18n.t('navInvalidWord'))
          && await navigation.locator('#nav-sites a').count() === 0);

      await hash(navigation, 'word=bonjour&language=pt');
      await navigation.locator('#nav-word').press('Enter');
      check('An explicit unsupported language stays invalid instead of falling back to English',
        await navigation.locator('#nav-language').inputValue() === '' && await navigation.locator('#nav-sites a').count() === 0
          && await navigation.locator('#nav-status').textContent() === await navigation.evaluate(() => LexiLoomI18n.t('navInvalidLanguage')));
      await navigation.locator('#nav-language').selectOption('fr');
      check('Choosing a supported language recovers an unsupported-language link',
        (await links(navigation)).some(link => link.host === 'fr.wiktionary.org'));
      await hash(navigation, 'word=bonjour');
      check('Only an omitted language uses the interface-language default',
        await navigation.locator('#nav-language').inputValue() === 'en' && (await links(navigation)).some(link => link.host === 'en.wiktionary.org'));
      await hash(navigation, 'word=bonjour&language=');
      check('An explicitly empty language also requires a valid user choice',
        await navigation.locator('#nav-language').inputValue() === '' && await navigation.locator('#nav-sites a').count() === 0);

      await hash(navigation, 'word=bad%0Aword&language=fr');
      await navigation.locator('#nav-word').press('Enter');
      await navigation.locator('#nav-language').selectOption('de');
      check('A control character in the raw hash is rejected before the input can remove it',
        await navigation.locator('#nav-status').textContent() === await navigation.evaluate(() => LexiLoomI18n.t('navInvalidWord'))
          && await navigation.locator('#nav-sites a').count() === 0 && new URL(navigation.url()).hash.includes('%0A'));
      await query(navigation, 'Haus', 'de');
      check('Editing the headword clears a rejected incoming hash and permits a valid search',
        (await links(navigation)).some(link => link.host === 'de.wiktionary.org'));
      await hash(navigation, 'word=bad%ED%A0%80word&language=fr');
      await navigation.locator('#nav-word').press('Enter');
      check('A hash containing an encoded surrogate is rejected without replacement-based lookup',
        await navigation.locator('#nav-status').textContent() === await navigation.evaluate(() => LexiLoomI18n.t('navInvalidWord'))
          && await navigation.locator('#nav-sites a').count() === 0 && new URL(navigation.url()).hash.includes('%ED%A0%80'));
      await navigation.evaluate(() => {
        const input = document.querySelector('#nav-word');
        input.value = 'bad\uD800word';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await navigation.locator('#nav-word').press('Enter');
      check('An unpaired surrogate in the input is rejected instead of reaching URL encoding',
        await navigation.locator('#nav-status').textContent() === await navigation.evaluate(() => LexiLoomI18n.t('navInvalidWord'))
          && await navigation.locator('#nav-sites a').count() === 0);

      const payload = '<img src=x onerror=alert(1)>/x?y=1&z=#';
      await hash(navigation, new URLSearchParams({ word: payload, language: 'fr' }).toString());
      await navigation.waitForFunction(payload => document.querySelector('#nav-results').dataset.word === payload, payload);
      const encoded = await links(navigation);
      check('Hash payloads remain text and cannot inject markup or URL components',
        await navigation.locator('#nav-word').inputValue() === payload && await navigation.locator('#nav-results img, #nav-results script, #nav-results svg').count() === 0
          && encoded.length > 0 && encoded.every(link => link.href.includes(encodeURIComponent(payload))));

      await navigation.evaluate(() => {
        globalThis.__NAV_QA_SEND__ = chrome.runtime.sendMessage.bind(chrome.runtime);
        chrome.runtime.sendMessage = message => message.type === 'GET_SETTINGS'
          ? Promise.reject(new Error('Controlled settings failure')) : globalThis.__NAV_QA_SEND__(message);
      });
      // Change a value so chrome.storage emits a real event (identical writes
      // intentionally produce no onChanged event in Chromium).
      await save(harness, { enabled: false });
      await navigation.waitForFunction(() => document.documentElement.dataset.navigationReady === 'error');
      check('A failed public-settings read is visible and does not substitute default links',
        await navigation.locator('#nav-status').textContent() === await navigation.evaluate(() => LexiLoomI18n.t('readFailed'))
          && await navigation.locator('#nav-sites a').count() === 0);
      await navigation.evaluate(() => { chrome.runtime.sendMessage = globalThis.__NAV_QA_SEND__; });
      await navigation.locator('#nav-word').fill('Ärger');
      await navigation.locator('#nav-word').press('Enter');
      await navigation.waitForFunction(() => document.documentElement.dataset.navigationReady === 'true' && document.querySelector('#nav-sites a'));
      check('Submitting again recovers after the public-settings read failure', (await links(navigation)).length > 0);
      await save(harness, { enabled: true });

      await query(navigation, 'maison', 'fr');
      await navigation.setViewportSize({ width: 390, height: 844 });
      check('Navigation remains usable in a 390px viewport', await navigation.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await navigation.screenshot({ path: join(directory, `${tag}.png`), fullPage: true });

      await harness.page.bringToFront();
      await harness.page.locator('#serendipity').dblclick();
      await harness.waitForPanel('.summary-text', 'return !this.classList.contains("loading")');
      await harness.panel('.summary', 'this.click()');
      await harness.waitForPanel('.guidance-browse');
      const cardPage = harness.context.waitForEvent('page');
      await harness.panel('.guidance-browse', 'this.click()');
      const fromCard = await cardPage;
      await fromCard.waitForURL(url => url.pathname === '/navigation.html');
      await fromCard.waitForFunction(() => document.documentElement.dataset.navigationReady === 'true');
      const cardParams = new URLSearchParams(new URL(fromCard.url()).hash.slice(1));
      check('A real webpage word card opens navigation with its word, language and region',
        cardParams.get('word') === 'serendipity' && cardParams.get('language') === 'en' && cardParams.get('region') === 'CN'
          && await fromCard.locator('#nav-word').inputValue() === 'serendipity' && await fromCard.locator('#nav-language').inputValue() === 'en');

      const popup = await harness.context.newPage();
      await popup.goto(`chrome-extension://${harness.extensionId}/popup.html`);
      const popupPage = harness.context.waitForEvent('page');
      await popup.locator('#navigation').click();
      const opened = await popupPage;
      await opened.waitForURL(url => url.pathname === '/navigation.html');
      await opened.waitForFunction(() => document.documentElement.dataset.navigationReady === 'true');
      check('The popup navigation entry opens the usable directory page', opened.url().startsWith(base));
      const optionLink = harness.options.locator('#open-navigation');
      const target = await optionLink.getAttribute('target');
      let fromSettings;
      if (target === '_blank') {
        const optionPage = harness.context.waitForEvent('page');
        await optionLink.click();
        fromSettings = await optionPage;
        await fromSettings.waitForURL(url => url.pathname === '/navigation.html');
        await fromSettings.waitForFunction(() => document.documentElement.dataset.navigationReady === 'true');
      } else {
        await optionLink.click();
        fromSettings = harness.options;
        await fromSettings.waitForURL(url => url.pathname === '/navigation.html');
        await fromSettings.waitForFunction(() => document.documentElement.dataset.navigationReady === 'true');
      }
      check('The settings navigation entry reaches the directory page',
        await fromSettings.evaluate(() => location.pathname === '/navigation.html'
          && document.documentElement.dataset.navigationReady === 'true'
          && document.querySelectorAll('#nav-language option').length > 1));
    } else {
      check('A Traditional Chinese interface defaults to Chinese without guessing other languages', await navigation.locator('#nav-language').inputValue() === 'zh');
      const result = await query(navigation, '學習', 'zh');
      check('The automatic Chinese region follows the Taiwan interface', result.some(link => link.host === 'www.moedict.tw')
        && await navigation.locator('#nav-results').getAttribute('data-region') === 'TW');
      check('The navigation page uses its Traditional Chinese message catalog',
        await navigation.locator('h1').textContent() === await navigation.evaluate(() => LexiLoomI18n.t('navTitle')));
      await navigation.screenshot({ path: join(directory, `${tag}.png`), fullPage: true });
    }
    check(`${tag} directory construction does not request any external dictionary site`, requests.length === 0);
    assert.deepEqual(harness.errors, []);
  } catch (error) {
    await navigation.screenshot({ path: join(directory, `${tag}-failure.png`), fullPage: true }).catch(() => {});
    throw error;
  } finally { await harness.close(); }
}
await writeFile(join(directory, 'report.json'), JSON.stringify({ mode: 'real Chromium; controlled UI locale; links inspected without following them', checks }, null, 2) + '\n');
