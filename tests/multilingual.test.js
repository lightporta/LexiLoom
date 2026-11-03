import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupMultilingual, normalizeMultilingual, validMultilingualWord } from '../extension/shared/multilingual.js';

const payload = (word, language, entry = {}) => ({ word, edition: 'zh', entries: [{
  word, lang_code: language, pos: 'noun', senses: [{ glosses: ['原創測試：這是一個詞義。'] }], sounds: [], ...entry
}] });
const examplesOf = value => value.meanings.flatMap(meaning => meaning.definitions.flatMap(definition => definition.examples));

test('five explicit word languages validate their own script while preserving case and diacritics', () => {
  for (const [language, word] of [['ja', '學校'], ['ja', 'こんにちは'], ['ja', 'サッカー'], ['ko', '안녕'], ['fr', "l'été"], ['de', 'Ärger'], ['es', 'niño']]) {
    assert.equal(validMultilingualWord(word, language), true);
    const normalized = normalizeMultilingual(word, payload(word, language), { language });
    assert.equal(normalized.word, word);
    assert.equal(normalized.displayWord, word);
    assert.equal(normalized.language, language);
  }
  for (const [language, word] of [['fr', 'https://example.org'], ['ja', 'bonjour'], ['ja', 'ー'], ['ja', '学'.repeat(33)], ['ko', '학'.repeat(33)], ['ko', '學校'], ['ko', 'hello'], ['de', 'two words'], ['es', 'n'.repeat(49)], ['fr', 'a\ud800b'], ['fr', '\u0301'], ['fr', "a-'b"], ['de', 'a-\u0301'], ['xx', 'word']]) {
    assert.equal(validMultilingualWord(word, language), false);
  }
});

test('Chinese glosses and translations become Simplified Chinese while Japanese spelling and examples stay intact', () => {
  const word = '學校';
  const data = payload(word, 'ja', { sounds: [{ ipa: '[ɡakkoː]' }], senses: [{
    glosses: ['學校：傳授知識的機構。'], raw_tags: ['書面語'],
    examples: [{ text: '學校で勉強します。', translation: '在學校裡學習。', roman: 'gakkō de benkyō shimasu.', ref: 'Original fixture' }]
  }] });
  const result = normalizeMultilingual(word, data, { language: 'ja' });
  assert.equal(result.status, 'ok');
  assert.equal(result.displayWord, word);
  assert.equal(result.meanings[0].language, 'zh');
  assert.equal(result.meanings[0].definitions[0].definition, '学校：传授知识的机构。');
  assert.equal(result.meanings[0].definitions[0].usage, '书面语');
  assert.deepEqual(examplesOf(result), [{ text: '學校で勉強します。', translation: '在学校里学习。', roman: 'gakkō de benkyō shimasu.', reference: 'Original fixture' }]);
  assert.equal(result.pronunciations[0].locale, 'ja-JP');
  assert.equal(result.source.license.name, 'CC BY-SA 4.0');
});

test('compact records rely on the mandatory endpoint language filter but explicit mismatches cannot leak', () => {
  const word = 'Haus';
  const compact = { senses: [{ glosses: ['房子'] }], sounds: [{ ipa: '/haʊ̯s/' }] };
  const data = { word, edition: 'zh', entries: [
    { ...compact, word: 'wrong', sounds: [{ ipa: '/wrong-word/' }] },
    { ...compact, lang_code: 'fr', sounds: [{ ipa: '/wrong-language/' }] }, compact
  ] };
  const result = normalizeMultilingual(word, data, { language: 'de' });
  assert.equal(result.status, 'ok');
  assert.equal(result.meanings.length, 1);
  assert.deepEqual(result.pronunciations.map(item => item.phonetic), ['/haʊ̯s/']);
  assert.equal(result.pronunciations[0].locale, 'de-DE');
  assert.match(result.source.url, /\/Haus$/);
  assert.equal(normalizeMultilingual(word, { ...data, entries: data.entries.slice(0, 2) }, { language: 'de' }).error.code, 'unsupported-format');
});

