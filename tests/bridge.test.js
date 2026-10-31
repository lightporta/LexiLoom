import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { createBridgeServer } from '../bridge/server.js';

const TOKEN = 'test-only-token-' + '7'.repeat(32);
const baseConfig = { token: TOKEN, oxfordAppId: 'private-app-id', oxfordAppKey: 'private-app-key', cambridgeAccessKey: 'private-cambridge-key', cambridgeDictionaryCode: 'synthetic-test' };
const fixture = async name => JSON.parse(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

async function start(t, config = baseConfig, options = {}) {
  const server = createBridgeServer(config, options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    server,
    base,
    request: (path, options = {}) => fetch(base + path, { ...options, headers: { Authorization: `Bearer ${TOKEN}`, ...options.headers } }),
  };
}

test('bridge refuses unset/short/placeholder tokens and unsupported config', () => {
  assert.throws(() => createBridgeServer({ token: '' }), /BRIDGE_TOKEN/);
  assert.throws(() => createBridgeServer({ token: 'placeholder-'.repeat(4) }), /BRIDGE_TOKEN/);
  assert.throws(() => createBridgeServer({ token: TOKEN, oxfordLanguage: '../en' }), /OXFORD_LANGUAGE/);
  assert.throws(() => createBridgeServer({ token: TOKEN, cambridgeDictionaryCode: '../code' }), /CAMBRIDGE_DICTIONARY_CODE/);
});

test('bridge requires authentication and blocks web origins/host rebinding', async t => {
  const { request, base } = await start(t);
  assert.equal((await request('/v1/health', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await request('/v1/health', { headers: { Origin: 'https://example.org' } })).status, 403);
  const reboundStatus = await new Promise((resolve, reject) => {
    const req = http.get(base + '/v1/health', { headers: { Host: 'rebind.example.org', Authorization: `Bearer ${TOKEN}` } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
  assert.equal(reboundStatus, 403);
  const ok = await request('/v1/health', { headers: { Origin: 'chrome-extension://' + 'a'.repeat(32) } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal(ok.headers.has('access-control-allow-origin'), false);
  const content = await ok.text();
  assert.equal(content.includes('private-app-key'), false);
  assert.equal(content.includes(TOKEN), false);
});

test('bridge rejects non-GET methods, routes, invalid providers and words', async t => {
  let upstreamCalls = 0;
  const { request } = await start(t, baseConfig, { fetchImpl: async () => { upstreamCalls++; } });
  for (const path of ['/v1/lookup?provider=other&word=apple', '/v1/lookup?provider=oxford&word=a%20b', '/v1/lookup?provider=oxford&word=%3Cscript%3E']) assert.equal((await request(path)).status, 400);
  assert.equal((await request('/unrecognized')).status, 404);
  assert.equal((await request('/v1/health', { method: 'POST' })).status, 405);
  assert.equal(upstreamCalls, 0);
});

test('Oxford bridge uses Words endpoint, keeps credentials in upstream headers only', async t => {
  let captured;
  const payload = await fixture('oxford');
  const { request } = await start(t, baseConfig, { fetchImpl: async (url, init) => { captured = { url, init }; return Response.json(payload); } });
  const response = await request('/v1/lookup?provider=oxford&word=tests');
  const result = await response.json();
  assert.equal(result.status, 'ok');
  assert.equal(captured.url, 'https://od-api.oxforddictionaries.com/api/v2/words/en-gb?q=tests');
  assert.equal(captured.init.headers.app_id, 'private-app-id');
  assert.equal(captured.init.headers.app_key, 'private-app-key');
  assert.equal(captured.init.redirect, 'error');
  assert.equal(JSON.stringify(result).includes('private-'), false);
});

test('Oxford sandbox rejects non-a words without falsely calling them absent', async t => {
  let called = false;
  const { request } = await start(t, { ...baseConfig, oxfordSandbox: true }, { fetchImpl: async () => { called = true; } });
  const result = await (await request('/v1/lookup?provider=oxford&word=book')).json();
  assert.equal(result.status, 'error');
  assert.equal(result.error.code, 'sandbox-limit');
  assert.equal(called, false);
});

test('bridge missing credentials and upstream errors remain distinct', async t => {
  const unconfigured = await start(t, { token: TOKEN });
  assert.equal((await (await unconfigured.request('/v1/lookup?provider=oxford&word=apple')).json()).error.code, 'not-configured');
  for (const [status, expected] of [[404, 'not-found'], [403, 'authentication'], [429, 'rate-limit'], [503, 'upstream']]) {
    const { request } = await start(t, baseConfig, { fetchImpl: async () => new Response('do-not-return-this-upstream-secret', { status }) });
    const result = await (await request('/v1/lookup?provider=oxford&word=apple')).json();
    assert.equal(expected === 'not-found' ? result.status : result.error.code, expected);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});

test('Cambridge bridge uses authorized code and accessKey, parses bilingual HTML', async t => {
  const payload = await fixture('cambridge');
  let captured;
  const { request } = await start(t, baseConfig, { fetchImpl: async (url, init) => { captured = { url, init }; return Response.json(payload); } });
  const result = await (await request('/v1/lookup?provider=cambridge&word=test')).json();
  assert.equal(captured.url, 'https://dictionary.cambridge.org/api/v1/dictionaries/synthetic-test/search/first?q=test&format=html');
  assert.equal(captured.init.headers.accessKey, 'private-cambridge-key');
  assert.equal(result.meanings[0].definitions[0].translation, '原创测试释义');
});

test('Cambridge 404 only means absent word when the documented code is NoResults', async t => {
  for (const [payload, expected] of [
    [{ errorCode: 'NoResults', errorMessage: 'No matching entry.' }, 'not-found'],
    [{ errorCode: 'InvalidDictionary', errorMessage: 'private upstream text' }, 'invalid-dictionary'],
    [{ errorCode: 'InvalidPath', errorMessage: 'private upstream text' }, 'integration'],
    [{ errorCode: 'UnknownError', errorMessage: 'private upstream text' }, 'upstream'],
    [{}, 'upstream'],
  ]) {
    const { request } = await start(t, baseConfig, { fetchImpl: async () => Response.json(payload, { status: 404 }) });
    const result = await (await request('/v1/lookup?provider=cambridge&word=test')).json();
    assert.equal(expected === 'not-found' ? result.status : result.error.code, expected);
    assert.equal(JSON.stringify(result).includes('private upstream text'), false);
  }
});

test('Cambridge malformed or oversized 404 bodies never produce a false missing word', async t => {
  for (const body of ['not JSON', 'x'.repeat(1_000_001)]) {
    const { request } = await start(t, baseConfig, { fetchImpl: async () => new Response(body, { status: 404 }) });
    const result = await (await request('/v1/lookup?provider=cambridge&word=test')).json();
    assert.equal(result.status, 'error');
    assert.equal(result.error.code, 'upstream');
  }
});

test('Cambridge authorized dictionaries endpoint strips unexpected fields', async t => {
  const { request } = await start(t, baseConfig, { fetchImpl: async url => { assert.equal(url, 'https://dictionary.cambridge.org/api/v1/dictionaries'); return Response.json({ dictionaries: [{ dictionaryCode: 'synthetic-test', dictionaryName: 'Synthetic test', privateField: 'never forward' }] }); } });
  const result = await (await request('/v1/dictionaries')).json();
  assert.deepEqual(result, { dictionaries: [{ dictionaryCode: 'synthetic-test', dictionaryName: 'Synthetic test' }] });
});

test('bridge sanitizes network exceptions', async t => {
  const { request } = await start(t, baseConfig, { fetchImpl: async () => { throw new Error('private-app-key in error'); } });
  const result = await (await request('/v1/lookup?provider=oxford&word=test')).json();
  assert.equal(result.error.code, 'network');
  assert.equal(JSON.stringify(result).includes('private-app-key'), false);
});

test('bridge bounds concurrent provider calls', async t => {
  let release;
  let called = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const { request } = await start(t, baseConfig, { fetchImpl: async () => { called++; await gate; return Response.json({ results: [] }); } });
  const pending = Array.from({ length: 4 }, () => request('/v1/lookup?provider=oxford&word=apple'));
  while (called < 4) await new Promise(resolve => setTimeout(resolve, 5));
  const overflow = await request('/v1/lookup?provider=oxford&word=apple');
  assert.equal(overflow.status, 429);
  release();
  await Promise.all(pending);
});
