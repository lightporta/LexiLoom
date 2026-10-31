// Region checks run in real Chromium. getUILanguage is replaced in the copied
// extension because --lang does not switch the extension UI on macOS or Linux.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { evidenceFolder, openLocaleHarness } from './browser-test-harness.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const folder = await evidenceFolder();
const report = [];

function wiki(glosses, tags, examples, sounds) {
  return { entries: [{ lang_code: 'zh', pos: 'verb', senses: [{ glosses, tags, examples }], sounds }] };
}

const mandarinSound = { zh_pron: 'xué xí', tags: ['Mandarin', 'Pinyin', 'Mainland-China'] };
const taiwanSound = { zh_pron: 'ㄒㄩㄝˊ ㄒㄧˊ', tags: ['Mandarin', 'Bopomofo', 'Taiwan'] };
const hongKongSound = { zh_pron: 'hok6 zaap6', tags: ['Cantonese', 'Jyutping', 'Hong-Kong'] };
const mainland = {
  zh: wiki(
    ['从阅读、听讲中获得知识。'],
    ['Mandarin', 'Mainland-China'],
    [{ text: '学生们在教室里阅读。', translation: 'The students read in the classroom.', ref: 'Original fixture' }],
    [mandarinSound, taiwanSound]
  ),
  en: wiki(['To study a subject.'], ['Mandarin'], [{ text: 'She studies every evening.', ref: 'Original fixture' }], [mandarinSound]),
  moe: {
    heteronyms: [{ bopomofo: 'ㄒㄩㄝˊ ㄒㄧˊ', pinyin: 'xué xí', definitions: [{ def: '请使用软件完成练习。', example: ['他每天练习两个小时。'] }] }]
  },
  free: [{ phonetic: '/test/', license: { name: 'Original fixture license', url: 'https://example.org/license' }, sourceUrls: ['https://example.org/original-fixture'], meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'An original English dictionary definition.', example: 'This is an original English example.' }] }] }]
};
const hongKong = {
  ...mainland,
  zh: wiki(
    ['粵語：溫習。'],
    ['Cantonese', 'Hong-Kong'],
    [{ text: '今晚要溫書。', translation: 'I have to revise tonight.', ref: 'Original fixture' }],
    [hongKongSound, mandarinSound]
  )
};

async function install(worker, payloads) {
  await worker.evaluate(async payloads => {
    globalThis.__LEXILOOM_QA_REQUESTS__ = [];
    const original = globalThis.__LEXILOOM_QA_ORIGINAL_FETCH__;
    globalThis.fetch = async (url, init) => {
      const href = String(url);
      if (href.startsWith('chrome-extension://')) return original(url, init);
      globalThis.__LEXILOOM_QA_REQUESTS__.push(href);
      const body = href.includes('moedict.tw') ? payloads.moe
        : href.includes('dictionaryapi.dev') ? payloads.free
          : href.includes('/v1/en/') ? payloads.en
            : href.includes('/v1/zh/') ? payloads.zh
              : null;
      if (!body) {
        return new Response(JSON.stringify({ error: true, status: 404, message: 'No entries found for missing' }), {
          status: 404, headers: { 'content-type': 'application/json' }
        });
      }
      return Response.json(body);
    };
  }, payloads);
}

async function requests(worker) {
  return worker.evaluate(() => globalThis.__LEXILOOM_QA_REQUESTS__.slice());
}

async function resetRequests(worker) {
  await worker.evaluate(() => { globalThis.__LEXILOOM_QA_REQUESTS__ = []; });
}

async function selectChinese(harness, word) {
  const { page } = harness;
  await page.bringToFront();
  await page.keyboard.press('Escape');
  await page.evaluate(value => {
    let node = document.querySelector('#han-word');
    if (!node) {
      node = document.createElement('p');
      node.id = 'han-word';
      document.body.prepend(node);
    }
    node.textContent = value;
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, word);
  const box = await page.locator('#han-word').boundingBox();
  await page.mouse.move(box.x + Math.max(box.width - 2, 1), box.y + Math.min(12, box.height / 2));
  await page.mouse.up();
  await harness.waitForPanel('.launcher');
  await harness.panel('.launcher', 'this.click()');
  return harness.waitForPanel('.summary-text', 'return !this.classList.contains("loading") && this.textContent');
}

async function run(tag, check) {
  const harness = await openLocaleHarness(chromium, tag);
  try {
    const language = await harness.worker.evaluate(() => chrome.i18n.getUILanguage());
    assert.equal(language, tag, `${tag}: getUILanguage was not isolated`);
    await harness.options.evaluate(() => chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS', settings: { enabled: true, provider: 'smart', englishProvider: 'free', chineseRegion: 'auto' }
    }));
    await check(harness);
    assert.deepEqual(harness.errors, [], `${tag}: ${harness.errors.join('\n')}`);
    await harness.page.screenshot({ path: join(folder, `${tag}.png`) });
    console.log(`PASS ${tag}`);
  } catch (error) {
    await harness.page.screenshot({ path: join(folder, `${tag}-failure.png`) }).catch(() => {});
    throw error;
  } finally {
    await harness.close();
  }
}

