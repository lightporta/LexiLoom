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