test('wrong word, edition and malformed schema remain errors instead of becoming a missing translation', () => {
  for (const data of [null, [], { word: 'maison', edition: 'en', entries: [] }, { word: 'wrong', edition: 'zh', entries: [] }, { word: 'maison', edition: 'zh', entries: 'broken' }, { word: 'maison', edition: 'zh', entries: [{ sounds: [] }] }]) {
    const result = normalizeMultilingual('maison', data, { language: 'fr' });
    assert.equal(result.status, 'error');
    assert.equal(result.error.code, 'unsupported-format');
  }
});

test('a valid response without Chinese glosses reports translation-unavailable rather than false not-found', () => {
  for (const senses of [[{ tags: ['no-gloss'] }], [{ glosses: ['An English-only definition.'] }], []]) {
    const result = normalizeMultilingual('こんにちは', payload('こんにちは', 'ja', { senses }), { language: 'ja' });
    assert.equal(result.status, 'error');
    assert.equal(result.error.code, 'translation-unavailable');
    assert.equal(result.source.id, 'wiktionary-multilingual');
  }
});

test('examples are source-language text, deduplicated, limited to two, and never reversed from citations', () => {
  const data = payload('Haus', 'de', { senses: [{ glosses: ['房子'], examples: [
    { text: '這是一棟房子。', ref: 'Das ist ein Haus.' },
    { text: 'Das Haus ist groß.', translation: '這棟房子很大。' },
    { text: 'Das Haus ist groß.', translation: '同一句重複。' },
    { text: 'Ein Haus steht hier.', translation: '这里有一栋房子。', ref: 'Original fixture' },
    { text: 'Noch ein Beispiel.', translation: '第三句不應超過上限。' }
  ] }] });
  const result = normalizeMultilingual('Haus', data, { language: 'de' });
  assert.deepEqual(examplesOf(result).map(example => example.text), ['Das Haus ist groß.', 'Ein Haus steht hier.']);
  assert.equal(examplesOf(result)[0].translation, '这栋房子很大。');
  assert.equal('reference' in examplesOf(result)[0], false, 'a missing citation is not replaced with the source URL');
  assert.equal(examplesOf(result)[1].reference, 'Original fixture');
});

test('a Japanese entry cannot label Chinese-only text as a Japanese example', () => {
  const data = payload('学校', 'ja', { senses: [{ glosses: ['學校'], examples: [
    { text: '這是學校。', ref: 'これは学校です。' },
    { text: '天地玄黃。', lang_code: 'ja' },
    { text: '学校へ行きます。', translation: '去學校。' }
  ] }] });
  const result = normalizeMultilingual('学校', data, { language: 'ja' });
  assert.deepEqual(examplesOf(result).map(example => example.text), ['学校へ行きます。']);
  assert.equal(examplesOf(result)[0].translation, '去学校。');
});

test('Korean hangul readings and Japanese native/roman readings retain their explicit speech locale', () => {
  const korean = normalizeMultilingual('학교', payload('학교', 'ko', { sounds: [{ hangeul: '학꾜' }, { roman: 'hakgyo' }, { ipa: '/wrong/', lang_code: 'fr' }] }), { language: 'ko' });
  assert.deepEqual(korean.pronunciations.map(sound => sound.phonetic), ['학꾜', 'hakgyo']);
  assert.ok(korean.pronunciations.every(sound => sound.locale === 'ko-KR'));
  const japanese = normalizeMultilingual('学校', payload('学校', 'ja', { sounds: [{ other: 'がっこー', roman: '[gàkkóó]' }, { ipa: '[ɡa̠k̚ko̞ː]' }] }), { language: 'ja' });
  assert.equal(japanese.pronunciations[0].phonetic, 'がっこー · [gàkkóó]');
  assert.equal(japanese.phonetic, '[ɡa̠k̚ko̞ː]');
});

