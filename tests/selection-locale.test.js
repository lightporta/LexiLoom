import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/shared/languages.js';
import '../extension/shared/locale.js';
import '../extension/shared/core.js';
import '../extension/shared/present.js';
const { profile } = globalThis.LexiLoomLocale;
const { parseSelection, normalizeWord, wordLanguage, publicSettings } = globalThis.LexiLoomCore;

test('UI language resolves Mainland, Hong Kong and Taiwan independently of script shorthand', () => {
  for (const language of ['zh-CN', 'zh_Hans_CN', 'zh-Hans', 'zh-SG']) assert.equal(profile(language).region, 'CN');
  for (const language of ['zh-HK', 'zh_Hant_HK', 'yue-Hant-HK', 'zh-MO']) assert.equal(profile(language).region, 'HK');
  for (const language of ['zh-TW', 'zh_Hant_TW', 'zh-Hant']) assert.equal(profile(language).region, 'TW');
  assert.equal(profile('zh-HK').catalog, 'zh_TW');
  assert.equal(profile('zh-TW').catalog, 'zh_TW');
  assert.equal(profile('en-US').catalog, 'en');
  assert.equal(profile('en-US', 'TW').region, 'TW');
  assert.equal(profile('zh-TW', 'HK').region, 'HK');
  assert.equal(profile('zh-TW', 'https://evil.example').region, 'TW');
});
test('Chinese words and characters normalize without changing their script', () => {
  for (const word of ['学', '學', '学习', '學習', '你好', '𠮷']) {
    assert.equal(normalizeWord(word), word);
    assert.equal(wordLanguage(word), 'zh');
  }
  assert.equal(wordLanguage('Apple'), 'en');
  assert.equal(normalizeWord('学'.repeat(32)), '学'.repeat(32));
  assert.equal(normalizeWord('学'.repeat(33)), '');
  assert.equal(normalizeWord('𠮷'.repeat(32)), '𠮷'.repeat(32));
  for (const word of ['hello world', '学习/../../', 'test<script>', '學習123', '<学习>', 'a'.repeat(49)]) assert.equal(normalizeWord(word), '');
});
test('selection segments Chinese words, preserves English contractions and deduplicates mixed selections', () => {
  assert.deepEqual(parseSelection('你好，学习！學習 hello HELLO don’t', 'zh-CN').words, ['你好', '学习', '學習', 'hello', "don't"]);
  assert.deepEqual(parseSelection('学习hello学习', 'zh-TW').words, ['学习', 'hello']);
  const sentence = parseSelection('我喜欢学习中文。', 'zh-CN');
  assert.ok(sentence.words.includes('学习'));
  assert.ok(sentence.words.includes('中文'));
  assert.ok(!sentence.words.some(value => value.includes('。')));
  assert.equal(parseSelection('学 一 二 三 四 五 六 七 八 九', 'zh-CN').words.length, 8);
  assert.equal(parseSelection('学 一 二 三 四 五 六 七 八 九', 'zh-CN').truncated, true);
  assert.ok(parseSelection('我喜欢学习中文'.repeat(20), 'zh-CN').words.includes('学习'));
});
test('public settings expose only a validated Chinese region', () => {
  assert.equal(publicSettings({ chineseRegion: 'HK', bridgeToken: 'private' }).chineseRegion, 'HK');
  assert.equal(publicSettings({ chineseRegion: 'bad' }).chineseRegion, 'auto');
  assert.equal('bridgeToken' in publicSettings({ chineseRegion: 'HK', bridgeToken: 'private' }), false);
});
test('English UI keeps the Chinese headword, reading and bilingual example for a Chinese lookup', () => {
  const result = { word: '學習', language: 'zh', region: 'TW', status: 'ok', phonetic: 'ㄒㄩㄝˊ ㄒㄧˊ', meanings: [
    { language: 'zh', definitions: [{ definition: '原创中文测试。', examples: [{ text: '这是原创例句。', translation: 'This is an original example.' }] }] },
    { language: 'en', definitions: [{ definition: 'To learn.', examples: [] }] }
  ] };
  assert.equal(globalThis.LexiLoomPresent.presentEntry(result, 'en-US'), result);
});

