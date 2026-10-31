import test from 'node:test';
import assert from 'node:assert/strict';
let handler;
let stored = { enabled: true, provider: 'demo', bridgeToken: 'private-bridge-token-is-long-enough' };
let access;
globalThis.chrome = {
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
  assert.deepEqual(await send({ type: 'GET_SETTINGS' }), { enabled: true, provider: 'demo' });
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
  assert.equal((await send({ type: 'LOOKUP', word: 'https://example.com' })).error.code, 'invalid-word');
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
    delete chrome.i18n;
    stored = { enabled: true, provider: 'demo', bridgeToken: stored.bridgeToken };
  }
});
test('saving the english dictionary does not replace the chinese provider', async () => {
  stored = { enabled: true, provider: 'wiktionary', englishProvider: 'free', bridgeToken: 'private-bridge-token-is-long-enough' };
  assert.equal((await send({ type: 'SAVE_SETTINGS', settings: { enabled: true, englishProvider: 'demo', bridgeToken: stored.bridgeToken } }, options)).ok, true);
  assert.equal(stored.provider, 'wiktionary');
  assert.equal(stored.englishProvider, 'demo');
  stored = { enabled: true, provider: 'demo', bridgeToken: stored.bridgeToken };
});