test('pronunciation labels follow the interface language without adding catalog keys', async () => {
  const german = payload('Haus', 'de', { sounds: [{ ipa: '/haʊ̯s/' }, { roman: 'Haus' }] });
  assert.deepEqual(normalizeMultilingual('Haus', german, { language: 'de' }).pronunciations.map(sound => sound.label),
    ['德语 · IPA', '德语 · 罗马字']);
  const english = normalizeMultilingual('Haus', german, { language: 'de', uiLanguage: 'en-US' });
  assert.deepEqual(english.pronunciations.map(sound => sound.label), ['German · IPA', 'German · romanization']);
  assert.ok(english.pronunciations.every(sound => !/[\u4e00-\u9fff]/u.test(sound.label)), 'an English interface must not show Chinese-only labels');
  const korean = normalizeMultilingual('학교', payload('학교', 'ko', { sounds: [{ hangeul: '학꾜' }, { roman: 'hakgyo' }] }), { language: 'ko', uiLanguage: 'en' });
  assert.deepEqual(korean.pronunciations.map(sound => sound.label), ['Korean · hangul', 'Korean · romanization']);
  const japanese = normalizeMultilingual('学校', payload('学校', 'ja', { sounds: [{ other: 'がっこー' }, { ipa: '[ɡa̠k̚ko̞ː]' }] }), { language: 'ja', uiLanguage: 'en-US' });
  assert.deepEqual(japanese.pronunciations.map(sound => sound.label), ['Japanese · kana', 'Japanese · IPA']);
  for (const [uiLanguage, name] of [['zh-TW', '日语'], ['zh-CN', '日语']]) {
    const label = normalizeMultilingual('学校', payload('学校', 'ja', { sounds: [{ ipa: '[ɡa̠k̚ko̞ː]' }] }), { language: 'ja', uiLanguage }).pronunciations[0].label;
    assert.equal(label, `${name} · IPA`);
  }
  const french = normalizeMultilingual('bonjour', payload('bonjour', 'fr', { sounds: [{ ipa: '/bɔ̃ʒuʁ/' }] }), { language: 'fr', uiLanguage: 'fr-FR' });
  assert.equal(french.pronunciations[0].label, '法语 · IPA');
  const calls = [];
  const looked = await lookupMultilingual('Haus', { language: 'de', uiLanguage: 'en-US', fetchImpl: async url => {
    calls.push(String(url)); return Response.json(payload('Haus', 'de', { sounds: [{ ipa: '/haʊ̯s/' }] }));
  } });
  assert.equal(calls.length, 1);
  assert.equal(looked.pronunciations[0].label, 'German · IPA');
});

test('audio requires HTTPS and attribution, with separate license metadata retained', () => {
  const data = payload('bonjour', 'fr', { sounds: [
    { ipa: '/bɔ̃ʒuʁ/', audio: 'Fr-bonjour.ogg', mp3_url: 'https://media.example/bonjour.mp3', license: { name: 'Audio license', url: 'https://example.org/audio-license' } },
    { ipa: '/unsafe/', audio: 'bad.ogg', mp3_url: 'http://media.example/unsafe.mp3' },
    { ipa: '/unattributed/', mp3_url: 'https://media.example/no-source.mp3' },
    { ipa: '/bad-file/', audio: '../private.ogg', mp3_url: 'https://media.example/no-source.mp3' }
  ] });
  const result = normalizeMultilingual('bonjour', data, { language: 'fr' });
  assert.equal(result.pronunciations[0].audio, 'https://media.example/bonjour.mp3');
  assert.match(result.pronunciations[0].attributionUrl, /commons.wikimedia.org\/wiki\/File:Fr-bonjour.ogg$/);
  assert.deepEqual(result.pronunciations[0].license, { name: 'Audio license', url: 'https://example.org/audio-license' });
  assert.ok(result.pronunciations.slice(1).every(sound => !sound.audio && !sound.license));
  assert.ok(result.pronunciations.every(sound => sound.sourceUrl === result.source.url));
});

test('missing readings are disclosed without inventing pronunciation or example sentences', () => {
  const result = normalizeMultilingual('hola', payload('hola', 'es'), { language: 'es' });
  assert.equal(result.noticeKey, 'noticeMultilingualReadingMissing');
  assert.deepEqual(result.pronunciations, []);
  assert.deepEqual(examplesOf(result), []);
});

