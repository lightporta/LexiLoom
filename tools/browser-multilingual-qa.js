// Real MV3 word cards with original synthetic API responses. No public service
// is contacted; live corpus coverage is recorded separately from these checks.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openLocaleHarness } from './browser-test-harness.js';
import { waitForLookupState } from './browser-lookup-wait.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = join(root, 'test-results/browser-multilingual');
await mkdir(directory, { recursive: true });
const fixtures = JSON.parse(await readFile(join(root, 'tests/fixtures/multilingual-browser.json'), 'utf8')).languages;
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); console.log(`PASS ${name}`); };

async function fixture(worker) {
  await worker.evaluate(data => {
    const original = globalThis.__LEXILOOM_QA_ORIGINAL_FETCH__;
    globalThis.__MULTILINGUAL_QA__ = { requests: [], mode: 'ok', pending: [] };
    globalThis.fetch = async (input, init) => {
      const href = String(input);
      if (href.startsWith('chrome-extension://')) return original(input, init);
      const url = new URL(href);
      if (url.hostname !== 'api.wiktapi.dev') throw new Error('Unexpected public request in multilingual QA');
      const language = url.searchParams.get('lang');
      const word = decodeURIComponent(url.pathname.split('/').at(-1));
      const state = globalThis.__MULTILINGUAL_QA__;
      state.requests.push({ href, language, word });
      if (language === 'zh') {
        const edition = url.pathname.split('/')[2];
        return Response.json({ word, edition, entries: [{ word, lang_code: 'zh', pos: 'noun',
          senses: [{ glosses: [edition === 'en' ? 'An original Chinese preview fixture definition.' : '原創中文預覽測試：這是原創內容。'] }],
          sounds: [{ zh_pron: 'nǐ hǎo', tags: ['Mandarin', 'Pinyin', 'Mainland-China'] }]
        }] });
      }
      const current = data[language];
      if (!current) throw new Error('Unexpected source language in multilingual fixture');
      if (word === current.capitalizedWord) return Response.json({ error: true, status: 404, message: `No entries found for ${word}` }, { status: 404 });
      if (state.mode === 'missing') return Response.json({ error: true, status: 404, message: `No entries found for ${word}` }, { status: 404 });
      if (state.mode === 'failure') return Response.json({ error: 'fixture unavailable' }, { status: 503 });
      const chinese = state.mode !== 'no-Chinese';
      const payload = {
        word, edition: 'zh', entries: [{ word, lang_code: language, pos: 'noun',
          senses: [{ glosses: [chinese ? current.gloss : 'An original non-Chinese fixture gloss.'],
            examples: current.examples.map(text => ({ text, translation: '這是一句原創例句。', ref: 'Original LexiLoom synthetic multilingual fixture.' })) }],
          sounds: [{ ipa: current.phonetic, ...(current.reading ? { roman: current.reading } : {}) }]
        }]
      };
      if (state.mode === 'late-French' && language === 'fr') {
        const delayed = new Promise(resolve => { state.releaseFrench = () => { state.frenchReleased = true; resolve(); }; });
        state.pending.push(delayed);
        await delayed;
      }
      return Response.json(payload);
    };
  }, fixtures);
}

