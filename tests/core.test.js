import test from 'node:test';
import assert from 'node:assert/strict';
import '../extension/shared/languages.js';
import '../extension/shared/core.js';
import '../extension/shared/demo-data.js';
const { parseSelection, normalizeWord, publicSettings, safeHttps } = globalThis.LexiLoomCore;
test('selection normalizes apostrophes, deduplicates and preserves hyphenated words', () => {
  assert.deepEqual(parseSelection('Hello, HELLO! mother-in-law isn’t.').words, ['hello', 'mother-in-law', "isn't"]);
});
test('ignores unsupported full tokens and rejects large selections', () => {
  assert.deepEqual(parseSelection('abc123 user@example.com https://example.com').words, []);
  assert.equal(parseSelection('a'.repeat(1001)).reason, 'too-long');
  assert.equal(normalizeWord('<script>'), '');
  assert.equal(normalizeWord('a'.repeat(49)), '');
});
test('limits chains to 8 different words and reports truncation', () => {
  const parsed = parseSelection('one two three four five six seven eight nine one');
  assert.equal(parsed.words.length, 8); assert.equal(parsed.truncated, true);
});
test('public settings never disclose the local bridge token', () => {
  assert.deepEqual(publicSettings({ enabled: false, provider: 'oxford', bridgeToken: 'secret' }), { enabled: false, provider: 'oxford', englishProvider: 'free', chineseRegion: 'auto', targetLanguage: 'auto' });
  assert.equal(publicSettings({ provider: 'https://evil.example' }).provider, 'smart');
  assert.equal(publicSettings({ englishProvider: 'demo' }).englishProvider, 'demo');
  assert.equal(publicSettings({ englishProvider: 'https://evil.example' }).englishProvider, 'free');
});
test('target-language settings default to the legacy automatic mode and expose only supported choices', () => {
  assert.equal(globalThis.LexiLoomCore.DEFAULT_SETTINGS.targetLanguage, 'auto');
  for (const targetLanguage of ['auto', 'ja', 'ko', 'fr', 'de', 'es']) {
    assert.equal(publicSettings({ targetLanguage, bridgeToken: 'secret' }).targetLanguage, targetLanguage);
  }
  for (const targetLanguage of [undefined, null, 'en', 'pt', 'fr-FR', 'https://example.org/']) {
    assert.equal(publicSettings({ targetLanguage }).targetLanguage, 'auto');
  }
});
test('accepts only HTTPS links without credentials', () => {
  assert.equal(safeHttps('javascript:alert(1)'), '');
  assert.equal(safeHttps('https://name:password@example.com'), '');
  assert.equal(safeHttps('https://dictionary.cambridge.org/'), 'https://dictionary.cambridge.org/');
});
test('demo entries are bilingual and missing demo entries are not false not-found results', () => {
  assert.equal(globalThis.LexiLoomDemo.lookup('serendipity').status, 'ok');
  assert.ok(globalThis.LexiLoomDemo.lookup('serendipity').meanings[0].definitions[0].translation);
  assert.equal(globalThis.LexiLoomDemo.lookup('unlisted').error.code, 'demo-miss');
});
