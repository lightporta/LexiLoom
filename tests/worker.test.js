import test from 'node:test';
import assert from 'node:assert/strict';
let handler;
let stored = { enabled: true, provider: 'demo', bridgeToken: 'private-bridge-token-is-long-enough' };
let access;
globalThis.chrome = {
  i18n: { getUILanguage: () => 'zh-CN' },
  storage: { local: {
    setAccessLevel: async value => { access = value; },
    get: async () => ({ settings: stored }),
    set: async value => { stored = value.settings; }
  } },
  runtime: { id: 'a'.repeat(32), onMessage: { addListener: fn => { handler = fn; } },
    onInstalled: { addListener() {} }, openOptionsPage: async () => {} }
};
await import('../extension/background/worker.js');
const site = { id: chrome.runtime.id, url: 'https://reading.example/' };
const options = { id: chrome.runtime.id, url: `chrome-extension://${chrome.runtime.id}/options.html` };
function send(message, sender = site) { return new Promise(resolve => handler(message, sender, resolve)); }
test('worker restricts storage and content-facing settings', async () => {
  assert.deepEqual(access, { accessLevel: 'TRUSTED_CONTEXTS' });
  assert.deepEqual(await send({ type: 'GET_SETTINGS' }), { enabled: true, provider: 'demo', englishProvider: 'free', chineseRegion: 'auto', guidance: { disabled: [], custom: [] } });
  assert.equal((await send({ type: 'GET_PRIVATE_SETTINGS' })).error, 'unauthorized');
  assert.equal((await send({ type: 'SAVE_SETTINGS', settings: { provider: 'oxford' } })).error, 'unauthorized');
});
test('only extension pages can change settings and private token remains local', async () => {
  assert.equal((await send({ type: 'GET_PRIVATE_SETTINGS' }, options)).bridgeToken, stored.bridgeToken);
  assert.equal((await send({ type: 'SAVE_SETTINGS', settings: { enabled: true, provider: 'demo' } }, options)).ok, true);
  assert.ok(stored.bridgeToken);
});
test('worker validates source identity and lookup words', async () => {
  assert.equal((await send({ type: 'LOOKUP', word: 'apple' }, { id: 'other' })).error, 'unauthorized');
  const invalid = await send({ type: 'LOOKUP', word: 'https://example.com' });
  assert.equal(invalid.error.code, 'invalid-word');
  assert.deepEqual(invalid.pronunciations, []);
  assert.deepEqual(invalid.meanings, []);
  assert.equal(typeof invalid.language, 'string');
  assert.equal((await send({ type: 'LOOKUP', word: 'APPLE' })).status, 'ok');
});
test('eight official lookups queue at most four bridge requests', async () => {
  const oldFetch = globalThis.fetch;
  stored = { ...stored, provider: 'oxford' };
  let active = 0, maximum = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).host, '127.0.0.1:47821');
    assert.equal(init.credentials, 'omit');
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 8)); active--;
    return Response.json({ word: 'apple', status: 'not-found' });
  };
  try {
    const results = await Promise.all(Array.from({ length: 8 }, () => send({ type: 'LOOKUP', word: 'apple' })));
    assert.equal(maximum, 4);
    assert.ok(results.every(result => result.status === 'not-found'));
  } finally { globalThis.fetch = oldFetch; stored = { ...stored, provider: 'demo' }; }
});
test('english interface looks up Free Dictionary and does not call Chinese Wiktionary', async () => {
  chrome.i18n = { getUILanguage: () => 'en-US' };
  stored = { enabled: true, provider: 'wiktionary', englishProvider: 'free', bridgeToken: stored.bridgeToken };
  const calls = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    calls.push(String(url));
    return Response.json([{ word: 'apple', phonetic: '/ˈæp.əl/', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A round fruit.', example: 'She ate an apple.' }] }] }]);
  };
  try {
    const result = await send({ type: 'LOOKUP', word: 'apple' });
    assert.equal(result.status, 'ok');
    assert.equal(result.meanings[0].definitions[0].definition, 'A round fruit.');
    assert.ok(calls.some(url => url.includes('dictionaryapi.dev')));
    assert.ok(calls.every(url => !url.includes('wiktapi')));
  } finally {
    globalThis.fetch = oldFetch;
    chrome.i18n = { getUILanguage: () => 'zh-CN' };
    stored = { enabled: true, provider: 'demo', bridgeToken: stored.bridgeToken };
  }
});
test('Taiwan interface looks up MOE and Chinese Wiktionary, not the English dictionary', async () => {
  chrome.i18n = { getUILanguage: () => 'zh-TW' };
  const calls = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (String(url).includes('moedict.tw')) {
      return Response.json({ heteronyms: [{ bopomofo: 'ㄅㄚ', pinyin: 'bā', definitions: [{ def: '原创台湾测试。', example: ['这是原创例句。'] }] }] });
    }
    return Response.json({ entries: [{ lang_code: 'zh', pos: 'noun', senses: [{ glosses: ['An original English gloss.'] }], sounds: [] }] });
  };
  try {
    const result = await send({ type: 'LOOKUP', word: '学习' });
    assert.equal(result.status, 'ok');
    assert.equal(result.region, 'TW');
    assert.equal(result.language, 'zh');
    assert.equal(result.meanings.find(meaning => meaning.origin === 'moe').definitions[0].definition, '原创台湾测试。');
    assert.ok(calls.some(url => url.includes('www.moedict.tw/uni/') && url.includes(encodeURIComponent('學習'))));
    assert.ok(calls.some(url => url.includes('api.wiktapi.dev/v1/en/')));
    assert.ok(calls.every(url => !url.includes('dictionaryapi.dev')));
  } finally {
    globalThis.fetch = oldFetch;
    chrome.i18n = { getUILanguage: () => 'zh-CN' };
  }
});
test('saving the english dictionary does not replace the chinese provider', async () => {
  stored = { enabled: true, provider: 'wiktionary', englishProvider: 'free', bridgeToken: 'private-bridge-token-is-long-enough' };
  assert.equal((await send({ type: 'SAVE_SETTINGS', settings: { enabled: true, englishProvider: 'demo', bridgeToken: stored.bridgeToken } }, options)).ok, true);
  assert.equal(stored.provider, 'wiktionary');
  assert.equal(stored.englishProvider, 'demo');
  stored = { enabled: true, provider: 'demo', bridgeToken: stored.bridgeToken };
});
test('partial and simultaneous settings saves preserve pause state and independent preferences', async () => {
  stored = { enabled: false, provider: 'wiktionary', englishProvider: 'free', chineseRegion: 'auto', bridgeToken: 'private-bridge-token-is-long-enough' };
  const oldGet = chrome.storage.local.get, oldSet = chrome.storage.local.set;
  chrome.storage.local.get = async () => { await new Promise(resolve => setTimeout(resolve, 3)); return { settings: { ...stored } }; };
  chrome.storage.local.set = async value => { await new Promise(resolve => setTimeout(resolve, 3)); stored = value.settings; };
  try {
    const responses = await Promise.all([
      send({ type: 'SAVE_SETTINGS', settings: { englishProvider: 'demo' } }, options),
      send({ type: 'SAVE_SETTINGS', settings: { chineseRegion: 'HK' } }, options)
    ]);
    assert.ok(responses.every(value => value.ok));
    assert.equal(stored.enabled, false);
    assert.equal(stored.provider, 'wiktionary');
    assert.equal(stored.englishProvider, 'demo');
    assert.equal(stored.chineseRegion, 'HK');
    assert.equal(stored.bridgeToken, 'private-bridge-token-is-long-enough');
  } finally {
    chrome.storage.local.get = oldGet; chrome.storage.local.set = oldSet;
    stored = { enabled: true, provider: 'demo', bridgeToken: stored.bridgeToken };
  }
});
test('catalog requests cannot access a non-catalog extension path', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('No network request should occur for an invalid catalog.'); };
  try { assert.equal((await send({ type: 'GET_CATALOG', catalog: '../../bridge/.env' })).error, 'invalid-catalog'); }
  finally { globalThis.fetch = oldFetch; }
});
test('options page validates custom guidance atomically and content clients never see the token', async () => {
  stored = { enabled: true, provider: 'demo', chineseRegion: 'auto', bridgeToken: 'private-bridge-token-is-long-enough' };
  const french = { name: 'French dictionary', template: 'https://example.com/w/{word}', language: 'fr' };
  const saved = await send({ type: 'SAVE_SETTINGS', settings: {
    enabled: true, provider: 'demo',
    guidanceDisabled: ['en-wiktionary', 'bogus', 'zh-youdao'],
    guidanceCustom: [french]
  } }, options);
  assert.deepEqual(saved, { ok: true });
  // Unknown builtin ids are harmless, but custom rows must never be lost.
  assert.deepEqual(stored.guidanceDisabled, ['en-wiktionary', 'zh-youdao']);
  assert.deepEqual(stored.guidanceCustom, [french]);
  assert.deepEqual((await send({ type: 'GET_SETTINGS' })).guidance.custom, [french]);
  assert.equal(stored.enabled, true);
  assert.equal(stored.provider, 'demo');
  const beforeInvalidSave = structuredClone(stored);
  const invalidCustomLists = [
    [french, { name: 'Bad scheme', template: 'http://example.com/{word}' }],
    [{ name: 'No placeholder', template: 'https://example.com/fixed' }],
    Array.from({ length: 7 }, (_, index) => ({ ...french, name: `Site ${index}` })),
    [{ name: 'Hostname placeholder', template: 'https://{word}.example.com/' }],
    [{ name: 'Long template', template: 'https://example.com/' + 'x'.repeat(300) + '/{word}' }],
    [{ ...french, name: 'x'.repeat(61) }],
    [{ ...french, language: 'unknown' }],
    { name: 'Not an array' }
  ];
  for (const guidanceCustom of invalidCustomLists) {
    const rejected = await send({ type: 'SAVE_SETTINGS', settings: { enabled: false, chineseRegion: 'HK', guidanceCustom } }, options);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error, 'invalid-guidance');
    assert.deepEqual(stored, beforeInvalidSave, 'a rejected custom list must not partially save other fields');
  }
  // Saving only custom templates preserves the disabled ids and other fields.
  assert.deepEqual(await send({ type: 'SAVE_SETTINGS', settings: { guidanceCustom: [] } }, options), { ok: true });
  assert.deepEqual(stored.guidanceDisabled, ['en-wiktionary', 'zh-youdao']);
  assert.deepEqual(stored.guidanceCustom, []);
  assert.equal(stored.enabled, true);
  assert.equal(stored.provider, 'demo');
  // The content-facing shape carries resolved guidance state but not the token.
  const settings = await send({ type: 'GET_SETTINGS' });
  assert.deepEqual(settings, {
    enabled: true, chineseRegion: 'auto', provider: 'demo', englishProvider: 'free',
    guidance: { disabled: ['en-wiktionary', 'zh-youdao'], custom: [] }
  });
  assert.ok(!JSON.stringify(settings).includes('private-bridge-token'));
  stored = { enabled: true, provider: 'demo', bridgeToken: 'private-bridge-token-is-long-enough' };
});
test('a settings save broadcasts public settings to content scripts without the bridge token', async () => {
  const sent = [];
  const oldTabs = chrome.tabs;
  chrome.tabs = {
    query: async () => [{ id: 11 }, { id: 12 }, { id: undefined }],
    sendMessage: async (id, message) => {
      sent.push({ id, message });
      if (id === 12) throw new Error('No receiver for this tab.');
    }
  };
  try {
    stored = { enabled: true, provider: 'demo', englishProvider: 'demo', chineseRegion: 'auto', bridgeToken: 'private-bridge-token-is-long-enough' };
    const french = { name: 'French dictionary', template: 'https://example.com/w/{word}', language: 'fr' };
    assert.deepEqual(await send({ type: 'SAVE_SETTINGS', settings: { guidanceDisabled: ['zh-youdao'], guidanceCustom: [french] } }, options), { ok: true });
    assert.deepEqual(sent.map(item => item.id), [11, 12]);
    const message = sent[0].message;
    assert.equal(message.type, 'SETTINGS_CHANGED');
    assert.deepEqual(message.settings, {
      enabled: true, chineseRegion: 'auto', provider: 'demo', englishProvider: 'demo',
      guidance: { disabled: ['zh-youdao'], custom: [french] }
    });
    assert.deepEqual(await send({ type: 'GET_SETTINGS' }), message.settings, 'initial reads and broadcasts must share the same public settings shape');
    assert.ok(!JSON.stringify(message).includes('private-bridge-token'));
  } finally { chrome.tabs = oldTabs; }
});
test('initial settings preserve the saved English dictionary and validate unsupported values', async () => {
  const previous = stored;
  try {
    stored = { ...stored, englishProvider: 'cambridge' };
    assert.equal((await send({ type: 'GET_SETTINGS' })).englishProvider, 'cambridge');
    stored = { ...stored, englishProvider: 'https://unexpected.example' };
    const settings = await send({ type: 'GET_SETTINGS' });
    assert.equal(settings.englishProvider, 'free');
    assert.ok(!('bridgeToken' in settings));
  } finally { stored = previous; }
});
test('navigation opens only the extension directory with validated query data in its fragment', async () => {
  const previousTabs = chrome.tabs, previousGetURL = chrome.runtime.getURL;
  const opened = [];
  chrome.tabs = { create: async details => { opened.push(details); } };
  chrome.runtime.getURL = path => `chrome-extension://${chrome.runtime.id}/${path}`;
  try {
    assert.deepEqual(await send({ type: 'OPEN_NAVIGATION', word: "l'été & café", language: 'fr', region: 'TW' }), { ok: true });
    const target = new URL(opened[0].url);
    assert.equal(target.protocol, 'chrome-extension:');
    assert.equal(target.hostname, chrome.runtime.id);
    assert.equal(target.pathname, '/navigation.html');
    assert.equal(target.search, '');
    assert.deepEqual(Object.fromEntries(new URLSearchParams(target.hash.slice(1))), { word: "l'été & café", language: 'fr', region: 'TW' });
    for (const message of [
      { word: '', language: 'en' }, { word: 'a'.repeat(65), language: 'en' },
      { word: 'bad\u0000word', language: 'en' }, { word: '\nword', language: 'en' },
      { word: 'a\ud800b', language: 'fr' }, { word: 'word', language: 'unknown' }
    ]) assert.deepEqual(await send({ type: 'OPEN_NAVIGATION', ...message }), { error: 'invalid-word' });
    assert.deepEqual(await send({ type: 'OPEN_NAVIGATION', word: 'apple', language: 'en' }, { id: 'other' }), { error: 'unauthorized' });
    assert.equal(opened.length, 1, 'invalid requests must not open any tab');
  } finally {
    chrome.tabs = previousTabs;
    if (previousGetURL) chrome.runtime.getURL = previousGetURL;
    else delete chrome.runtime.getURL;
  }
});