async function save(harness, settings) {
  const result = await harness.options.evaluate(settings => chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings }), settings);
  assert.equal(result.ok, true, 'multilingual settings save failed');
}
async function terminal(harness, expectedWords, { afterAppend = false } = {}) {
  return waitForLookupState(() => harness.panel('.panel', `return {cards:[...this.querySelectorAll('.card')].map(card=>({
    word:card.querySelector('.word')?.textContent||'', busy:card.getAttribute('aria-busy')==='true' || ${afterAppend ? '!this.querySelector(".footer").__qaAppendSeen' : 'false'}, loading:!!card.querySelector('.summary-text.loading')
  }))}`), expectedWords, { timeoutMs: 15000, pollIntervalMs: 50 });
}
async function wordNode(harness, word, id = 'multilingual-word') {
  await harness.page.evaluate(({ word, id }) => {
    document.querySelector('#' + id)?.remove();
    const paragraph = document.createElement('p');
    paragraph.style.width = 'max-content';
    paragraph.id = id; paragraph.textContent = word;
    document.body.prepend(paragraph);
  }, { word, id });
  return harness.page.locator('#' + id);
}
async function select(harness, word, { append = false } = {}) {
  await harness.page.bringToFront();
  if (!append) await harness.page.keyboard.press('Escape');
  const node = await wordNode(harness, word, append ? 'multilingual-append' : 'multilingual-word');
  await node.dblclick(append ? { modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] } : {});
}
async function mode(harness, value) {
  await harness.worker.evaluate(value => {
    const state = globalThis.__MULTILINGUAL_QA__;
    state.mode = value;
    if (value === 'late-French') { state.pending = []; state.releaseFrench = null; state.frenchReleased = false; }
  }, value);
}
async function delayedFrenchStarted(harness) {
  await harness.worker.evaluate(async () => {
    const deadline = performance.now() + 15000;
    while (!globalThis.__MULTILINGUAL_QA__.releaseFrench && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    if (!globalThis.__MULTILINGUAL_QA__.releaseFrench) throw new Error('French fixture did not start');
  });
}
async function expand(harness) {
  await harness.panel('.summary', 'if(this.getAttribute("aria-expanded")!=="true")this.click()');
  await harness.waitForPanel('.summary', 'return this.getAttribute("aria-expanded")==="true"');
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline) {
    if (await harness.panel('.panel', 'return this.getAnimations({subtree:true}).length===0 && this.getBoundingClientRect().width>=420')) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Expanded multilingual card did not settle');
}

for (const tag of ['zh-CN', 'en-US']) {
  const harness = await openLocaleHarness(chromium, tag);
  try {
    await fixture(harness.worker);
    const languages = tag === 'zh-CN' ? Object.keys(fixtures) : ['de'];
    for (const language of languages) {
      const data = fixtures[language];
      await save(harness, { targetLanguage: language });
      await select(harness, data.word);
      await terminal(harness, [data.word]);
      const summary = await harness.panel('.summary-text', 'return this.textContent');
      check(`${tag} ${language} trusted double-click renders a Simplified Chinese definition`, summary.includes('原创') && summary.includes('书本') && !/[創學書語體]/u.test(summary));
      const requested = await harness.worker.evaluate(() => globalThis.__MULTILINGUAL_QA__.requests.at(-1));
      check(`${tag} ${language} lookup preserves the headword and explicitly requests its source language`, requested.word === data.word && requested.language === language && requested.href.includes('/v1/zh/word/'));
      await expand(harness);
      const details = await harness.panel('.details', `return {
        pronunciation:[...this.querySelectorAll('.pronunciation')].map(node=>({lang:node.lang,text:node.textContent})),
        examples:[...this.querySelectorAll('.example')].map(node=>node.textContent),
        licenses:[...this.querySelectorAll('.source-license')].map(node=>node.href),
        references:[...this.querySelectorAll('.example-reference')].map(node=>node.textContent),
        guidance:[...this.querySelectorAll('.guidance-link')].map(node=>node.href)
      }`);
      check(`${tag} ${language} pronunciation uses the source language speech locale`, details.pronunciation.length > 0 && details.pronunciation.every(sound => sound.lang === data.locale) && details.pronunciation.some(sound => sound.text.includes(data.phonetic)));
      if (tag === 'en-US') check('English interface labels foreign readings in English instead of Chinese', details.pronunciation.some(sound => /German|French|Spanish|Japanese|Korean|IPA/.test(sound.text)) && details.pronunciation.every(sound => !/德语|法语|日语|韩语|西班牙语|谚文|假名|罗马字/.test(sound.text)));
      check(`${tag} ${language} card keeps at most two actual examples with Chinese translations`, details.examples.length === 2 && details.examples.every(text => text.includes('这是一句原创例句。')) && details.examples.every(text => !text.includes(data.examples[2])));
      check(`${tag} ${language} card retains text licensing, example attribution and language-specific guidance`, details.licenses.some(href => href.includes('creativecommons.org/licenses/by-sa/')) && details.references.some(text => text.includes('synthetic multilingual fixture')) && details.guidance.some(href => new URL(href).hostname === `${language}.wiktionary.org`));
      if (language === 'ja' || tag === 'en-US') await harness.page.screenshot({ path: join(directory, `${tag}-${language}.png`) });
    }

    if (tag === 'zh-CN') {
      for (const language of ['fr', 'es']) {
        const data = fixtures[language];
        await save(harness, { targetLanguage: language });
        const start = await harness.worker.evaluate(() => globalThis.__MULTILINGUAL_QA__.requests.length);
        await select(harness, data.capitalizedWord);
        await terminal(harness, [data.capitalizedWord]);
        await expand(harness);
        const requests = await harness.worker.evaluate(({ start, language, words }) => globalThis.__MULTILINGUAL_QA__.requests.slice(start)
          .filter(request => request.language === language && words.includes(request.word)).map(request => request.word),
        { start, language, words: [data.capitalizedWord, data.lowercaseWord] });
        check(`${language} capitalized lookup retries the lowercase headword only after confirmed absence`,
          JSON.stringify(requests) === JSON.stringify([data.capitalizedWord, data.lowercaseWord]));
        const view = await harness.panel('.card', `return {word:this.querySelector('.word').textContent,
          summary:this.querySelector('.summary-text').textContent,source:this.querySelector('.entry-footer .source-link')?.href}`);
        check(`${language} lowercase fallback retains the selected spelling and links to the actual lowercase source`,
          view.word === data.capitalizedWord && view.summary.includes('原创')
          && view.source === `https://zh.wiktionary.org/wiki/${encodeURIComponent(data.lowercaseWord)}`);
      }

      await save(harness, { targetLanguage: 'ja' });
      await harness.page.keyboard.press('Escape');
      const node = await wordNode(harness, '学校 こんにちは');
      await node.evaluate(node => { const range=document.createRange();range.selectNodeContents(node);const selected=getSelection();selected.removeAllRanges();selected.addRange(range); });
      const box = await node.boundingBox();
      await harness.page.mouse.move(box.x + box.width - 1, box.y + box.height / 2); await harness.page.mouse.up();
      await harness.waitForPanel('.launcher'); await harness.panel('.launcher', 'this.click()');
      await terminal(harness, ['学校', 'こんにちは']);
      check('Japanese selection creates independent cards for Han and Kana words', await harness.panel('.cards', 'return this.children.length===2'));

      await save(harness, { targetLanguage: 'ko' });
      await select(harness, '안녕'); await terminal(harness, ['안녕']);
      await select(harness, '학교', { append: true }); await terminal(harness, ['안녕', '학교']);
      check('Ctrl or Command double-click appends a Korean word to the same chain', await harness.panel('.cards', 'return this.children.length===2'));

      await save(harness, { targetLanguage: 'fr' });
      await mode(harness, 'late-French'); await select(harness, 'chat');
      await harness.waitForPanel('.card', 'return this.getAttribute("aria-busy")==="true"');
      await delayedFrenchStarted(harness);
      await save(harness, { targetLanguage: 'de' }); await terminal(harness, ['chat']);
      check('Changing the target language re-queries the existing card in place', (await harness.panel('.summary-text', 'return this.textContent')).includes('德语测试'));
      await harness.worker.evaluate(async () => { globalThis.__MULTILINGUAL_QA__.releaseFrench(); await Promise.all(globalThis.__MULTILINGUAL_QA__.pending); await new Promise(resolve=>setTimeout(resolve,100)); });
      await harness.page.waitForTimeout(200);
      check('A late response from the old source language cannot overwrite the new card', (await harness.panel('.summary-text', 'return this.textContent')).includes('德语测试'));
      await mode(harness, 'ok');

      // A second delay scenario needs a headword that has never been queried in
      // French. Reusing chat would correctly hit the new warm-result cache and
      // conceal the pending-language UI boundary we need to exercise here.
      const refreshWord = fixtures.fr.refreshWord;
      await select(harness, refreshWord);
      await terminal(harness, [refreshWord]);
      await expand(harness);
      await harness.panel('.panel', 'this.__qaLanguageRefreshPanel=true');
      await mode(harness, 'late-French');
      await save(harness, { targetLanguage: 'fr' });
      await delayedFrenchStarted(harness);
      const loading = await harness.panel('.card', `return {busy:this.getAttribute('aria-busy')==='true',
        oldSpeech:!!this.querySelector('.pronunciation'),oldExamples:!!this.querySelector('.example'),phonetic:this.querySelector('.phonetic').textContent}`);
      check('A pending language change removes old pronunciation controls, examples and phonetic text', loading.busy && !loading.oldSpeech && !loading.oldExamples && loading.phonetic === '');
      await harness.worker.evaluate(() => globalThis.__MULTILINGUAL_QA__.releaseFrench());
      await terminal(harness, [refreshWord]);
      check('The refreshed language preserves the same expanded panel and replaces its definition',
        await harness.panel('.panel', 'return this.__qaLanguageRefreshPanel===true && this.querySelector(".summary").getAttribute("aria-expanded")==="true" && this.querySelector(".summary-text").textContent.includes("法语测试") && this.querySelectorAll(".example").length===2'));
      await mode(harness, 'ok');

      await save(harness, { targetLanguage: 'fr' });
      for (const value of ['missing', 'failure', 'no-Chinese']) {
        await mode(harness, value); await select(harness, 'inconnu'); await terminal(harness, ['inconnu']);
        const view = await harness.panel('.card', 'return {summary:this.querySelector(".summary-text").textContent,retry:!!this.querySelector(".state-actions .text-button"),notice:this.querySelector(".lookup-notice").textContent}');
        const missing = await harness.options.evaluate(() => LexiLoomI18n.t('notFound'));
        check(value === 'missing' ? 'Confirmed dictionary absence uses the normal missing-word state' : value === 'failure' ? 'An upstream failure stays distinct from a missing word' : 'An entry without Chinese glosses is labelled unavailable rather than fabricated or missing', value === 'missing' ? view.summary === missing : view.summary !== missing && view.retry);
      }
      await mode(harness, 'ok');
      await save(harness, { targetLanguage: 'de' });
      await select(harness, 'Language'); await terminal(harness, ['Language']);
      await save(harness, { targetLanguage: 'auto' });
      await terminal(harness, ['language']);
      // showWords updates the footer even when an appended word is deduplicated.
      // Waiting for that mutation proves the async gesture handler completed;
      // an already-idle card alone could pass before the append was processed.
      await harness.panel('.footer', `this.__qaAppendSeen=false;const observer=new MutationObserver(()=>{this.__qaAppendSeen=true;observer.disconnect()});observer.observe(this,{childList:true});`);
      await select(harness, 'language', { append: true });
      await terminal(harness, ['language'], { afterAppend: true });
      check('Appending an automatic English word deduplicates a card created with German uppercase spelling',
        await harness.panel('.cards', 'return this.children.length===1'));
      await select(harness, 'serendipity'); await terminal(harness, ['serendipity']);
      check('Returning to automatic mode retains the previous English dictionary choice', (await harness.panel('.source-label', 'return this.textContent')).includes('本地演示'));

      const popup = await harness.context.newPage();
      await popup.goto(`chrome-extension://${harness.extensionId}/popup.html`);
      await popup.locator('#target-language').selectOption('es');
      await popup.waitForFunction(() => document.querySelector('#target-language').disabled === false);
      const saved = await harness.options.evaluate(() => chrome.runtime.sendMessage({type:'GET_PRIVATE_SETTINGS'}));
      check('The popup target-language selector persists its choice without replacing English dictionary settings', saved.targetLanguage === 'es' && saved.englishProvider === 'demo');
      await harness.options.reload();
      await harness.options.waitForFunction(() => !document.querySelector('[type=submit]').disabled);
      check('Options read the same persisted target language', await harness.options.locator('#target-language').inputValue() === 'es');
    }
    const toolbar = await harness.context.newPage();
    await toolbar.setViewportSize({ width: 338, height: 600 });
    await toolbar.goto(`chrome-extension://${harness.extensionId}/popup.html`);
    await toolbar.locator('#target-language').selectOption('fr');
    await toolbar.waitForFunction(() => !document.querySelector('#target-language').disabled);
    const layout = await toolbar.evaluate(() => ({
      bodyHeight: document.body.getBoundingClientRect().height,
      footerBottom: document.querySelector('footer').getBoundingClientRect().bottom,
      scrollWidth: document.documentElement.scrollWidth,
      brand: document.querySelector('.brand-name').textContent.trim()
    }));
    check(`${tag} toolbar popup fits its language controls, status and footer within 600px`,
      layout.bodyHeight <= 600 && layout.footerBottom <= 600 && layout.scrollWidth <= 338);
    if (tag === 'en-US') {
      check('The English popup renders the brand name only once', layout.brand === 'LexiLoom');
      const readingRoom = await harness.context.newPage();
      await readingRoom.goto(`chrome-extension://${harness.extensionId}/try.html`);
      const roomBrand = await readingRoom.evaluate(() => ({
        brand: document.querySelector('.brand-name').textContent.trim(),
        chineseSpan: Boolean(document.querySelector('.brand-cn'))
      }));
      check('The English reading room renders the brand name only once',
        roomBrand.brand === 'LexiLoom' && !roomBrand.chineseSpan);
      await readingRoom.close();
    }
    await toolbar.screenshot({ path: join(directory, `popup-${tag}.png`) });
    if (tag === 'zh-CN') {
      const requestCount = await harness.worker.evaluate(() => globalThis.__MULTILINGUAL_QA__.requests.length);
      await harness.page.goto(`chrome-extension://${harness.extensionId}/try.html`);
      await harness.page.locator('#show-chinese').click();
      await terminal(harness, ['你好', '学习', '语言']);
      check('The Chinese reading-room practice still loads Chinese cards while the global target is French',
        await harness.panel('.cards', 'return this.children.length===3 && [...this.querySelectorAll(".summary-text")].every(node=>node.textContent.includes("原创中文预览测试"))'));
      const preview = await harness.worker.evaluate(async start => ({
        requests: globalThis.__MULTILINGUAL_QA__.requests.slice(start),
        settings: (await chrome.storage.local.get('settings')).settings
      }), requestCount);
      check('Reading-room Chinese lookup requests Chinese sources without changing the global target language',
        preview.requests.length > 0 && preview.requests.every(request => request.language === 'zh') && preview.settings.targetLanguage === 'fr');
    }
    assert.deepEqual(harness.errors, []);
  } catch (error) {
    await harness.page.screenshot({ path: join(directory, `${tag}-failure.png`), fullPage: true }).catch(() => {});
    throw error;
  } finally { await harness.close(); }
}
await writeFile(join(directory, 'report.json'), JSON.stringify({ mode: 'real Chromium; controlled UI locale; original synthetic API fixtures', platform: process.platform, node: process.version, checks }, null, 2) + '\n');
