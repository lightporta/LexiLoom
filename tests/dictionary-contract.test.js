import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/shared/languages.js';
import '../extension/shared/entry.js';
import '../extension/shared/present.js';
import { createDictionaryEngine, createLimitedFetch } from '../extension/shared/dictionary.js';

const { registry, createLanguageRegistry, DEFAULT_PROFILES } = globalThis.LexiLoomLanguages;
const { normalizeDictionaryEntry } = globalThis.LexiLoomEntry;
const { createCardView } = globalThis.LexiLoomPresent;
const original = definition => ({ status: 'ok', source: { id: 'fixture', name: 'Original fixture', url: 'https://example.org/word' }, meanings: [{ partOfSpeech: 'noun', definitions: [{ definition, examples: [] }] }] });

test('lookup context keeps UI language, headword language and Chinese region separate', () => {
  const englishInTaiwan = registry.lookupContext('APPLE', { uiLanguage: 'zh-TW', settings: { provider: 'wiktionary' } });
  assert.equal(englishInTaiwan.word, 'apple');
  assert.equal(englishInTaiwan.profile.id, 'en');
  assert.equal(englishInTaiwan.language, 'en');
  assert.equal(englishInTaiwan.ui.language, 'zh');
  assert.equal(englishInTaiwan.ui.region, 'TW');
  assert.equal(englishInTaiwan.adapterId, 'wiktionary');
  const chineseInEnglish = registry.lookupContext('你好', { uiLanguage: 'en-US', settings: { chineseRegion: 'HK', englishProvider: 'free' } });
  assert.equal(chineseInEnglish.profile.id, 'zh-HK');
  assert.equal(chineseInEnglish.region, 'HK');
  assert.equal(chineseInEnglish.ui.language, 'en');
  assert.equal(chineseInEnglish.adapterId, 'chinese');
});

test('explicit foreign targets share the adapter contract while retaining headword spelling and source reading locales', async () => {
  const expected = [['ja', '学校', 'ja-JP'], ['ko', '안녕', 'ko-KR'], ['fr', 'école', 'fr-FR'],
    ['de', 'Haus', 'de-DE'], ['es', 'niño', 'es-ES']];
  const seen = [];
  const engine = createDictionaryEngine({ adapters: {
    multilingual: async (word, context) => {
      seen.push(context.language);
      assert.equal(context.adapterId, 'multilingual');
      return { ...original('原创简体中文释义。'), word, pronunciations: [{ phonetic: '/fixture/' }],
        meanings: [{ language: 'zh', definitions: [{ definition: '原创简体中文释义。', examples: [] }] }] };
    },
    free: () => { throw new Error('An explicit foreign target must not use the English adapter.'); },
    chinese: () => { throw new Error('An explicit Japanese Han headword must not use the Chinese adapter.'); }
  } });
  for (const [targetLanguage, word, speechLocale] of expected) {
    const context = registry.lookupContext(word, { uiLanguage: 'en-US', settings: { targetLanguage, chineseRegion: 'HK', provider: 'demo' } });
    assert.equal(context.word, word);
    assert.equal(context.language, targetLanguage);
    assert.equal(context.ui.language, 'en');
    assert.equal(context.ui.region, 'HK');
    assert.equal(context.region, '');
    const entry = await engine.lookup(word, { uiLanguage: 'en-US', settings: { targetLanguage } });
    const view = createCardView(entry, 'en-US');
    assert.equal(entry.status, 'ok');
    assert.equal(entry.word, word);
    assert.equal(entry.profileId, targetLanguage);
    assert.equal(entry.pronunciations[0].locale, speechLocale);
    assert.equal(view.summary, '原创简体中文释义。');
    assert.equal(view.showTranslations, true);
    assert.equal(view.maxExamples, 2);
    assert.equal(view.speechFallbackLocale, speechLocale);
    assert.equal(context.profile.presentation.preferredMeaningLanguage, 'zh');
  }
  assert.deepEqual(seen, expected.map(([language]) => language));
  assert.equal(registry.lookupContext('学校', { settings: { targetLanguage: 'fr' } }), null);
  assert.equal(registry.lookupContext('Haus', { settings: { targetLanguage: 'pt' } }), null);
});

