// UI regressions use a controlled locale with the actual extension code.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openLocaleHarness } from './browser-test-harness.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const directory = fileURLToPath(new URL('../test-results/browser-ui/', import.meta.url));
await mkdir(directory, { recursive: true });
const checks = [];

async function fixture(worker) {
  await worker.evaluate(() => {
    const original = globalThis.__LEXILOOM_QA_ORIGINAL_FETCH__;
    globalThis.fetch = async (value, init) => {
      const url = new URL(String(value));
      if (url.protocol === 'chrome-extension:') return original(value, init);
      if (url.hostname === 'www.moedict.tw') return Response.json({
        title: '學習', heteronyms: [{ bopomofo: 'ㄒㄩㄝˊ ㄒㄧˊ', pinyin: 'xué xí', definitions: [{ def: '原創測試：取得知識。', example: ['這是原創測試例句。'] }] }]
      });
      if (url.hostname === 'api.dictionaryapi.dev') return Response.json([{
        word: 'serendipity', phonetic: '/test/', license: { name: 'Original fixture', url: 'https://example.org/license' },
        meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'An original English fixture definition.', example: 'An original fixture sentence.' }] }]
      }]);
      if (url.hostname === 'api.wiktapi.dev') {
        const edition = url.pathname.split('/')[2];
        const word = decodeURIComponent(url.pathname.split('/').at(-1));
        return Response.json({ word, edition, entries: [{ lang_code: 'zh', pos: 'verb',
          senses: [{ glosses: [edition === 'en' ? 'To acquire knowledge (original fixture).' : '原創測試：取得知識。'],
            examples: [{ text: '這是原創測試例句。', translation: 'This is an original fixture sentence.', ref: 'Original fixture' }] }],
          sounds: [{ zh_pron: 'xué xí', tags: ['Mandarin', 'Pinyin', 'Mainland-China'] }]
        }] });
      }
      throw new Error('Unexpected host in UI regression fixture');
    };
  });
}
async function select(harness, word) {
  await harness.page.bringToFront();
  await harness.page.keyboard.press('Escape');
  await harness.page.evaluate(value => {
    document.querySelector('#ui-test-word')?.remove();
    const node = document.createElement('span');
    node.id = 'ui-test-word'; node.textContent = value;
    document.body.prepend(node);
    const range = document.createRange(); range.selectNodeContents(node);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  }, word);
  const box = await harness.page.locator('#ui-test-word').boundingBox();
  await harness.page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
  await harness.page.mouse.up();
  await harness.waitForPanel('.launcher');
  await harness.panel('.launcher', 'this.click()');
  await harness.waitForPanel('.summary-text', 'return !this.classList.contains("loading")');
}

for (const tag of ['en-US', 'zh-TW']) {
  const harness = await openLocaleHarness(chromium, tag);
  try {
    await fixture(harness.worker);
    await harness.options.evaluate(() => chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: {
      enabled: true, provider: 'free', englishProvider: 'free', chineseRegion: 'TW'
    } }));
    if (tag === 'en-US') {
      await select(harness, '學習');
      await harness.panel('.summary', 'this.focus()');
      await harness.page.keyboard.press('Enter');
      await harness.waitForPanel('.summary', 'return this.getAttribute("aria-expanded")==="true"');
      await harness.waitForPanel('.panel', 'return this.getBoundingClientRect().width>=423');
      checks.push('Keyboard Enter expands a Chinese word card');
      assert.match(await harness.panel('.copyright', 'return this.textContent'), /教育部.*辭典/);
      await harness.panel('.copyright', 'this.scrollIntoView({block:"nearest"})');
      assert.equal(await harness.panel('.copyright', 'const r=this.getBoundingClientRect(),card=this.closest(".cards").getBoundingClientRect(),fold=this.closest(".fold-clip").getBoundingClientRect();return r.height>0&&r.top>=Math.max(card.top,fold.top)&&r.bottom<=Math.min(card.bottom,fold.bottom)&&r.bottom<=innerHeight'), true);
      checks.push('English UI preserves the visible Chinese primary-source attribution');
      assert.equal(await harness.panel('.pronunciation', 'return this.lang'), 'zh-TW');
      checks.push('Taiwan reading carries the explicit speech locale');
      assert.ok(await harness.panel('.details', 'return this.querySelectorAll(".source-license").length>=2'));
      checks.push('Combined Chinese and English corpora retain their separate licenses');
      await harness.page.screenshot({ path: join(directory, `${tag}-attribution.png`) });
      await harness.options.evaluate(() => chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { chineseRegion: 'CN' } }));
      await select(harness, '干');
      const notice = await harness.panel('.lookup-notice', 'return this.hidden ? "" : this.textContent');
      assert.match(notice, /character/);
      assert.match(notice, /干/);
      assert.match(notice, /幹/);
      checks.push('An English notice keeps distinct Chinese query spellings visible');
      await harness.options.evaluate(() => chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { chineseRegion: 'TW' } }));
      const popup = await harness.context.newPage();
      await popup.goto(`chrome-extension://${harness.extensionId}/popup.html`);
      await popup.waitForFunction(() => document.querySelector('#provider').textContent.includes('Free Dictionary'));
      await popup.evaluate(() => {
        const send = chrome.runtime.sendMessage.bind(chrome.runtime);
        chrome.runtime.sendMessage = message => message.type !== 'SAVE_SETTINGS' ? send(message) : new Promise(resolve => {
          globalThis.pendingSettings = message;
          globalThis.resumeSettings = () => send(message).then(resolve);
        });
      });
      await popup.locator('#enabled').uncheck();
      await popup.waitForFunction(() => Boolean(globalThis.pendingSettings));
      await harness.options.evaluate(() => chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { chineseRegion: 'HK' } }));
      await popup.evaluate(() => globalThis.resumeSettings());
      const settings = await harness.options.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_PRIVATE_SETTINGS' }));
      assert.equal(settings.enabled, false);
      assert.equal(settings.chineseRegion, 'HK');
      checks.push('A delayed popup toggle preserves a region saved by another window');
      await popup.close();
    } else {
      await harness.page.locator('#serendipity').dblclick();
      await harness.waitForPanel('.summary-text', 'return !this.classList.contains("loading")');
      await harness.panel('.summary', 'this.click()');
      assert.match(await harness.panel('.part-of-speech', 'return this.textContent'), /名詞/);
      assert.doesNotMatch(await harness.panel('.part-of-speech', 'return this.textContent'), /名词/);
      checks.push('Traditional Chinese UI uses Traditional part-of-speech labels');
    }
    assert.deepEqual(harness.errors, []);
    await harness.waitForPanel('.panel', 'return this.getAnimations({subtree:true}).length===0');
    await harness.page.screenshot({ path: join(directory, `${tag}.png`) });
  } catch (error) {
    await harness.page.screenshot({ path: join(directory, `${tag}-failure.png`) }).catch(() => {});
    throw error;
  } finally { await harness.close(); }
}
await writeFile(join(directory, 'report.json'), JSON.stringify({ checks }, null, 2) + '\n');
for (const check of checks) console.log(`PASS ${check}`);
