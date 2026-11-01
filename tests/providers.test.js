import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { lookupFree, lookupSmart, lookupWiktionary, normalizeCambridge, normalizeFree, normalizeOxford, normalizeWiktionary, readJsonLimited, safeHttps, validWord } from '../extension/shared/providers.js';

const fixture = async name => JSON.parse(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

test('word validation and URL validation reject unsafe inputs', () => {
  for (const word of ['apple', "don't", 'well-being']) assert.equal(validWord(word), true);
  for (const word of ['hello world', 'word<script>', '', 'a'.repeat(49), '../apple', 42]) assert.equal(validWord(word), false);
  for (const url of ['javascript:alert(1)', 'http://example.org/a', 'https://u:p@example.org', undefined]) assert.equal(safeHttps(url), '');
  assert.equal(safeHttps('https://example.org/a'), 'https://example.org/a');
});

test('Oxford normalizer extracts inflected-word response, nested senses, usage, audio', async () => {
  const result = normalizeOxford('tests', await fixture('oxford'));
  assert.equal(result.status, 'ok');
  assert.equal(result.word, 'tests');
  assert.equal(result.meanings[0].partOfSpeech, 'Verb');
  assert.equal(result.meanings[0].definitions.length, 2);
  assert.equal(result.meanings[0].definitions[0].usage, 'formal');
  assert.equal(result.meanings[0].definitions[0].examples[0].text, 'This is an original adapter example.');
  assert.deepEqual(result.meanings[0].synonyms, ['check']);
  assert.equal(result.pronunciations[0].audio, 'https://audio.example.org/test.mp3');
  assert.equal(normalizeOxford('test', {}).error.code, 'unsupported-format');
});

test('Cambridge normalizer keeps definition/translation/example relationships', async () => {
  const result = normalizeCambridge('test', await fixture('cambridge'));
  assert.equal(result.status, 'ok');
  assert.equal(result.meanings[0].partOfSpeech, 'noun');
  const [first, second] = result.meanings[0].definitions;
  assert.equal(first.definition, 'An original test definition & an explanation.');
  assert.equal(first.translation, '原创测试释义');
  assert.equal(first.examples[0].text, 'An original example for the adapter.');
  assert.equal(first.examples[0].translation, '适配器的原创例句。');
  assert.equal(first.usage, '[C]');
  assert.equal(second.translation, '第二个释义');
  assert.equal(result.pronunciations[0].label, 'UK');
  assert.equal(result.source.copyright, 'Synthetic fixture attribution.');
});

test('Cambridge parser treats markup as inert and rejects unknown formats', () => {
  const result = normalizeCambridge('test', { entryContent: '<script><div class="def">fake script definition</div></script><div class="sense"><div class="def">Safe &lt;img src=x onerror=alert(1)&gt;</div><audio><source src="javascript:alert(1)"></audio></div>', entryUrl: 'https://unrelated.example/path' });
  assert.equal(result.status, 'ok');
  assert.equal(result.meanings[0].definitions[0].definition, 'Safe <img src=x onerror=alert(1)>');
  assert.equal(result.source.url.includes('dictionary.cambridge.org'), true);
  assert.equal(result.pronunciations.length, 0);
  assert.equal(normalizeCambridge('test', { entryContent: '<p>Unrecognized markup</p>' }).error.code, 'unsupported-format');
});

test('Cambridge parser groups separate parts of speech correctly', () => {
  const result = normalizeCambridge('test', { entryContent: '<div class="entry-body__el"><span class="pos">noun</span><div class="def-block"><span class="def">A noun.</span></div></div><div class="entry-body__el"><span class="pos">verb</span><div class="def-block"><span class="def">A verb.</span></div></div>' });
  assert.deepEqual(result.meanings.map(item => item.partOfSpeech), ['noun', 'verb']);
});

test('free normalizer handles missing examples and excludes insecure audio', () => {
  const result = normalizeFree('hello', [{ phonetic: '/hello/', phonetics: [{ text: '/hello/', audio: 'http://unsafe.example/test.mp3' }], meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'An original greeting.' }], synonyms: ['greeting'] }] }]);
  assert.equal(result.status, 'ok');
  assert.equal(result.pronunciations[0].audio, '');
  assert.deepEqual(result.meanings[0].definitions[0].examples, []);
});