test('entry boundary keeps attribution and original MOE wording, while dropping secrets and unsafe URLs', () => {
  const raw = {
    ...original('unused'), language: 'en', privateKey: 'hidden-private-value', queryWord: '學習', queryWords: ['学习', '學習'],
    pronunciations: [{ label: '注音', phonetic: 'ㄒㄩㄝˊ ㄒㄧˊ', locale: 'zh-TW', audio: 'javascript:alert(1)', sourceUrl: 'https://www.moedict.tw/#學習', attributionUrl: 'https://u:p@example.org/', license: { name: 'Audio license', url: 'https://example.org/license' } }],
    meanings: [{ language: 'zh', origin: 'moe', partOfSpeech: '', definitions: [{ definition: ' 原創定義。\n保留原文。 ', examples: [{ text: ' 例句原文。 ', reference: '教育部辭典', privateKey: 'hidden-private-value' }] }] }],
    source: { id: 'moe', name: 'MOE', url: 'https://www.moedict.tw/#學習', copyright: '教育部辭典，原文。', license: { name: 'CC BY-ND 3.0 TW', url: 'https://creativecommons.org/licenses/by-nd/3.0/tw/' }, token: 'hidden-private-value', components: [{ id: 'wiktionary', name: 'Wiktionary', url: 'https://en.wiktionary.org/wiki/學習', license: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' } }] }
  };
  const context = registry.lookupContext('学习', { uiLanguage: 'zh-TW' });
  const entry = normalizeDictionaryEntry(raw, context);
  assert.equal(entry.language, 'zh');
  assert.equal(entry.region, 'TW');
  assert.equal(entry.profileId, 'zh-TW');
  assert.equal(entry.lemma, '學習');
  assert.deepEqual(entry.queryWords, ['学习', '學習']);
  assert.equal(entry.meanings[0].origin, 'moe');
  assert.equal(entry.meanings[0].definitions[0].definition, raw.meanings[0].definitions[0].definition);
  assert.equal(entry.meanings[0].definitions[0].examples[0].text, ' 例句原文。 ');
  assert.equal(entry.source.copyright, raw.source.copyright);
  assert.equal(entry.source.components[0].license.name, 'CC BY-SA 4.0');
  assert.equal(entry.pronunciations[0].audio, '');
  assert.equal('attributionUrl' in entry.pronunciations[0], false);
  assert.equal(entry.pronunciations[0].locale, 'zh-TW');
  assert.match(entry.pronunciations[0].sourceUrl, /^https:\/\/www\.moedict\.tw/);
  assert.equal(JSON.stringify(entry).includes('hidden-private-value'), false);
});

test('malformed adapter results never become a missing-word result', async () => {
  const engine = createDictionaryEngine({ adapters: { free: async () => ({ status: 'ok', meanings: [] }) } });
  assert.equal((await engine.lookup('apple', { uiLanguage: 'en-US' })).error.code, 'unsupported-format');
  assert.equal(normalizeDictionaryEntry(null).status, 'error');
  assert.equal(normalizeDictionaryEntry({ status: 'missing' }).status, 'error');
  assert.equal(normalizeDictionaryEntry({ status: 'not-found' }, { word: 'apple', profile: registry.get('en') }).status, 'not-found');
});

test('a new profile and adapter use the same entry and card model without adding rendering branches', async () => {
  const extended = createLanguageRegistry([...DEFAULT_PROFILES, {
    id: 'zz', language: 'zz', scripts: ['Greek'], matches: value => /^\p{Script=Greek}+$/u.test(value),
    normalize: value => value.toLowerCase(), runs: '[\\p{Script=Greek}]+', segment: 'whole', adapter: 'fixture',
    speechLocale: 'el-GR', presentation: { bilingual: true, maxExamples: 2, headings: false, notFoundKey: 'notFound' }
  }]);
  let calls = 0;
  const engine = createDictionaryEngine({ registry: extended, adapters: { fixture: async (word, context) => {
    calls++;
    assert.equal(word, 'δοκιμή');
    assert.equal(context.language, 'zz');
    return { ...original('An original definition for a hypothetical language.'), pronunciations: [{ label: 'Reading', phonetic: '/example/' }] };
  } } });
  const entry = await engine.lookup('ΔΟΚΙΜΉ', { uiLanguage: 'en-US' });
  const view = createCardView(entry, 'en-US', { registry: extended });
  assert.equal(calls, 1);
  assert.equal(entry.language, 'zz');
  assert.equal(entry.profileId, 'zz');
  assert.equal(entry.pronunciations[0].locale, 'el-GR');
  assert.equal(view.summary, 'An original definition for a hypothetical language.');
  assert.equal(view.partOfSpeech, 'noun');
  assert.equal(view.showTranslations, true);
  assert.equal(view.maxExamples, 2);
  assert.equal(view.speechFallbackLocale, 'el-GR');
  assert.equal(view.notFoundKey, 'notFound');
  assert.equal(registry.wordLanguage('δοκιμή'), '', 'the hypothetical language is not advertised as shipped support');
});

test('card policy projects English headwords but retains Chinese readings, examples and citations', () => {
  const english = normalizeDictionaryEntry({ ...original('A fruit.'), meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A fruit.', translation: '水果', usage: '可数', examples: [{ text: 'An original English example.', translation: '原创中译。', reference: 'Original English source.' }] }] }] }, registry.lookupContext('apple', { uiLanguage: 'en-US' }));
  const englishView = createCardView(english, 'en-US');
  assert.equal(englishView.showTranslations, false);
  assert.equal(englishView.showUsage, false);
  assert.equal(englishView.showReferences, true);
  assert.equal(englishView.entry.meanings[0].definitions[0].examples[0].reference, 'Original English source.');
  assert.equal('translation' in englishView.entry.meanings[0].definitions[0], false);
  const chinese = normalizeDictionaryEntry({ ...original('中文词条。'), meanings: [{ language: 'zh', definitions: [{ definition: '中文词条。', examples: [] }] }, { language: 'en', definitions: [{ definition: 'An English counterpart.', examples: [] }] }] }, registry.lookupContext('你好', { uiLanguage: 'en-US', settings: { chineseRegion: 'HK' } }));
  const chineseView = createCardView(chinese, 'en-US');
  assert.equal(chineseView.summary, 'An English counterpart.');
  assert.equal(chineseView.showTranslations, true);
  assert.equal(chineseView.showMeaningHeadings, true);
  assert.equal(chineseView.maxExamples, 2);
  assert.equal(chineseView.speechFallbackLocale, 'zh-HK');
  assert.equal(chineseView.notFoundKey, 'notFoundChinese');
});

test('one shared fetch queue limits concurrent response bodies across adapter subrequests', async () => {
  let openBodies = 0, peak = 0;
  const fetchImpl = async () => {
    openBodies++; peak = Math.max(peak, openBodies);
    return new Response(new ReadableStream({ start(controller) {
      setTimeout(() => { controller.enqueue(new TextEncoder().encode('{}')); controller.close(); openBodies--; }, 10);
    } }), { headers: { 'Content-Type': 'application/json' } });
  };
  const adapter = async (word, { fetchImpl }) => {
    await Promise.all([fetchImpl('https://example.org/one'), fetchImpl('https://example.org/two')]);
    return original(word);
  };
  const engine = createDictionaryEngine({ fetchImpl, maximumRequests: 2, adapters: { free: adapter, chinese: adapter } });
  const entries = await Promise.all(['apple', '学习', 'hello', '你好'].map(word => engine.lookup(word, { uiLanguage: 'en-US' })));
  assert.equal(peak, 2);
  assert.ok(entries.every(entry => entry.status === 'ok'));
  assert.equal(openBodies, 0);
});

test('English presentation preserves reading provenance and a dictionary missing-field notice', () => {
  const result = normalizeDictionaryEntry({
    ...original('A fruit.'), notice: 'The source does not provide an audio recording.', noticeKey: 'noticeRecordingMissing',
    pronunciations: [{ label: 'UK', phonetic: '/test/', sourceUrl: 'https://en.wiktionary.org/wiki/apple' }]
  }, registry.lookupContext('apple', { uiLanguage: 'en-US' }));
  const view = createCardView(result, 'en-US');
  assert.equal(view.entry.pronunciations[0].sourceUrl, 'https://en.wiktionary.org/wiki/apple');
  assert.equal(view.entry.notice, result.notice);
  assert.equal(view.entry.noticeKey, 'noticeRecordingMissing');
});

test('oversized response cancellation releases the shared fetch slot', async () => {
  let cancelled = false, request = 0;
  const limited = createLimitedFetch(async () => ++request === 1
    ? new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Length': '1000001' } })
    : Response.json({ ok: true }), 1);
  await assert.rejects(limited('https://example.org/oversized'), { code: 'response-too-large' });
  assert.equal(cancelled, true);
  assert.deepEqual(await (await limited('https://example.org/next')).json(), { ok: true });
  let streamedCancelled = false, streamedRequests = 0;
  const streamed = createLimitedFetch(async () => ++streamedRequests === 1
    ? new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(1_000_001)); },
      cancel() { streamedCancelled = true; }
    })) : Response.json({ ok: true }), 1);
  await assert.rejects(streamed('https://example.org/oversized-stream'), { code: 'response-too-large' });
  assert.equal(streamedCancelled, true);
  assert.deepEqual(await (await streamed('https://example.org/after-stream')).json(), { ok: true });
});

