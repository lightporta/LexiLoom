import test from 'node:test';
import assert from 'node:assert/strict';

// guidance.js is a classic IIFE that publishes globalThis.LexiLoomGuidance,
// exactly like the content script / worker / options page load path.
await import('../extension/shared/guidance.js');
const g = globalThis.LexiLoomGuidance;
const englishEntry = { displayWord: 'serendipity', language: 'en' };
const chineseEntry = word => ({ displayWord: word, language: 'zh' });

test('English headword with zh-CN interface shows three credited links, 有道词典 first', () => {
  const links = g.resolve(englishEntry, { uiLanguage: 'zh-CN', uiRegion: 'CN', settings: {} });
  assert.equal(links.length, 3);
  assert.equal(links[0].name, '有道词典');
  assert.ok(links.every(link => link.url.startsWith('https://')));
  assert.ok(links.every(link => !/\s/.test(link.url)), 'no unencoded whitespace in URLs');
  assert.ok(links.every(link => link.url === new URL(link.url).href));
  assert.ok(links.every(link => link.mode === 'link-only'));
  assert.ok(links.every(link => Object.isFrozen(link)));
  // Multi-word headwords are percent-encoded, never copied raw into the URL.
  const spaced = g.resolve({ displayWord: 'ice cream', language: 'en' }, { uiLanguage: 'en-US', settings: {} });
  assert.ok(spaced[0].url.includes('ice%20cream'));
  assert.ok(!spaced[0].url.includes(' '));
});

test('English headword with en-US interface starts with Wiktionary and no Chinese-only site', () => {
  const links = g.resolve(englishEntry, { uiLanguage: 'en-US', uiRegion: '', settings: {} });
  assert.equal(links.length, 3);
  assert.equal(links[0].name, 'Wiktionary');
  assert.ok(!links.some(link => link.name === '有道词典'));
  assert.ok(links.every(link => link.url.startsWith('https://')));
  assert.ok(links.every(link => link.url.includes('serendipity')));
});

