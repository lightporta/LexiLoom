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

// Delay these two independent startup boundaries in the copied test extension.
// DOM events release the gates without exposing test hooks in product files.
const startupPrelude = `(() => {
  const root = document.documentElement;
  const original = globalThis.LexiLoomI18n;
  const localeGate = new Promise(resolve => document.addEventListener('qa-release-locale', resolve, { once: true }));
  globalThis.LexiLoomI18n = { ...original, ready: Promise.all([original.ready, localeGate]) };
  const send = chrome.runtime.sendMessage.bind(chrome.runtime);
  let settingsReleased = false;
  const settingsGate = new Promise(resolve => document.addEventListener('qa-release-settings', () => {
    settingsReleased = true; resolve();
  }, { once: true }));
  chrome.runtime.sendMessage = (message, ...args) => {
    const response = send(message, ...args);
    if (message.type !== 'GET_SETTINGS' || settingsReleased) return response;
    root.dataset.qaSettingsStarted = 'true';
    return Promise.all([response, settingsGate]).then(([value]) => {
      root.dataset.qaSettingsReturned = 'true'; return value;
    });
  };
})();`;

{
  const harness = await openLocaleHarness(chromium, 'en-US', { contentPrelude: startupPrelude });
  try {
    await harness.page.locator('#serendipity').dblclick();
    await harness.page.waitForFunction(() => document.documentElement.dataset.qaSettingsStarted === 'true');
    checks.push('A cold selection starts its settings read while the locale catalog is still pending');
    await harness.page.keyboard.press('Escape');
    await harness.page.evaluate(() => {
      document.dispatchEvent(new Event('qa-release-locale'));
      document.dispatchEvent(new Event('qa-release-settings'));
    });
    await harness.page.waitForFunction(() => document.documentElement.dataset.qaSettingsReturned === 'true');
    await harness.page.waitForTimeout(250);
    assert.equal(await harness.panel('.panel'), null);
    assert.equal(await harness.panel('.launcher'), null);
    checks.push('Escape cancels a first selection awaiting settings and prevents a late card from reopening');

    await harness.page.locator('#serendipity').dblclick();
    await harness.waitForPanel('.summary-text', 'return !this.classList.contains("loading")');
    assert.match(await harness.panel('.word', 'return this.textContent'), /serendipity/);
    checks.push('A new selection still works after the pending first selection was cancelled');
    await harness.page.keyboard.press('Escape');
    await harness.page.evaluate(() => {
      const range = document.createRange(); range.selectNodeContents(document.querySelector('#serendipity'));
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    });
    await harness.page.mouse.up();
    await harness.page.keyboard.press('Escape');
    await harness.page.waitForTimeout(350);
    assert.equal(await harness.panel('.launcher'), null);
    checks.push('Escape also cancels the pending selection-launcher timer');
    assert.deepEqual(harness.errors, []);
  } finally { await harness.close(); }
}

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

// Start from a stored non-default English source and a fresh content script.
// Saving first would broadcast the missing field and conceal an initial-read bug.
{
  const harness = await openLocaleHarness(chromium, 'en-US');
  try {
    await fixture(harness.worker);
    await harness.worker.evaluate(async () => {
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, englishProvider: 'demo' } });
    });
    await harness.page.reload();
    await select(harness, 'serendipity');
    assert.match(await harness.panel('.source-label', 'return this.textContent'), /Local demo/);
    await harness.panel('.summary', 'this.click()');
    await harness.panel('.panel', 'this.__qaSourceSwitchPanel = true');
    await harness.options.evaluate(() => chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { englishProvider: 'free' } }));
    await harness.waitForPanel('.card', 'return this.getAttribute("aria-busy")==="false" && this.querySelector(".source-label").textContent.includes("Free Dictionary") && this.querySelector(".summary-text").textContent.includes("original English fixture")');
    assert.equal(await harness.panel('.panel', 'return this.__qaSourceSwitchPanel'), true);
    assert.equal(await harness.panel('.summary', 'return this.getAttribute("aria-expanded")'), 'true');
    assert.deepEqual(harness.errors, []);
    checks.push('An English card opened with a saved demo preference refreshes in place when switched to Free Dictionary');
  } catch (error) {
    await harness.page.screenshot({ path: join(directory, 'en-US-saved-source-failure.png') }).catch(() => {});
    throw error;
  } finally { await harness.close(); }
}