test('invalid words and paused lookup do not invoke any adapter', async () => {
  let calls = 0;
  const engine = createDictionaryEngine({ adapters: { free: async () => { calls++; return original('A definition.'); } } });
  assert.equal((await engine.lookup('https://example.org/', { uiLanguage: 'en-US' })).error.code, 'invalid-word');
  assert.equal((await engine.lookup('apple', { uiLanguage: 'en-US', settings: { enabled: false } })).error.code, 'disabled');
  assert.equal(calls, 0);
});

test('the entry boundary preserves validated non-BMP headwords without splitting Unicode characters', () => {
  const word = '\u{1DF00}'.repeat(40); // Latin Extended-G; this tests bounds, not dictionary coverage.
  const context = registry.lookupContext(word, { settings: { targetLanguage: 'fr' } });
  assert.ok(context);
  const entry = normalizeDictionaryEntry({ word, displayWord: word, queryWord: word, queryWords: [word], status: 'not-found' }, context);
  assert.equal(entry.word, word);
  assert.equal(entry.displayWord, word);
  assert.equal(entry.lemma, word);
  assert.equal(entry.queryWord, word);
  assert.deepEqual(entry.queryWords, [word]);
  assert.equal(entry.word.isWellFormed(), true);
});

test('same-source concurrent lookups share one request and successful repeats use independent memory snapshots', async () => {
  let calls = 0, complete;
  const adapter = async () => {
    calls++;
    await new Promise(resolve => { complete = resolve; });
    return original('An original cached definition.');
  };
  const engine = createDictionaryEngine({ adapters: { free: adapter } });
  const lookups = Array.from({ length: 8 }, () => engine.lookup('APPLE', { uiLanguage: 'en-US' }));
  assert.equal(calls, 1, 'eight simultaneous selections need one adapter operation');
  complete();
  const results = await Promise.all(lookups);
  results[0].meanings[0].definitions[0].definition = 'A caller changed its own entry.';
  assert.equal(results[1].meanings[0].definitions[0].definition, 'An original cached definition.');
  const repeated = await engine.lookup('apple', { uiLanguage: 'en-US' });
  assert.equal(repeated.meanings[0].definitions[0].definition, 'An original cached definition.');
  assert.equal(calls, 1, 'a warm selection does not issue another adapter operation');
  assert.equal((await engine.lookup('apple', { uiLanguage: 'en-US', settings: { enabled: false } })).error.code, 'disabled');
});