test('simplified Chinese headword routes to 汉典 hans and 中文维基词典', () => {
  const word = '学习';
  const links = g.resolve(chineseEntry(word), { uiLanguage: 'zh-CN', uiRegion: 'CN', settings: {} });
  assert.equal(links.length, 3);
  assert.equal(links[0].name, '汉典');
  assert.match(links[0].url, /^https:\/\/www\.zdic\.net\/hans\//);
  assert.ok(links.some(link => link.name === '中文维基词典'));
  assert.ok(links.every(link => link.url.includes(encodeURIComponent(word))));
  assert.ok(links.every(link => !/\s/.test(link.url)));
});

test('Taiwan headword shows 萌典 first, traditional 汉典, and no hans path', () => {
  const word = '學習';
  const links = g.resolve(chineseEntry(word), { uiLanguage: 'zh-TW', uiRegion: 'TW', settings: {} });
  assert.equal(links.length, 3);
  assert.equal(links[0].name, '萌典');
  assert.ok(links.every(link => !link.url.includes('/hans/')));
  assert.ok(links.some(link => link.name === '中文维基词典'));
  assert.match(links.find(link => link.name === '汉典').url, /\/hant\//);
  assert.ok(links.every(link => link.url.includes(encodeURIComponent(word))));
  assert.equal(g.displayName(links.find(link => link.name === '汉典'), true), '漢典');
  assert.equal(g.displayName(links.find(link => link.name === '汉典')), '汉典');
});

test('Hong Kong headword shows 粤典 and hant 汉典', () => {
  const word = '學習';
  const links = g.resolve(chineseEntry(word), { uiLanguage: 'zh-TW', uiRegion: 'HK', settings: {} });
  assert.equal(links.length, 3);
  assert.ok(links.some(link => link.name === '粤典' && link.host === 'words.hk'));
  assert.match(links.find(link => link.name === '汉典').url, /\/hant\//);
  assert.ok(links.every(link => link.url.includes(encodeURIComponent(word))));
  assert.ok(links.every(link => !link.url.includes('/hans/')));
});

test('disabling every builtin id empties resolve, unknown ids are ignored', () => {
  assert.deepEqual(g.sanitize({ guidanceDisabled: ['en-wiktionary', 'bogus', 42] }).disabled, ['en-wiktionary']);
  assert.deepEqual(g.sanitize({ guidanceDisabled: g.builtinIds() }).disabled, g.builtinIds());
  assert.deepEqual(g.resolve(englishEntry, { uiLanguage: 'zh-CN', uiRegion: 'CN', settings: { guidanceDisabled: g.builtinIds() } }), []);
  // An unknown id neither throws nor hides a site.
  const links = g.resolve(englishEntry, { uiLanguage: 'en-US', settings: { guidanceDisabled: ['bogus'] } });
  assert.equal(links.length, 3);
  const withoutWiktionary = g.resolve(englishEntry, { uiLanguage: 'en-US', settings: { guidanceDisabled: ['en-wiktionary'] } });
  assert.ok(!withoutWiktionary.some(link => link.name === 'Wiktionary'));
  assert.ok(g.resolve({ word: '   ' }, { uiLanguage: 'en-US' }).length === 0);
});

test('custom templates are parsed, validated, placed first and capped at three links', () => {
  const parsed = g.parseCustom('我的词典 | https://example.com/w/{word}');
  assert.deepEqual(parsed.invalid, []);
  assert.equal(parsed.custom.length, 1);
  assert.deepEqual(parsed.custom[0], { name: '我的词典', template: 'https://example.com/w/{word}' });
  // Comments and blank lines are skipped without becoming invalid entries.
  assert.deepEqual(g.parseCustom('# comment\n\n  \nMine | https://m.example/{word}').custom.length, 1);
  // http:// and missing {word} are rejected as invalid lines.
  const rejected = g.parseCustom(['http only | http://example.com/{word}', 'no placeholder | https://example.com/fixed'].join('\n'));
  assert.deepEqual(rejected.custom, []);
  assert.deepEqual(rejected.invalid.map(item => item.line), [1, 2]);
  assert.ok(rejected.invalid.every(item => item.error === 'template'));
  // Custom links (priority 0) precede builtins and the total stays at 3.
  const links = g.resolve(englishEntry, { uiLanguage: 'en-US', settings: { guidanceCustom: [
    { name: 'One', template: 'https://one.example/{word}' },
    { name: 'Two', template: 'https://two.example/{word}' },
    { name: 'Three', template: 'https://three.example/{word}' }
  ] } });
  assert.equal(links.length, g.MAX_LINKS);
  assert.deepEqual(links.map(link => link.name), ['One', 'Two', 'Three']);
  assert.ok(links.every(link => link.custom === true));
  // At most six custom entries survive.
  assert.equal(g.sanitize({ guidanceCustom: Array.from({ length: 8 }, (_, index) => (
    { name: 'Site ' + index, template: 'https://site' + index + '.example/{word}' })) }).custom.length, g.MAX_CUSTOM);
  assert.equal(g.parseCustom(Array.from({ length: 7 }, (_, index) => (
    'Site ' + index + ' | https://site' + index + '.example/{word}')).join('\n')).custom.length, g.MAX_CUSTOM);
});

test('templates with credentials or a non-https scheme are rejected', () => {
  assert.equal(g.validateTemplate('Cred', 'https://user:pass@example.com/{word}').ok, false);
  assert.equal(g.validateTemplate('Cred', 'https://user:pass@example.com/{word}').error, 'url');
  assert.equal(g.fill('https://user:pass@example.com/{word}', 'word'), '');
  assert.equal(g.validateTemplate('Script', 'javascript:alert(1)//{word}').ok, false);
  assert.equal(g.fill('javascript:alert(1)//{word}', 'word'), '');
  assert.deepEqual(g.parseCustom('Cred | https://user:pass@example.com/{word}').custom, []);
  assert.equal(g.validateTemplate('', 'https://example.com/{word}').error, 'name');
});

test('fill encodes headwords, rejects empty/insecure templates and strips control chars', () => {
  assert.equal(g.fill('https://e.example/{word}', '学習'), 'https://e.example/%E5%AD%A6%E7%BF%92');
  assert.equal(g.fill('https://e.example/{word}', ''), '');
  assert.equal(g.fill('https://e.example/{word}', '   '), '');
  assert.equal(g.fill('https://e.example/{word}', 42), '');
  assert.equal(g.fill('https://e.example/{word}', '  学習  '), 'https://e.example/%E5%AD%A6%E7%BF%92');
  assert.equal(g.fill('http://e.example/{word}', 'word'), '');
  assert.equal(g.fill('https://e.example/fixed', 'word'), '');
  assert.equal(g.fill('https://e.example/{word}', 'a\u0000b'), 'https://e.example/ab');
  // Headwords are cleaned then truncated to 64 characters (MAX_WORD in guidance.js),
  // so a longer word still produces a link, for its first 64 characters.
  assert.equal(g.fill('https://e.example/{word}', 'a'.repeat(70)), 'https://e.example/' + 'a'.repeat(64));
  assert.equal(g.resolve({ displayWord: 'a'.repeat(70), language: 'en' }, { uiLanguage: 'en-US' })[0].url,
    'https://en.wiktionary.org/wiki/' + 'a'.repeat(64));
});

test('publicSettings exposes sanitized guidance but never the bridge token', () => {
  const valid = { name: '我的词典', template: 'https://example.com/w/{word}' };
  const invalid = { name: 'Bad', template: 'http://example.com/{word}' };
  const published = g.publicSettings({
    guidanceDisabled: ['en-wiktionary', 'bogus'],
    guidanceCustom: [valid, invalid],
    bridgeToken: 'secret'
  });
  assert.deepEqual(published, { disabled: ['en-wiktionary'], custom: [valid] });
  assert.ok(!JSON.stringify(published).includes('secret'));
  assert.deepEqual(g.publicSettings({}), { disabled: [], custom: [] });
});

test('sanitize accepts flat and nested guidance shapes and tolerates malformed input', () => {
  const valid = { name: '我的词典', template: 'https://example.com/w/{word}' };
  assert.deepEqual(g.sanitize({ guidanceDisabled: ['en-wiktionary'], guidanceCustom: [valid] }),
    { disabled: ['en-wiktionary'], custom: [valid] });
  assert.deepEqual(g.sanitize({ guidance: { disabled: ['zh-youdao'], custom: [valid] } }),
    { disabled: ['zh-youdao'], custom: [valid] });
  // Flat arrays win when both shapes are supplied.
  assert.deepEqual(g.sanitize({ guidanceDisabled: ['zh-youdao'], guidance: { disabled: ['en-wiktionary'], custom: [valid] } }),
    { disabled: ['zh-youdao'], custom: [valid] });
  for (const malformed of [null, undefined, {}, [], { guidanceDisabled: 'nope', guidance: { disabled: 'nope', custom: {} } }]) {
    assert.deepEqual(g.sanitize(malformed), { disabled: [], custom: [] });
  }
});
