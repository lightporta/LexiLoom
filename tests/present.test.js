import test from 'node:test';
import assert from 'node:assert/strict';
await import('../extension/shared/languages.js');
await import('../extension/shared/present.js');
await import('../extension/shared/demo-data.js');
const { presentEntry, resolveLookupProvider, hasCjk } = globalThis.LexiLoomPresent;

test('english presentation keeps pronunciation, the english definition, and example sentences', () => {
  const view = presentEntry(globalThis.LexiLoomDemo.lookup('apple'), 'en-US');
  const definition = view.meanings[0].definitions[0];
  assert.equal(view.phonetic, 'ˈæp.əl');
  assert.match(definition.definition, /round fruit/);
  assert.match(definition.examples[0].text, /packed an apple/);
  assert.equal('translation' in definition, false);
  assert.equal('usage' in definition, false);
  assert.equal('translation' in definition.examples[0], false);
  assert.equal(hasCjk(JSON.stringify({ phonetic: view.phonetic, meanings: view.meanings })), false);
});

test('chinese presentation keeps the original bilingual entry', () => {
  const original = globalThis.LexiLoomDemo.lookup('apple');
  const view = presentEntry(original, 'zh-CN');
  assert.equal(view, original);
  assert.match(view.meanings[0].definitions[0].translation, /苹果/);
});

test('english lookup does not select the chinese wiktionary path', () => {
  assert.equal(resolveLookupProvider({ provider: 'smart' }, 'en-US'), 'free');
  assert.equal(resolveLookupProvider({ provider: 'wiktionary', englishProvider: 'free' }, 'en'), 'free');
  assert.equal(resolveLookupProvider({ provider: 'smart', englishProvider: 'oxford' }, 'en-GB'), 'oxford');
  assert.equal(resolveLookupProvider({ provider: 'wiktionary' }, 'zh-CN'), 'wiktionary');
  assert.equal(resolveLookupProvider({ provider: 'smart' }, 'zh-CN'), 'smart');
});

test('chinese-only definitions are omitted from the english card', () => {
  const view = presentEntry({
    status: 'ok', phonetic: '/x/', pronunciations: [{ label: 'EN', phonetic: '/x/', audio: '' }],
    meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: '苹果', usage: '可数', examples: [{ text: '一个苹果', translation: 'an apple' }] }] }],
    notice: '中文词源暂无此词，已显示英英释义。'
  }, 'en');
  assert.equal(view.meanings.length, 0);
  assert.equal(view.noticeKey, 'noticeNoEnglish');
  assert.equal(view.notice, '');
  assert.equal(view.phonetic, '/x/');
  assert.equal(hasCjk(JSON.stringify(view.meanings)), false);
});