test('cache identity follows effective language, source, UI and region rather than navigation preferences', async () => {
  const seen = [];
  const adapter = async (word, context) => {
    seen.push([word, context.adapterId, context.language, context.region, context.uiLanguage]);
    return original('An original source-specific definition.');
  };
  const engine = createDictionaryEngine({ adapters: { free: adapter, demo: adapter, wiktionary: adapter, chinese: adapter, multilingual: adapter } });
  await engine.lookup('apple', { uiLanguage: 'en-US', settings: { englishProvider: 'free' } });
  await engine.lookup('apple', { uiLanguage: 'en-US', settings: { englishProvider: 'free', provider: 'wiktionary', guidanceDisabled: ['en-wiktionary'] } });
  assert.equal(seen.length, 1, 'inactive dictionary and navigation changes reuse the same body');
  await engine.lookup('apple', { uiLanguage: 'en-US', settings: { englishProvider: 'demo' } });
  await engine.lookup('apple', { uiLanguage: 'zh-CN', settings: { provider: 'wiktionary' } });
  await engine.lookup('你好', { uiLanguage: 'zh-CN', settings: { chineseRegion: 'CN' } });
  await engine.lookup('你好', { uiLanguage: 'zh-CN', settings: { chineseRegion: 'HK' } });
  await engine.lookup('Gift', { uiLanguage: 'en-US', settings: { targetLanguage: 'de' } });
  await engine.lookup('Gift', { uiLanguage: 'en-US', settings: { targetLanguage: 'fr' } });
  await engine.lookup('gift', { uiLanguage: 'en-US', settings: { targetLanguage: 'de' } });
  assert.equal(seen.length, 8, 'active source, interface, region, explicit language and foreign case stay isolated');
  assert.deepEqual(seen.slice(-3).map(value => value.slice(0, 3)), [
    ['Gift', 'multilingual', 'de'], ['Gift', 'multilingual', 'fr'], ['gift', 'multilingual', 'de']
  ]);
});