test('free provider distinguishes genuine 404, authentication, quota and network errors', async () => {
  for (const [status, expected] of [[404, 'not-found'], [403, 'authentication'], [429, 'rate-limit'], [500, 'upstream']]) {
    const result = await lookupFree('test', { fetchImpl: async () => new Response('', { status }) });
    assert.equal(expected === 'not-found' ? result.status : result.error.code, expected);
  }
  const network = await lookupFree('test', { fetchImpl: async () => { throw new Error('secret must never appear'); } });
  assert.equal(network.error.code, 'network');
  assert.equal(JSON.stringify(network).includes('secret'), false);
  const timeout = await lookupFree('test', { fetchImpl: async () => { throw new DOMException('test', 'TimeoutError'); } });
  assert.equal(timeout.error.code, 'timeout');
});

test('free provider validates input before sending a request', async () => {
  let requests = 0;
  const result = await lookupFree('hello world', { fetchImpl: async () => { requests++; } });
  assert.equal(result.error.code, 'invalid-word');
  assert.equal(requests, 0);
});

test('bounded response reader refuses large content before parsing', async () => {
  await assert.rejects(readJsonLimited(new Response('{}', { headers: { 'Content-Length': '1000001' } })), { code: 'response-too-large' });
  await assert.rejects(readJsonLimited(new Response('x'.repeat(1_000_001))), { code: 'response-too-large' });
});

test('Chinese WiktApi normalizer handles absent POS/language fields without inventing text', async () => {
  const result = normalizeWiktionary('test', await fixture('wiktionary-zh'));
  assert.equal(result.status, 'ok');
  assert.equal(result.meanings[0].partOfSpeech, '');
  assert.equal(result.meanings[0].definitions[0].definition, '原創測試詞義；保留繁體原文');
  assert.equal(result.meanings[0].definitions[0].usage, 'formal');
  assert.equal(result.meanings[0].definitions[0].examples[0].reference, 'LexiLoom synthetic fixture, 2026');
  assert.equal(result.source.id, 'wiktionary');
  assert.equal(result.source.url, 'https://zh.wiktionary.org/wiki/test');
  assert.equal(result.source.license.name, 'CC BY-SA 4.0');
  assert.equal(result.pronunciations[1].label, 'US');
  assert.equal(result.pronunciations[1].attributionUrl, 'https://commons.wikimedia.org/wiki/File:En-us-test.ogg');
  assert.equal('license' in result.pronunciations[1], false, 'dictionary text license must not be assigned to audio');
  assert.equal(result.pronunciations[2].audio, '');
});

test('WiktApi normalizer filters other languages, malformed entries, unsafe audio and attribution URLs', () => {
  const result = normalizeWiktionary('test', { edition: 'zh', entries: [null, { lang_code: 'fr', senses: [{ glosses: ['Not English.'] }] }, { lang_code: 'en', pos: 'noun', senses: [{ glosses: ['測試'] }], sounds: [{ ipa: '/test/', mp3_url: 'https://audio.example.org/test.mp3', source_url: 'javascript:alert(1)', audio: '../unsafe.ogg' }, { ipa: '/test2/', mp3_url: 'https://audio.example.org/test2.mp3', source_url: 'https://commons.wikimedia.org/wiki/File:Test2.ogg' }] }] });
  assert.equal(result.meanings.length, 1);
  assert.equal(result.meanings[0].partOfSpeech, 'noun');
  assert.equal(result.pronunciations[0].attributionUrl, undefined);
  assert.equal(result.pronunciations[1].attributionUrl, 'https://commons.wikimedia.org/wiki/File:Test2.ogg');
  for (const payload of [{}, { entries: [] }, { entries: [{ senses: [] }] }, { edition: 'en', entries: [{ senses: [{ glosses: ['English gloss'] }] }] }]) assert.equal(normalizeWiktionary('test', payload).error.code, 'unsupported-format');
});

test('WiktApi rejects a valid-shaped response for a different headword', async () => {
  for (const wrongWord of ['other', null, 0, '']) {
    const result = normalizeWiktionary('test', { ...(await fixture('wiktionary-zh')), word: wrongWord });
    assert.equal(result.status, 'error');
    assert.equal(result.error.code, 'unsupported-format');
  }
  assert.equal(normalizeWiktionary('Test', { ...(await fixture('wiktionary-zh')), word: 'test' }).status, 'ok');
});