test('lookup encodes the original headword, requests Chinese edition and exact word language without credentials', async () => {
  for (const [language, word] of [['ja', '学校'], ['ko', '안녕'], ['fr', 'bonjour'], ['de', 'Ärger'], ['es', 'niño']]) {
    const calls = [];
    const result = await lookupMultilingual(word, { language, fetchImpl: async (url, init) => {
      calls.push({ url, init }); return Response.json(payload(word, language));
    } });
    assert.equal(result.status, 'ok');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://api.wiktapi.dev/v1/zh/word/${encodeURIComponent(word)}?lang=${language}`);
    assert.equal(calls[0].init.credentials, 'omit');
    assert.equal(calls[0].init.redirect, 'error');
    assert.ok(calls[0].init.signal instanceof AbortSignal);
  }
});

test('only a documented 404 is not-found; rate limits, bad schema, timeout and unknown 404 remain errors', async () => {
  const response = (body, status = 200) => () => Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
  const cases = [
    [response({ error: true, status: 404, message: 'No entries found for "bonjour"' }, 404), 'not-found', undefined],
    [response({ error: true, status: 404, message: 'No entries found for bonjour' }, 404), 'not-found', undefined],
    [response({ error: true, status: 404, message: 'No entries found for "different-word"' }, 404), 'error', 'upstream'],
    [response({}, 404), 'error', 'upstream'],
    [response('<html>Not found</html>', 404), 'error', 'upstream'],
    [response({}, 403), 'error', 'authentication'],
    [response({}, 429), 'error', 'rate-limit'],
    [response({}, 503), 'error', 'upstream'],
    [response({ word: 'wrong', edition: 'zh', entries: [] }), 'error', 'unsupported-format'],
    [async () => { throw new DOMException('Timed out', 'TimeoutError'); }, 'error', 'timeout'],
    [async () => { throw new Error('Network offline'); }, 'error', 'network']
  ];
  for (const [fetchImpl, status, code] of cases) {
    const result = await lookupMultilingual('bonjour', { language: 'fr', fetchImpl });
    assert.equal(result.status, status);
    assert.equal(result.error?.code, code);
  }
});

test('invalid words and target languages cannot initiate a network request', async () => {
  let calls = 0;
  for (const [language, word] of [['xx', 'hello'], ['constructor', 'hello'], ['__proto__', 'hello'], ['toString', 'hello'], [null, 'hello'], [{ toString: () => 'fr' }, 'hello'], ['fr', 'https://example.org'], ['ko', 'hello'], ['ja', 'a'.repeat(500)]]) {
    assert.equal(validMultilingualWord(word, language), false);
    const result = await lookupMultilingual(word, { language, fetchImpl: async () => { calls++; throw new Error('Must not fetch'); } });
    assert.equal(result.status, 'error'); assert.equal(result.error.code, 'invalid-word');
  }
  assert.equal(calls, 0);
});

test('a missing-word response with contradictory request metadata cannot confirm absence', async () => {
  const word = 'Ärger';
  const absent = { error: true, status: 404, message: 'No entries found for "Ärger"',
    url: 'https://api.wiktapi.dev/v1/zh/word/%C3%84rger?lang=de', word, edition: 'zh' };
  const invalid = [
    { url: 'https://api.wiktapi.dev/v1/zh/word/%C3%84rger?lang=fr' },
    { url: 'https://api.wiktapi.dev/v1/en/word/%C3%84rger?lang=de' },
    { url: 'https://api.wiktapi.dev/v1/zh/word/Haus?lang=de' },
    { url: 'http://api.wiktapi.dev/v1/zh/word/%C3%84rger?lang=de' },
    { url: 'https://wrong.example/v1/zh/word/%C3%84rger?lang=de' },
    { url: 'https://user:pass@api.wiktapi.dev/v1/zh/word/%C3%84rger?lang=de' },
    { url: 'https://api.wiktapi.dev/v1/zh/word/%C3%84rger?lang=de&lang=fr' },
    { url: 'https://api.wiktapi.dev/v1/zh/word/%ED%A0%80?lang=de' },
    { url: 'broken' }, { url: null }, { word: 'Haus' }, { edition: 'en' }
  ];
  const query = body => lookupMultilingual(word, { language: 'de', fetchImpl: async () => Response.json(body, { status: 404 }) });
  assert.equal((await query(absent)).status, 'not-found');
  for (const metadata of invalid) {
    const result = await query({ ...absent, ...metadata });
    assert.equal(result.status, 'error');
    assert.equal(result.error.code, 'upstream');
  }
});