test('memory cache expires without extending freshness and evicts the least recently used entry', async () => {
  let clock = 0, calls = 0;
  const engine = createDictionaryEngine({ now: () => clock, cacheTtlMs: 60, maximumCacheEntries: 2,
    adapters: { free: async word => { calls++; return original(word); } } });
  const lookup = word => engine.lookup(word, { uiLanguage: 'en-US' });
  await lookup('apple');
  await lookup('pear');
  clock = 59;
  await lookup('apple');
  assert.equal(calls, 2);
  await lookup('peach');
  await lookup('pear');
  assert.equal(calls, 4, 'touching apple made pear the first eviction');
  clock = 60;
  await lookup('apple');
  assert.equal(calls, 5, 'cache hits do not extend the original expiration');
  const before = calls;
  const uncached = createDictionaryEngine({ maximumCacheBytes: 1, adapters: { free: async () => { calls++; return original('Larger than a one-byte cache.'); } } });
  await uncached.lookup('apple', { uiLanguage: 'en-US' });
  await uncached.lookup('apple', { uiLanguage: 'en-US' });
  assert.equal(calls, before + 2, 'an oversized entry is served without being retained');
});

test('cache byte budget evicts entries and zero limits disable completed-result reuse', async () => {
  let calls = 0;
  const adapter = async word => { calls++; return original(word); };
  const sample = await createDictionaryEngine({ adapters: { free: adapter } }).lookup('apple', { uiLanguage: 'en-US' });
  const bytes = new TextEncoder().encode(JSON.stringify(sample)).byteLength;
  const engine = createDictionaryEngine({ maximumCacheBytes: bytes + 20, adapters: { free: adapter } });
  const lookup = word => engine.lookup(word, { uiLanguage: 'en-US' });
  await lookup('apple'); await lookup('pear'); await lookup('apple');
  assert.equal(calls, 4, 'the total byte cap allows only one of these entries');
  for (const limits of [{ cacheTtlMs: 0 }, { maximumCacheEntries: 0 }, { maximumCacheBytes: 0 }]) {
    const uncached = createDictionaryEngine({ ...limits, adapters: { free: adapter } });
    const before = calls;
    await uncached.lookup('apple', { uiLanguage: 'en-US' });
    await uncached.lookup('apple', { uiLanguage: 'en-US' });
    assert.equal(calls, before + 2);
  }
});