await run('zh-CN', async harness => {
  await install(harness.worker, mainland);
  const result = await harness.options.evaluate(word => chrome.runtime.sendMessage({ type: 'LOOKUP', word }), '学习');
  assert.equal(result.region, 'CN');
  assert.equal(result.phonetic, 'xué xí');
  assert.equal(result.pronunciations[0].label, '汉语拼音 · 普通话');
  assert.equal(result.meanings.some(meaning => meaning.language === 'en'), true);
  const called = await requests(harness.worker);
  assert.ok(called.some(url => url.includes('api.wiktapi.dev/v1/zh/')));
  assert.ok(called.every(url => !url.includes('moedict.tw') && !url.includes('dictionaryapi.dev')));
  await resetRequests(harness.worker);
  const summary = await selectChinese(harness, '学习');
  assert.match(summary, /获得知识/);
  assert.equal(await harness.panel('.phonetic', 'return this.textContent'), 'xué xí');
  const details = await harness.waitForPanel('.details', 'return this.textContent');
  assert.match(details, /学生们在教室里阅读/);
  assert.match(details, /To study a subject/);
  report.push({ tag: 'zh-CN', summary, requests: await requests(harness.worker) });
});

await run('zh-HK', async harness => {
  await install(harness.worker, hongKong);
  const result = await harness.options.evaluate(word => chrome.runtime.sendMessage({ type: 'LOOKUP', word }), '学习');
  assert.equal(result.region, 'HK');
  assert.equal(result.phonetic, 'hok6 zaap6');
  assert.equal(result.pronunciations[0].label, '粵語拼音 · 香港');
  assert.ok(result.pronunciations.some(item => item.label === '普通話拼音 · 補充'));
  const called = await requests(harness.worker);
  assert.ok(called.every(url => !url.includes('moedict.tw')));
  await resetRequests(harness.worker);
  await selectChinese(harness, '学习');
  assert.equal(await harness.panel('.phonetic', 'return this.textContent'), 'hok6 zaap6');
  const details = await harness.waitForPanel('.details', 'return this.textContent');
  assert.match(details, /温習|溫習|温习/);
  assert.match(details, /粵語拼音 · 香港/);
  assert.match(details, /To study a subject/);
  report.push({ tag: 'zh-HK', requests: await requests(harness.worker) });
});

await run('zh-TW', async harness => {
  await install(harness.worker, mainland);
  const result = await harness.options.evaluate(word => chrome.runtime.sendMessage({ type: 'LOOKUP', word }), '学习');
  assert.equal(result.region, 'TW');
  assert.equal(result.phonetic, 'ㄒㄩㄝˊ ㄒㄧˊ');
  assert.equal(result.meanings.find(meaning => meaning.origin === 'moe').definitions[0].definition, '请使用软件完成练习。');
  const called = await requests(harness.worker);
  assert.ok(called.some(url => url.includes('www.moedict.tw/uni/') && url.includes(encodeURIComponent('學習'))));
  await resetRequests(harness.worker);
  await selectChinese(harness, '学习');
  assert.equal(await harness.panel('.word', 'return this.textContent'), '學習');
  assert.equal(await harness.panel('.phonetic', 'return this.textContent'), 'ㄒㄩㄝˊ ㄒㄧˊ');
  const details = await harness.waitForPanel('.details', 'return this.textContent');
  assert.match(details, /请使用软件完成练习/);
  assert.match(details, /注音/);
  assert.match(details, /To study a subject/);
  report.push({ tag: 'zh-TW', requests: await requests(harness.worker) });
});

await run('en-US', async harness => {
  await install(harness.worker, mainland);
  await resetRequests(harness.worker);
  await harness.page.locator('#serendipity').dblclick();
  const summary = await harness.waitForPanel('.summary-text', 'return !this.classList.contains("loading") && this.textContent');
  assert.match(summary, /original English/);
  assert.doesNotMatch(summary, /\p{Script=Han}/u);
  const called = await requests(harness.worker);
  assert.ok(called.some(url => url.includes('api.dictionaryapi.dev/')));
  assert.ok(called.every(url => !url.includes('wiktapi.dev') && !url.includes('moedict.tw')));
  const details = await harness.waitForPanel('.details', 'return this.textContent');
  assert.match(details, /original English example/);
  assert.doesNotMatch(details, /\p{Script=Han}/u);
  await resetRequests(harness.worker);
  const chineseSummary = await selectChinese(harness, '学习');
  assert.match(chineseSummary, /To study a subject/);
  assert.equal(await harness.panel('.phonetic', 'return this.textContent'), 'xué xí');
  const chineseDetails = await harness.waitForPanel('.details', 'return this.textContent');
  assert.match(chineseDetails, /获得知识/);
  const chineseCalls = await requests(harness.worker);
  assert.ok(chineseCalls.some(url => url.includes('api.wiktapi.dev/')));
  assert.ok(chineseCalls.every(url => !url.includes('dictionaryapi.dev')));
  report.push({ tag: 'en-US', summary, chineseSummary });
});

await writeFile(join(folder, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Locale evidence: ${folder}`);