{
  const harness = await openLocaleHarness(chromium, 'en-US');
  try {
    await harness.options.waitForFunction(() => !document.querySelector('[type=submit]').disabled);
    const otherWindow = await harness.context.newPage();
    await otherWindow.goto(`chrome-extension://${harness.extensionId}/options.html`);
    await otherWindow.waitForFunction(() => !document.querySelector('[type=submit]').disabled);
    const externalCustom = { name: 'Other window dictionary', template: 'https://example.org/dictionary/{word}', language: 'en' };
    await otherWindow.evaluate(guidanceCustom => chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS', settings: { enabled: false, guidanceCustom: [guidanceCustom] }
    }), externalCustom);
    // This older options form still displays enabled=true and no custom rows.
    // Changing only the region must not submit those stale values as a reset.
    assert.equal(await harness.options.locator('#enabled').isChecked(), true);
    assert.equal(await harness.options.locator('#guidance-custom').inputValue(), '');
    await harness.options.locator('#chinese-region').selectOption('HK');
    await harness.options.locator('[type=submit]').click();
    await harness.options.waitForFunction(() => document.querySelector('#save-status').textContent === globalThis.LexiLoomI18n.t('saved'));
    const merged = await otherWindow.evaluate(() => chrome.runtime.sendMessage({ type: 'GET_PRIVATE_SETTINGS' }));
    assert.equal(merged.enabled, false);
    assert.equal(merged.chineseRegion, 'HK');
    assert.deepEqual(merged.guidanceCustom, [externalCustom]);
    checks.push('A stale options window saves its changed region without overwriting a pause or custom dictionary from another window');

    const failedWindow = await harness.context.newPage();
    await failedWindow.addInitScript(() => {
      if (location.pathname !== '/options.html') return;
      const send = chrome.runtime.sendMessage.bind(chrome.runtime);
      globalThis.__qaSaveAttempts = 0;
      chrome.runtime.sendMessage = (message, ...args) => {
        if (message.type === 'GET_PRIVATE_SETTINGS') return Promise.reject(new Error('QA-only settings read failure'));
        if (message.type === 'SAVE_SETTINGS') globalThis.__qaSaveAttempts += 1;
        return send(message, ...args);
      };
    });
    await failedWindow.goto(`chrome-extension://${harness.extensionId}/options.html`);
    await failedWindow.waitForFunction(() => document.querySelector('#save-status').dataset.error === 'true'
      && document.querySelector('#save-status').textContent === globalThis.LexiLoomI18n.t('readFailed'));
    assert.equal(await failedWindow.evaluate(() => [...document.querySelector('#settings-form').elements].every(control => control.disabled)), true);
    const beforeFailedSubmit = await harness.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    await failedWindow.evaluate(() => document.querySelector('#settings-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(await failedWindow.evaluate(() => globalThis.__qaSaveAttempts), 0);
    assert.deepEqual(await harness.worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings), beforeFailedSubmit);
    assert.deepEqual(harness.errors, []);
    await failedWindow.screenshot({ path: join(directory, 'en-US-options-read-failure.png') });
    checks.push('A failed options settings read disables the form and programmatic submit cannot overwrite storage');
  } catch (error) {
    await harness.options.screenshot({ path: join(directory, 'en-US-options-concurrency-failure.png') }).catch(() => {});
    throw error;
  } finally { await harness.close(); }
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
      await select(harness, 'serendipity');
      await harness.panel('.summary', 'this.click()');
      await harness.waitForPanel('.summary', 'return this.getAttribute("aria-expanded")==="true"');
      const englishGuidance = await harness.panel('.card', 'return [...this.querySelectorAll(".guidance-link")].map(link => link.textContent)');
      assert.ok(englishGuidance.length >= 1 && englishGuidance.length <= 3, JSON.stringify(englishGuidance));
      assert.ok(englishGuidance.some(name => /Wiktionary|Oxford Learner/.test(name)), JSON.stringify(englishGuidance));
      checks.push('English-interface English card shows international dictionary guidance links');
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
      // The delayed popup save disables lookup. The worker broadcasts the public
      // settings to open tabs, so the already-open panel must close instead of
      // staying on screen (defect 6 fix), then be re-openable after re-enabling.
      let closedAfterDisable = false;
      for (let attempt = 0; attempt < 80; attempt++) {
        if (await harness.panel('.panel', 'return true') === null) { closedAfterDisable = true; break; }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.ok(closedAfterDisable, 'open panel should close when lookup is disabled by another window');
      checks.push('Disabling lookup in another window closes the open card through the settings broadcast');
      await harness.options.evaluate(() => chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { enabled: true } }));
      await select(harness, 'serendipity');
      await harness.panel('.summary', 'this.click()');
      await harness.waitForPanel('.summary', 'return this.getAttribute("aria-expanded")==="true"');
    } else {
      await harness.page.locator('#serendipity').dblclick();
      await harness.waitForPanel('.summary-text', 'return !this.classList.contains("loading")');
      await harness.panel('.summary', 'this.click()');
      assert.match(await harness.panel('.part-of-speech', 'return this.textContent'), /名詞/);
      assert.doesNotMatch(await harness.panel('.part-of-speech', 'return this.textContent'), /名词/);
      checks.push('Traditional Chinese UI uses Traditional part-of-speech labels');
      await select(harness, '學習');
      await harness.panel('.summary', 'this.click()');
      await harness.waitForPanel('.summary', 'return this.getAttribute("aria-expanded")==="true"');
      const chineseGuidance = await harness.panel('.card', 'return [...this.querySelectorAll(".guidance-link")].map(link => link.textContent)');
      assert.ok(chineseGuidance.length >= 1 && chineseGuidance.length <= 3, JSON.stringify(chineseGuidance));
      assert.ok(chineseGuidance.some(name => /萌典|中文維基詞典|漢典/.test(name)), JSON.stringify(chineseGuidance));
      checks.push('Traditional Chinese interface shows Chinese dictionary guidance links');
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