test('Free Dictionary API retains HTTPS source, text license and separate audio license metadata', () => {
  const result = normalizeFree('test', [{ license: { name: 'CC BY-SA 3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0/' }, sourceUrls: ['javascript:alert(1)', 'https://en.wiktionary.org/wiki/test'], phonetics: [{ text: '/test/', audio: 'https://audio.example.org/test.mp3', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Test.ogg', license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' } }], meanings: [{ definitions: [{ definition: 'An original definition.' }] }] }]);
  assert.equal(result.source.url, 'https://en.wiktionary.org/wiki/test');
  assert.deepEqual(result.source.sourceUrls, ['https://en.wiktionary.org/wiki/test']);
  assert.equal(result.source.license.name, 'CC BY-SA 3.0');
  assert.equal(result.pronunciations[0].attributionUrl, 'https://commons.wikimedia.org/wiki/File:Test.ogg');
  assert.equal(result.pronunciations[0].license.name, 'CC BY 4.0');
});

const wiktMissing = () => Response.json({ error: true, status: 404, message: 'No entries found for "test"' }, { status: 404 });
const freeSuccess = () => Response.json([{ meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'An original English fixture definition.' }] }] }]);

test('WiktApi lookup uses the Chinese edition/English language, no credentials or redirects', async () => {
  let captured;
  const result = await lookupWiktionary('Test', { fetchImpl: async (url, init) => { captured = { url, init }; return Response.json(await fixture('wiktionary-zh')); } });
  assert.equal(result.status, 'ok');
  assert.equal(captured.url, 'https://api.wiktapi.dev/v1/zh/word/test?lang=en');
  assert.equal(captured.init.credentials, 'omit');
  assert.equal(captured.init.redirect, 'error');
  assert.equal(captured.init.signal instanceof AbortSignal, true);
});

test('WiktApi lookup distinguishes documented absence, generic 404, 429, malformed schema and network failure', async () => {
  const cases = [
    [wiktMissing, 'not-found'],
    [() => new Response('Not found', { status: 404 }), 'upstream'],
    [() => Response.json({ error: true, message: 'Unknown route' }, { status: 404 }), 'upstream'],
    [() => new Response('', { status: 429 }), 'rate-limit'],
    [() => Response.json({ entries: [] }), 'unsupported-format'],
    [() => { throw new Error('private exception'); }, 'network'],
    [() => { throw new DOMException('timed out', 'TimeoutError'); }, 'timeout'],
  ];
  for (const [fetchImpl, expected] of cases) {
    const result = await lookupWiktionary('test', { fetchImpl });
    assert.equal(expected === 'not-found' ? result.status : result.error.code, expected);
    assert.equal(JSON.stringify(result).includes('private exception'), false);
  }
});

test('smart lookup returns Chinese success without contacting the English fallback', async () => {
  const calls = [];
  const result = await lookupSmart('test', { fetchImpl: async url => { calls.push(url); return Response.json(await fixture('wiktionary-zh')); } });
  assert.equal(result.status, 'ok');
  assert.equal(result.source.id, 'wiktionary');
  assert.equal(calls.length, 1);
});

test('smart lookup labels English fallback differently for absent versus unavailable Chinese data', async () => {
  for (const [first, notice] of [[wiktMissing, '中文词源暂无此词，已显示英英释义。'], [() => new Response('', { status: 429 }), '中文词源暂不可用，已显示英英释义。']]) {
    const result = await lookupSmart('test', { fetchImpl: async url => url.includes('wiktapi') ? first() : freeSuccess() });
    assert.equal(result.source.id, 'free');
    assert.equal(result.status, 'ok');
    assert.equal(result.notice, notice);
  }
});

test('smart lookup only declares absence when both providers confirm it', async () => {
  const missing = await lookupSmart('test', { fetchImpl: async url => url.includes('wiktapi') ? wiktMissing() : new Response('', { status: 404 }) });
  assert.equal(missing.status, 'not-found');
  const chineseError = await lookupSmart('test', { fetchImpl: async url => new Response('', { status: url.includes('wiktapi') ? 429 : 404 }) });
  assert.equal(chineseError.status, 'error');
  assert.equal(chineseError.error.code, 'rate-limit');
  const englishError = await lookupSmart('test', { fetchImpl: async url => url.includes('wiktapi') ? wiktMissing() : new Response('', { status: 503 }) });
  assert.equal(englishError.status, 'error');
  assert.equal(englishError.error.code, 'upstream');
  const bothError = await lookupSmart('test', { fetchImpl: async () => new Response('', { status: 503 }) });
  assert.equal(bothError.status, 'error');
  assert.equal(bothError.notice, '中文和英英词源均暂不可用，请稍后重试。');
});

test('new providers reject invalid words without any network request', async () => {
  let calls = 0;
  const options = { fetchImpl: async () => { calls++; } };
  assert.equal((await lookupWiktionary('two words', options)).error.code, 'invalid-word');
  assert.equal((await lookupSmart('<script>', options)).error.code, 'invalid-word');
  assert.equal(calls, 0);
});
