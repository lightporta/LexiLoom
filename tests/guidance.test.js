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

test('fill encodes headwords and rejects empty, oversized or control-bearing queries', () => {
  assert.equal(g.fill('https://e.example/{word}', '学習'), 'https://e.example/%E5%AD%A6%E7%BF%92');
  assert.equal(g.fill('https://e.example/{word}', ''), '');
  assert.equal(g.fill('https://e.example/{word}', '   '), '');
  assert.equal(g.fill('https://e.example/{word}', 42), '');
  assert.equal(g.fill('https://e.example/{word}', '  学習  '), 'https://e.example/%E5%AD%A6%E7%BF%92');
  assert.equal(g.fill('http://e.example/{word}', 'word'), '');
  assert.equal(g.fill('https://e.example/fixed', 'word'), '');
  assert.equal(g.fill('https://e.example/{word}', 'a\u0000b'), '');
  assert.equal(g.fill('https://e.example/{word}', '\ta'), '');
  assert.equal(g.fill('https://e.example/{word}', 'a'.repeat(64)), 'https://e.example/' + 'a'.repeat(64));
  assert.equal(g.fill('https://e.example/{word}', 'a'.repeat(65)), '');
  assert.deepEqual(g.resolve({ displayWord: 'a'.repeat(70), language: 'en' }, { uiLanguage: 'en-US' }), []);
  const astral = '𠮷'.repeat(64);
  assert.equal(g.fill('https://e.example/{word}', astral), 'https://e.example/' + encodeURIComponent(astral));
  assert.equal(g.fill('https://e.example/{word}', astral + '𠮷'), '');
  assert.ok(g.resolve({ word: astral, language: 'ja' })[0].url.endsWith(encodeURIComponent(astral)));
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

test('word placeholders cannot alter a site authority, including direct fill calls', () => {
  for (const template of [
    'https://{word}/search',
    'https://{word}.example/search',
    'https://example.com:{word}/search',
    'https://{word}@example.com/search'
  ]) {
    assert.deepEqual(g.validateTemplate('Unsafe', template), { ok: false, error: 'authority' });
    assert.equal(g.fill(template, 'other.example'), '');
    assert.deepEqual(g.sanitize({ guidanceCustom: [{ name: 'Unsafe', template }] }).custom, []);
  }
  for (const template of [
    'https://example.com/w/{word}',
    'https://example.com/?q={word}',
    'https://example.com/#search={word}'
  ]) {
    assert.equal(g.validateTemplate('Stable', template).ok, true);
    const url = new URL(g.fill(template, 'other.example/a?b=#c'));
    assert.equal(url.origin, 'https://example.com');
    assert.ok(url.href.includes(encodeURIComponent('other.example/a?b=#c')));
  }
  assert.equal(g.validateTemplate('Backslash', 'https://example.com\\{word}').ok, false);
});

test('length limits reject custom templates instead of saving a truncated name or URL', () => {
  const prefix = 'https://example.com/?q={word}&padding=';
  const boundary = prefix + 'x'.repeat(g.MAX_TEMPLATE - prefix.length);
  const name = 'n'.repeat(g.MAX_NAME);
  assert.equal(g.validateTemplate(name, boundary).ok, true);
  assert.deepEqual(g.validateTemplate(name + 'n', boundary), { ok: false, error: 'name_length' });
  assert.deepEqual(g.validateTemplate(name, boundary + 'x'), { ok: false, error: 'template_length' });
  assert.equal(g.fill(boundary + 'x', 'word'), '');
  const parsed = g.parseCustom(`${name}n | ${boundary}\nGood | ${boundary}x`);
  assert.deepEqual(parsed.custom, []);
  assert.deepEqual(parsed.invalid.map(({ line, error }) => ({ line, error })), [
    { line: 1, error: 'name_length' }, { line: 2, error: 'template_length' }
  ]);
  assert.deepEqual(g.sanitize({ guidanceCustom: [{ name, template: boundary + 'x' }] }).custom, []);
  const unicodeName = '𠮷'.repeat(g.MAX_NAME);
  assert.equal(g.validateTemplate(unicodeName, boundary).value.name, unicodeName);
  assert.equal(g.validateTemplate(unicodeName + '𠮷', boundary).error, 'name_length');
  assert.equal(g.validateTemplate('Name\u0000', boundary).ok, false);
  assert.equal(g.validateTemplate('Name | Other', boundary).ok, false);
  assert.equal(g.validateTemplate('Name', boundary + '\t').ok, false);
});

test('custom overflow reports its original line and never silently drops an accepted row', () => {
  const lines = ['# Heading', '', ...Array.from({ length: 8 }, (_, index) =>
    `Site ${index + 1} | https://s${index + 1}.example/{word}`)];
  const parsed = g.parseCustom(lines.join('\n'));
  assert.equal(parsed.custom.length, g.MAX_CUSTOM);
  assert.deepEqual(parsed.invalid, [
    { line: 9, name: 'Site 7', error: 'limit' },
    { line: 10, name: 'Site 8', error: 'limit' }
  ]);
});

test('language-scoped custom templates round-trip without changing legacy two-field entries', () => {
  const parsed = g.parseCustom([
    'Legacy | https://legacy.example/{word}',
    'fr | Français | https://fr.example/{word}',
    '* | Any language | https://any.example/{word}',
    'EN | English | https://en.example/{word}'
  ].join('\n'));
  assert.deepEqual(parsed.invalid, []);
  assert.deepEqual(parsed.custom[0], { name: 'Legacy', template: 'https://legacy.example/{word}' });
  assert.deepEqual(parsed.custom.slice(1).map(item => item.language), ['fr', '*', 'en']);
  assert.ok(!Object.hasOwn(parsed.custom[0], 'language'));
  const flat = g.publicSettings({ guidanceCustom: parsed.custom });
  const nested = g.publicSettings({ guidance: { custom: parsed.custom } });
  assert.deepEqual(flat.custom, parsed.custom);
  assert.deepEqual(nested, flat);
  const withPipe = 'https://legacy.example/?q={word}&filter=one|two';
  assert.deepEqual(g.parseCustom(`Legacy | ${withPipe}`).custom, [{ name: 'Legacy', template: withPipe }]);
  assert.deepEqual(g.parseCustom(`fr | French | ${withPipe}`).custom,
    [{ name: 'French', template: withPipe, language: 'fr' }]);
  assert.deepEqual(g.parseCustom('pt | Unsupported | https://pt.example/{word}').invalid,
    [{ line: 1, name: ' Unsupported ', error: 'language' }]);
  assert.deepEqual(g.sanitize({ guidanceCustom: [{ name: 'Bad', template: 'https://bad.example/{word}', language: 'pt' }] }).custom, []);
});

test('language-scoped custom links match the headword language and universal links remain universal', () => {
  const settings = { guidanceCustom: [
    { name: 'French', template: 'https://fr.example/{word}', language: 'fr' },
    { name: 'German', template: 'https://de.example/{word}', language: 'de' },
    { name: 'Legacy', template: 'https://legacy.example/{word}' },
    { name: 'All', template: 'https://all.example/{word}', language: '*' }
  ] };
  for (const [language, included, excluded] of [['fr', 'French', 'German'], ['de', 'German', 'French']]) {
    const links = g.resolveAll({ word: 'test', language }, { uiLanguage: 'en-US', settings });
    assert.ok(links.some(link => link.name === included));
    assert.ok(!links.some(link => link.name === excluded));
    assert.ok(links.some(link => link.name === 'Legacy'));
    assert.ok(links.some(link => link.name === 'All'));
  }
  const unknown = g.resolveAll({ word: 'test', language: 'zz' }, { settings });
  assert.deepEqual(unknown.map(link => link.name), ['Legacy', 'All']);
  assert.deepEqual(g.resolveAll({ word: 'test', language: 'zz' }), []);
  assert.deepEqual(g.resolveAll({ word: 'test' }), []);
});

test('the complete directory exposes entries after the card limit while preserving order and deduplication', () => {
  const custom = Array.from({ length: 6 }, (_, index) => ({ name: `Site ${index}`, template: `https://s${index}.example/{word}` }));
  const options = { uiLanguage: 'en-US', settings: { guidanceCustom: custom } };
  const card = g.resolve(englishEntry, options);
  const all = g.resolveAll(englishEntry, options);
  assert.equal(card.length, g.MAX_LINKS);
  assert.deepEqual(all.slice(0, g.MAX_LINKS), card);
  assert.equal(all.filter(link => link.custom).length, 6);
  assert.ok(all.some(link => !link.custom));
  assert.deepEqual(g.resolve(englishEntry, { ...options, limit: 1 }), [all[0]]);
  assert.deepEqual(g.resolve(englishEntry, { ...options, limit: 0 }), []);
  assert.deepEqual(g.resolve(englishEntry, { ...options, limit: Infinity }), all);
  const duplicate = { name: 'Duplicate', template: custom[0].template };
  const deduped = g.resolveAll(englishEntry, { ...options, settings: { guidanceCustom: [custom[0], duplicate] } });
  assert.equal(deduped.filter(link => link.url === card[0].url).length, 1);
});

test('Japanese, Korean, French, German and Spanish get their own credited directory sites', () => {
  assert.deepEqual(g.supportedLanguages(), ['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es']);
  const examples = [
    ['ja', '日本語', ['ja.wiktionary.org']],
    ['ko', '사랑', ['ko.wiktionary.org']],
    ['fr', 'bonjour', ['fr.wiktionary.org', 'www.larousse.fr']],
    ['de', 'Straße', ['de.wiktionary.org', 'www.duden.de']],
    ['es', 'corazón', ['es.wiktionary.org', 'dle.rae.es']]
  ];
  for (const [language, word, hosts] of examples) {
    const links = g.resolveAll({ word, language }, { uiLanguage: 'en-US' });
    assert.deepEqual(links.map(link => link.host), hosts);
    assert.ok(links.every(link => link.url.includes(encodeURIComponent(word))));
    assert.ok(links.every(link => link.mode === 'link-only'));
    assert.ok(links.every(link => link.host !== 'en.wiktionary.org'));
  }
});

test('strict custom validation rejects an entire invalid save rather than dropping individual rows', () => {
  const valid = { name: 'French', template: 'https://fr.example/{word}', language: 'fr' };
  const invalid = { name: 'Wrong host', template: 'https://{word}/' };
  assert.deepEqual(g.validateCustom([valid]), { ok: true, custom: [valid] });
  assert.deepEqual(g.validateCustom([]), { ok: true, custom: [] });
  assert.deepEqual(g.validateCustom([valid, invalid]), { ok: false, error: 'authority', index: 1 });
  assert.deepEqual(g.validateCustom([valid, null]), { ok: false, error: 'item', index: 1 });
  assert.deepEqual(g.validateCustom(null), { ok: false, error: 'custom', index: -1 });
  assert.deepEqual(g.validateCustom(Array.from({ length: 7 }, () => valid)), { ok: false, error: 'limit', index: 6 });
  assert.deepEqual(g.validateCustom([{ ...valid, language: 'bad-language' }]), { ok: false, error: 'language', index: 0 });
  assert.deepEqual(g.validateCustom([{ ...valid, template: valid.template + 'x'.repeat(g.MAX_TEMPLATE) }]),
    { ok: false, error: 'template_length', index: 0 });
  // Legacy storage remains readable even when one corrupt row is present.
  assert.deepEqual(g.sanitize({ guidanceCustom: [valid, invalid] }).custom, [valid]);
});
