import test from 'node:test';
import assert from 'node:assert/strict';
import { convertChineseText, lookupChinese } from '../extension/shared/chinese.js';

const moeText = '请使用软件完成练习。';
const lyrics = '这首歌的词不能当例句。';

function wiki(glosses, tags, examples, sounds, pos = 'verb') {
  return {
    entries: [{
      lang_code: 'zh', pos,
      senses: [{ glosses, tags, examples }],
      sounds
    }]
  };
}

const mandarinSound = { zh_pron: 'xué xí', tags: ['Mandarin', 'Pinyin', 'Mainland-China'] };
const taiwanSound = { zh_pron: 'ㄒㄩㄝˊ ㄒㄧˊ', tags: ['Mandarin', 'Bopomofo', 'Taiwan'] };
const hongKongSound = { zh_pron: 'hok6 zaap6', tags: ['Cantonese', 'Jyutping', 'Hong-Kong'] };
const genericCantonese = { zh_pron: 'hok6 zaap6', tags: ['Cantonese', 'Jyutping'] };

function chineseWiki() {
  return wiki(
    ['从阅读、听讲中获得知识。'],
    ['Mandarin', 'Mainland-China'],
    [
      { text: '学生们在教室里阅读。', translation: 'The students read in the classroom.', ref: 'Original fixture' },
      { text: '第二句用来确认例句上限。', ref: 'Original fixture' },
      { text: lyrics, ref: 'lyrics' }
    ],
    [mandarinSound, taiwanSound]
  );
}

function englishWiki() {
  return wiki(
    ['To study a subject.'],
    ['Mandarin'],
    [{ text: 'She studies every evening.', ref: 'Original fixture' }],
    [mandarinSound]
  );
}

function hongKongWiki() {
  return wiki(
    ['粵語：溫習。'],
    ['Cantonese', 'Hong-Kong'],
    [{ text: '今晚要溫書。', translation: 'I have to revise tonight.', ref: 'Original fixture' }],
    [hongKongSound, mandarinSound, taiwanSound]
  );
}

const moe = {
  heteronyms: [{
    bopomofo: 'ㄒㄩㄝˊ ㄒㄧˊ',
    pinyin: 'xué xí',
    definitions: [{ def: moeText, example: ['他每天练习两个小时。'], quote: ['書證不應蓋過例句。'] }]
  }]
};

function absent(kind) {
  const body = kind === 'moe'
    ? { error: 'Not Found', message: '找不到詞彙。' }
    : { error: true, status: 404, message: 'No entries found for missing' };
  return new Response(JSON.stringify(body), { status: 404, headers: { 'content-type': 'application/json' } });
}

function route(bodies) {
  const calls = [];
  const fetchImpl = async url => {
    const href = String(url);
    calls.push(href);
    if (href.includes('moedict.tw')) return bodies.moe ? Response.json(bodies.moe) : absent('moe');
    if (href.includes('/v1/en/')) return bodies.en ? Response.json(bodies.en) : absent('wiki');
    if (href.includes('/v1/zh/')) return bodies.zh ? Response.json(bodies.zh) : absent('wiki');
    return absent('wiki');
  };
  return { calls, fetchImpl };
}

function examplesOf(result) {
  return result.meanings.flatMap(meaning => meaning.definitions.flatMap(definition => definition.examples));
}

test('OpenCC changes a mainland spelling, which is why MOE text must stay untouched', () => {
  assert.notEqual(convertChineseText(moeText, 'TW'), moeText);
});

test('mainland Chinese uses Hanyu Pinyin and does not call the Taiwan dictionary', async () => {
  const { calls, fetchImpl } = route({ zh: chineseWiki(), en: englishWiki(), moe });
  const result = await lookupChinese('学习', { region: 'CN', uiLanguage: 'zh-CN', fetchImpl });
  assert.equal(result.status, 'ok');
  assert.equal(result.region, 'CN');
  assert.equal(result.displayWord, '学习');
  assert.equal(result.phonetic, 'xué xí');
  assert.equal(result.pronunciations[0].label, '汉语拼音 · 普通话');
  assert.ok(result.pronunciations.every(item => !item.phonetic?.includes('ㄒ')));
  assert.equal(result.meanings.find(meaning => meaning.language === 'zh').definitions[0].definition.includes('获得知识'), true);
  assert.equal(result.meanings.find(meaning => meaning.language === 'en').definitions[0].definition, 'To study a subject.');
  assert.ok(examplesOf(result).length <= 2);
  assert.ok(examplesOf(result).every(example => example.text !== lyrics));
  assert.equal(result.source.id, 'wiktionary-zh-zh');
  assert.ok(calls.some(url => url.includes('api.wiktapi.dev/v1/zh/')));
  assert.ok(calls.some(url => url.includes('api.wiktapi.dev/v1/en/')));
  assert.ok(calls.every(url => !url.includes('moedict.tw')));
});