test('errors, absent words, transient fallback and adapter-marked partial results retry on the next lookup', async () => {
  const cases = [
    { status: 'error', error: { code: 'timeout', message: 'Original fixture timeout.' } },
    { status: 'not-found' },
    { status: 'ok', meanings: [] },
    { ...original('An English fallback.'), noticeKey: 'noticeWiktDown' },
    { ...original('A partial Chinese result.'), cacheable: false }
  ];
  for (const raw of cases) {
    let calls = 0;
    const engine = createDictionaryEngine({ adapters: { free: async () => { calls++; return raw; } } });
    await engine.lookup('apple', { uiLanguage: 'en-US' });
    await engine.lookup('apple', { uiLanguage: 'en-US' });
    assert.equal(calls, 2);
  }
  let calls = 0;
  const withMissingField = createDictionaryEngine({ adapters: { free: async () => {
    calls++; return { ...original('A valid entry without a recording.'), noticeKey: 'noticeRecordingMissing', notice: 'The dictionary has no recording.' };
  } } });
  await withMissingField.lookup('apple', { uiLanguage: 'en-US' });
  await withMissingField.lookup('apple', { uiLanguage: 'en-US' });
  assert.equal(calls, 1, 'a source with genuinely missing examples/readings is still a valid cached entry');
});

test('official bridges and unrecognized future adapters are neither cached nor coalesced', async () => {
  for (const provider of ['oxford', 'cambridge']) {
    let calls = 0;
    const engine = createDictionaryEngine({ adapters: { [provider]: async () => { calls++; await Promise.resolve(); return original('An official response.'); } } });
    const settings = { englishProvider: provider, bridgeToken: 'first-private-token' };
    await Promise.all(Array.from({ length: 4 }, () => engine.lookup('apple', { uiLanguage: 'en-US', settings })));
    await engine.lookup('apple', { uiLanguage: 'en-US', settings: { ...settings, bridgeToken: 'second-private-token' } });
    assert.equal(calls, 5);
  }
  const extended = createLanguageRegistry([...DEFAULT_PROFILES, { id: 'zz', language: 'zz', matches: value => value === 'δοκιμή', normalize: value => value, adapter: 'future', segment: 'whole' }]);
  let calls = 0;
  const engine = createDictionaryEngine({ registry: extended, adapters: { future: async () => { calls++; return original('A future source.'); } } });
  await Promise.all([engine.lookup('δοκιμή'), engine.lookup('δοκιμή')]);
  await engine.lookup('δοκιμή');
  assert.equal(calls, 3, 'a new source needs an explicit cache/licensing decision');
});

test('aborting a queued fetch rejects immediately without waiting for a slow body or consuming a later slot', async () => {
  let release, calls = 0;
  const limited = createLimitedFetch(async () => {
    calls++;
    if (calls === 1) await new Promise(resolve => { release = resolve; });
    return Response.json({ ok: true });
  }, 1);
  const first = limited('https://example.org/slow');
  const queued = new AbortController();
  const second = limited('https://example.org/cancelled', { signal: queued.signal });
  const rejected = assert.rejects(second, { name: 'AbortError' });
  queued.abort();
  await rejected;
  assert.equal(calls, 1, 'queued cancellation must finish while the active request is still pending');
  const third = limited('https://example.org/next');
  release();
  await Promise.all([first, third]);
  assert.equal(calls, 2, 'the cancelled entry must never reach fetch');
  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  await assert.rejects(limited(new Request('https://example.org/request', { signal: alreadyAborted.signal })), { name: 'AbortError' });
  await assert.rejects(limited(new Request('https://example.org/request', { signal: alreadyAborted.signal }), { signal: undefined }), { name: 'AbortError' });
  assert.equal(calls, 2);
  await limited(new Request('https://example.org/request', { signal: alreadyAborted.signal }), { signal: null });
  assert.equal(calls, 3, 'an explicit null signal overrides the Request signal, matching fetch');
});