test('an explicit language resolves Latin and Han ambiguities without changing automatic selection', () => {
  const registry = globalThis.LexiLoomLanguages.registry;
  assert.equal(wordLanguage('Gift'), 'en');
  assert.equal(normalizeWord('Gift'), 'gift');
  for (const target of ['fr', 'de', 'es']) {
    assert.equal(wordLanguage('Gift', target), target);
    assert.equal(normalizeWord('Gift', target), 'Gift');
    assert.equal(registry.wordProfile('Gift', { targetLanguage: target }).id, target);
  }
  assert.equal(wordLanguage('学校'), 'zh');
  assert.equal(wordLanguage('学校', 'ja'), 'ja');
  assert.equal(normalizeWord('こんにちは'), '');
  assert.equal(normalizeWord('안녕'), '');
  assert.equal(normalizeWord('école'), '');
  assert.deepEqual(parseSelection('学校 hello', 'zh-CN').words, ['学校', 'hello']);
  assert.deepEqual(parseSelection('Gift 학교', 'zh-CN', 'de').words, ['Gift']);
  assert.deepEqual(parseSelection('Gift 学校', 'en-US', 'ja').words, ['学校']);
  assert.deepEqual(parseSelection('Gift', 'zh-CN', 'pt').words, []);
});

test('foreign selections preserve accents, German case and word punctuation', () => {
  assert.deepEqual(parseSelection('ÉCOLE déjà l’été porte-monnaie', 'zh-CN', 'fr').words,
    ['ÉCOLE', 'déjà', "l'été", 'porte-monnaie']);
  assert.deepEqual(parseSelection('Haus Häuser Straße Ärger', 'zh-CN', 'de').words,
    ['Haus', 'Häuser', 'Straße', 'Ärger']);
  assert.deepEqual(parseSelection('niño corazón pingüino', 'zh-CN', 'es').words, ['niño', 'corazón', 'pingüino']);
  assert.equal(normalizeWord('e\u0301cole', 'fr'), 'école');
  assert.equal(normalizeWord('Ｈａｕｓ', 'de'), 'Haus');
  for (const target of ['fr', 'de', 'es']) {
    for (const value of ['abc123', 'user@example.com', 'https://example.com', 'alpha_beta', 'abc/def', 'δοκιμή', '학교']) {
      assert.deepEqual(parseSelection(value, 'zh-CN', target).words, [], `${target}: ${value}`);
    }
    assert.equal(normalizeWord('a'.repeat(48), target), 'a'.repeat(48));
    assert.equal(normalizeWord('a'.repeat(49), target), '');
  }
});

test('Japanese and Korean use their own segmentation locale and Unicode word limits', () => {
  assert.deepEqual(parseSelection('学校，こんにちは。', 'en-US', 'ja').words, ['学校', 'こんにちは']);
  const japaneseSentence = parseSelection('学校で日本語を学ぶ。', 'zh-CN', 'ja');
  assert.ok(japaneseSentence.words.includes('学校'));
  assert.ok(japaneseSentence.words.includes('日本語'));
  assert.deepEqual(parseSelection('안녕 학교', 'zh-TW', 'ko').words, ['안녕', '학교']);
  for (const value of ['学校123', '学校hello', 'https://example.com', 'user@example.com', 'ー']) {
    assert.deepEqual(parseSelection(value, 'zh-CN', 'ja').words, [], value);
  }
  assert.equal(normalizeWord('𠮷'.repeat(32), 'ja'), '𠮷'.repeat(32));
  assert.equal(normalizeWord('𠮷'.repeat(33), 'ja'), '');
  assert.equal(normalizeWord('학'.repeat(32), 'ko'), '학'.repeat(32));
  assert.equal(normalizeWord('학'.repeat(33), 'ko'), '');
  assert.deepEqual(parseSelection('하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉', 'en-US', 'ko').words.length, 8);
  assert.equal(parseSelection('하나 둘 셋 넷 다섯 여섯 일곱 여덟 아홉', 'en-US', 'ko').truncated, true);
});