test('Hong Kong prefers a Jyutping reading marked Hong Kong and does not relabel converted Mandarin', async () => {
  const { calls, fetchImpl } = route({ zh: hongKongWiki(), en: englishWiki(), moe });
  const result = await lookupChinese('学习', { region: 'HK', uiLanguage: 'zh-HK', fetchImpl });
  assert.equal(result.status, 'ok');
  assert.equal(result.phonetic, 'hok6 zaap6');
  assert.equal(result.pronunciations[0].label, '粵語拼音 · 香港');
  assert.ok(result.pronunciations.some(item => item.label === '普通話拼音 · 補充' && item.phonetic === 'xué xí'));
  assert.ok(result.pronunciations.every(item => item.label !== '注音 · 臺灣'));
  assert.match(result.meanings.find(meaning => meaning.language === 'zh').definitions[0].definition, /温習|溫習/);
  assert.equal(result.meanings.some(meaning => meaning.language === 'en'), true);
  assert.ok(!result.notice?.includes('香港粤语') && !result.notice?.includes('香港粵語'));
  assert.equal(result.source.id, 'wiktionary-zh-zh');
  assert.ok(calls.every(url => !url.includes('moedict.tw')));
});

test('an unmarked Cantonese reading stays supplementary instead of becoming a Hong Kong entry', async () => {
  const zh = wiki(['溫習。'], ['Cantonese'], [], [genericCantonese, mandarinSound]);
  const { fetchImpl } = route({ zh, en: englishWiki() });
  const result = await lookupChinese('學習', { region: 'HK', uiLanguage: 'zh-HK', fetchImpl });
  assert.equal(result.pronunciations[0].label, '粵語拼音 · 通用');
  assert.match(result.notice, /香港/);
  assert.notEqual(result.source.name.includes('香港'), true);
});

test('Taiwan uses the MOE entry and Zhuyin, and does not rewrite that text', async () => {
  const { calls, fetchImpl } = route({ zh: chineseWiki(), en: englishWiki(), moe });
  const result = await lookupChinese('学习', { region: 'TW', uiLanguage: 'zh-TW', fetchImpl });
  assert.equal(result.status, 'ok');
  assert.equal(result.displayWord, '學習');
  assert.equal(result.phonetic, 'ㄒㄩㄝˊ ㄒㄧˊ');
  assert.equal(result.pronunciations[0].label, '注音 · 臺灣');
  const taiwan = result.meanings.find(meaning => meaning.origin === 'moe');
  assert.equal(taiwan.definitions[0].definition, moeText);
  assert.equal(taiwan.definitions[0].examples[0].text, '他每天练习两个小时。');
  assert.equal(result.meanings.some(meaning => meaning.language === 'en' && meaning.definitions[0].definition === 'To study a subject.'), true);
  assert.ok(examplesOf(result).length <= 2);
  assert.ok(examplesOf(result).every(example => example.text !== lyrics));
  assert.equal(result.source.id, 'moe');
  assert.ok(calls.some(url => url.includes('www.moedict.tw/uni/') && url.includes(encodeURIComponent('學習'))));
  assert.ok(calls.some(url => url.includes('api.wiktapi.dev/v1/en/')));
});

test('a missing Taiwan entry stays labelled as Wiktionary instead of converted mainland text', async () => {
  const { calls, fetchImpl } = route({ zh: chineseWiki(), en: englishWiki() });
  const result = await lookupChinese('学习', { region: 'TW', uiLanguage: 'zh-TW', fetchImpl });
  assert.equal(result.status, 'ok');
  assert.ok(result.meanings.every(meaning => meaning.origin !== 'moe'));
  assert.match(result.notice, /維基|维基/);
  assert.ok(calls.some(url => url.includes('moedict.tw')));
});

test('the English interface still keeps the Chinese reading and an English explanation', async () => {
  const { calls, fetchImpl } = route({ zh: chineseWiki(), en: englishWiki() });
  const result = await lookupChinese('学习', { region: 'CN', uiLanguage: 'en-US', fetchImpl });
  assert.equal(result.meanings[0].language, 'en');
  assert.equal(result.meanings[0].definitions[0].definition, 'To study a subject.');
  assert.equal(result.phonetic, 'xué xí');
  assert.equal(result.pronunciations[0].label, 'Pinyin · Mandarin');
  assert.equal(result.displayWord, '学习');
  assert.ok(calls.every(url => !url.includes('dictionaryapi.dev')));
});