test('HTTP 200 invalid JSON and oversized response bodies are format errors, not network failures', async () => {
  const fetchers = [
    async () => new Response('<html>gateway</html>', { status: 200 }),
    async () => new Response('{', { status: 200 }),
    async () => new Response('{}', { status: 200, headers: { 'content-length': '1000001' } }),
    async () => new Response('x'.repeat(1_000_001), { status: 200 }),
    async () => { throw Object.assign(new Error('Response too large'), { code: 'response-too-large' }); }
  ];
  for (const fetchImpl of fetchers) {
    const result = await lookupMultilingual('bonjour', { language: 'fr', fetchImpl });
    assert.equal(result.status, 'error');
    assert.equal(result.error.code, 'unsupported-format');
  }
});

test('French and Spanish retry lowercase only after confirmed exact-word absence and retain the actual source headword', async () => {
  for (const [language, word, queryWord] of [['fr', 'Bonjour', 'bonjour'], ['es', 'Niño', 'niño']]) {
    const calls = [];
    const result = await lookupMultilingual(word, { language, fetchImpl: async url => {
      const query = decodeURIComponent(new URL(url).pathname.split('/').at(-1)); calls.push(query);
      return query === word ? Response.json({ error: true, status: 404, message: `No entries found for ${JSON.stringify(word)}`, url }, { status: 404 })
        : Response.json(payload(query, language));
    } });
    assert.deepEqual(calls, [word, queryWord]);
    assert.equal(result.status, 'ok'); assert.equal(result.word, word); assert.equal(result.displayWord, word);
    assert.equal(result.queryWord, queryWord); assert.equal(result.lemma, queryWord);
    assert.equal(result.source.url, `https://zh.wiktionary.org/wiki/${encodeURIComponent(queryWord)}`);
    assert.ok(result.pronunciations.every(sound => sound.sourceUrl === result.source.url));
  }
});

test('a capitalization fallback never replaces an exact match or rewrites German nouns', async () => {
  for (const [language, word, success] of [['fr', 'Bonjour', true], ['es', 'Niño', true], ['de', 'Haus', false], ['de', 'Ärger', false]]) {
    let requests = 0;
    const result = await lookupMultilingual(word, { language, fetchImpl: async () => {
      requests++;
      return success ? Response.json(payload(word, language))
        : Response.json({ error: true, status: 404, message: `No entries found for ${JSON.stringify(word)}` }, { status: 404 });
    } });
    assert.equal(requests, 1); assert.equal(result.status, success ? 'ok' : 'not-found');
    assert.equal(result.word, word); assert.equal(result.queryWord, undefined);
  }
});

test('French source failures and unconfirmed absence never trigger a lowercase lookup', async () => {
  for (const body of [
    () => new Response('{}', { status: 404 }),
    () => Response.json({ error: true, status: 404, message: 'No entries found for "other"' }, { status: 404 }),
    () => new Response('', { status: 429 }), () => new Response('<html>gateway</html>'),
    () => { throw new DOMException('Timed out', 'TimeoutError'); }
  ]) {
    let requests = 0;
    const result = await lookupMultilingual('Bonjour', { language: 'fr', fetchImpl: async () => { requests++; return body(); } });
    assert.equal(requests, 1); assert.equal(result.status, 'error');
  }
  let requests = 0;
  const lowerFailure = await lookupMultilingual('Bonjour', { language: 'fr', fetchImpl: async () => {
    requests++;
    return requests === 1 ? Response.json({ error: true, status: 404, message: 'No entries found for "Bonjour"' }, { status: 404 })
      : new Response('', { status: 503 });
  } });
  assert.equal(lowerFailure.word, 'Bonjour'); assert.equal(lowerFailure.queryWord, 'bonjour');
  assert.equal(lowerFailure.status, 'error'); assert.equal(lowerFailure.error.code, 'upstream');
});
