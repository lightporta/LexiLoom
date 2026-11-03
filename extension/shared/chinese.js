// Chinese lookup combines independently attributed corpora. Script conversion
// changes spelling for display/search; it never invents regional pronunciations.
import { Converter, Locale } from './chinese-data/opencc.js';
import { confirmedWiktionaryMissing, isResponseFormatError, readJsonLimited, safeHttps } from './providers.js';

const chineseWord = /^[\p{Unified_Ideograph}\u3007]+$/u;
const list = value => Array.isArray(value) ? value : [];
const text = (value, limit = 2500) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const unique = values => [...new Set(values.filter(Boolean))];
const converters = new Map();
const WIKI_LICENSE = { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' };
const MOE_LICENSE = { name: 'CC BY-ND 3.0 TW', url: 'https://creativecommons.org/licenses/by-nd/3.0/tw/' };

function converter(from, to) {
  const key = `${from}:${to}`;
  if (!converters.has(key)) converters.set(key, Converter({ from, to }));
  return converters.get(key);
}

export function validChineseWord(word) {
  return typeof word === 'string' && Array.from(word).length > 0 && Array.from(word).length <= 32 && chineseWord.test(word);
}

export function convertChineseText(value, region = 'CN') {
  if (typeof value !== 'string' || !value) return typeof value === 'string' ? value : '';
  const target = region === 'TW' ? 'tw' : region === 'HK' ? 'hk' : 'cn';
  const standard = converter('cn', 't')(converter('tw', 't')(converter('hk', 't')(value)));
  return converter('t', target)(standard);
}

function canonicalWord(word) {
  // Normalize regional character variants before expanding Simplified Chinese.
  return converter('cn', 't')(converter('tw', 't')(converter('hk', 't')(word)));
}

let simplifiedVariants;
function characterVariants(word) {
  if (Array.from(word).length !== 1 || convertChineseText(word, 'CN') !== word) return [];
  if (!simplifiedVariants) {
    simplifiedVariants = new Map();
    // Reuse the bundled conversion table. This is spelling metadata, not a
    // second dictionary, and it must not decide which character sense is right.
    for (const stage of Locale.to.cn) for (const table of stage) for (const pair of table.split('|')) {
      const [traditional, simplified] = pair.split(' ');
      if (Array.from(traditional || '').length !== 1 || Array.from(simplified || '').length !== 1) continue;
      if (!simplifiedVariants.has(simplified)) simplifiedVariants.set(simplified, new Set());
      simplifiedVariants.get(simplified).add(traditional);
    }
  }
  return [...(simplifiedVariants.get(word) || [])].slice(0, 6);
}

export function localizeChineseEntry(result, region = 'CN') {
  if (!result || typeof result !== 'object' || result.status !== 'ok') return result;
  const convert = value => typeof value === 'string' ? convertChineseText(value, region) : value;
  return {
    ...result,
    displayWord: convert(result.displayWord || result.word),
    meanings: list(result.meanings).map(meaning => ({
      ...meaning,
      // The MOE text is licensed without derivatives: retain its exact text.
      definitions: list(meaning.definitions).map(definition => meaning.origin === 'moe' ? { ...definition } : ({
        ...definition,
        definition: convert(definition.definition),
        ...(definition.translation ? { translation: convert(definition.translation) } : {}),
        ...(definition.usage ? { usage: convert(definition.usage) } : {}),
        examples: list(definition.examples).map(example => ({
          ...example,
          text: convert(example.text),
          ...(example.translation ? { translation: convert(example.translation) } : {})
        }))
      }))
    }))
  };
}

function wikiSource(word, edition) {
  return {
    id: edition === 'en' ? 'wiktionary-en-zh' : 'wiktionary-zh-zh',
    name: edition === 'en' ? 'English Wiktionary · WiktApi' : '中文維基詞典 · WiktApi',
    url: `https://${edition}.wiktionary.org/wiki/${encodeURIComponent(word)}${edition === 'en' ? '#Chinese' : ''}`,
    license: { ...WIKI_LICENSE },
    copyright: 'Wiktionary contributors; extraction via WiktApi / Kaikki; selected excerpts, with Chinese display script converted by OpenCC.'
  };
}

function moeSource(word) {
  return {
    id: 'moe', name: '教育部《重編國語辭典修訂本》 · 萌典',
    url: `https://www.moedict.tw/#${encodeURIComponent(word)}`,
    license: { ...MOE_LICENSE },
    copyright: '教育部《重編國語辭典修訂本》，由萌典提供 JSON；辭典正文保持原文。'
  };
}

function baseResult(word, region, status, source = wikiSource(word, 'zh')) {
  return { word, displayWord: convertChineseText(word, region), language: 'zh', region, status, phonetic: '', pronunciations: [], meanings: [], source };
}

function fail(word, region, code, message) {
  return { ...baseResult(word, region, 'error'), error: { code, message } };
}

function tags(value) {
  return [...list(value?.tags), ...list(value?.raw_tags), ...list(value?.categories)].map(item => text(item, 180)).join(' ');
}

function regionScore(value, region) {
  const label = tags(value);
  if (region === 'HK') {
    return (/Hong.Kong|香港/i.test(label) ? 30 : 0) + (/Cantonese|粵語|粤语|官粵/i.test(label) ? 20 : 0)
      - (/Taishan|Taicheng|台山|Hakka|Min-Nan|Classical|文言/i.test(label) ? 30 : 0);
  }
  if (region === 'TW') return (/Taiwan|臺灣|台灣/i.test(label) ? 30 : 0) - (/Mainland-China|中國大陸|中国大陆|Cantonese/i.test(label) ? 15 : 0);
  return (/Mainland-China|中國大陸|中国大陆/i.test(label) ? 30 : 0) + (/Mandarin|Standard-Chinese|官話|官话/i.test(label) ? 4 : 0)
    - (/Taiwan|臺灣|台灣|Cantonese|粤语|粵語|Classical|文言/i.test(label) ? 15 : 0);
}

function sourceExample(example, region, edition, origin) {
  const value = text(example?.text);
  if (!value) return null;
  // Never republish song lyrics as the dictionary's example sentence.
  if (/lyrics|作詞|作词/i.test(text(example.ref))) return null;
  const tag = tags(example);
  const wrongScript = region === 'CN' ? /Traditional-Chinese/.test(tag) : /Simplified-Chinese/.test(tag);
  const translation = text(example.translation || example.english);
  const sentence = /[。！？.!?]$/.test(value) || value.length > 9;
  return {
    text: convertChineseText(value, region),
    ...(translation ? { translation: convertChineseText(translation, region) } : {}),
    ...(text(example.ref, 600) ? { reference: text(example.ref, 600) } : { reference: `${edition}.wiktionary.org · WiktApi` }),
    ...(text(example.roman, 300) ? { roman: text(example.roman, 300) } : {}),
    _score: regionScore(example, region) + (wrongScript ? -8 : 4) + (sentence ? 10 : 0) + (origin === 'english' ? 2 : 0)
  };
}

function normalizeWikiMeanings(payload, { region, edition }) {
  const entries = list(payload?.entries).filter(entry => entry && typeof entry === 'object');
  const result = [];
  for (const entry of entries.slice(0, 12)) {
    const code = entry.lang_code || entry.langcode;
    if (code && code !== 'zh') continue;
    const senses = list(entry.senses).slice(0, 24).filter(sense => list(sense?.glosses).some(gloss => text(gloss)));
    senses.sort((a, b) => regionScore(b, region) - regionScore(a, region));
    const definitions = senses.slice(0, 6).map(sense => ({
      definition: convertChineseText(unique(list(sense.glosses).map(value => text(value))).join('；'), region),
      examples: list(sense.examples).map(example => sourceExample(example, region, edition, edition === 'en' ? 'english' : 'chinese')).filter(Boolean),
      ...(list(sense.tags).length || list(sense.raw_tags).length ? { usage: unique([...list(sense.tags), ...list(sense.raw_tags)].map(value => text(value, 100))).join(' · ') } : {})
    }));
    if (definitions.length) result.push({
      language: edition === 'en' ? 'en' : 'zh', origin: `wiktionary-${edition}`,
      heading: edition === 'en' ? 'English · Wiktionary' : '中文 · 維基詞典',
      partOfSpeech: text(entry.pos, 60), definitions, synonyms: [], _score: Math.max(...senses.map(sense => regionScore(sense, region)))
    });
  }
  // Modern/common Mandarin senses precede classical-only historical entries.
  return result.sort((a, b) => b._score - a._score).slice(0, 6).map(({ _score, ...meaning }) => meaning);
}

function normalizeMoe(payload, region) {
  const meanings = [], pronunciations = [];
  for (const heteronym of list(payload?.heteronyms).slice(0, 4)) {
    if (text(heteronym?.bopomofo, 200)) pronunciations.push({ label: '注音 · 臺灣', phonetic: heteronym.bopomofo, locale: 'zh-TW' });
    if (text(heteronym?.pinyin, 200)) pronunciations.push({ label: '漢語拼音 · 臺灣', phonetic: heteronym.pinyin, locale: 'zh-TW' });
    const definitions = list(heteronym?.definitions).slice(0, 8).filter(def => typeof def?.def === 'string' && def.def.length < 8000).map(def => ({
      definition: def.def,
      examples: [
        ...list(def.example).filter(value => typeof value === 'string' && value.length < 4000).map(value => ({ text: value, reference: '教育部《重編國語辭典修訂本》 · 例句', _score: 50 })),
        ...list(def.quote).filter(value => typeof value === 'string' && value.length < 4000).map(value => ({ text: value, reference: '教育部《重編國語辭典修訂本》 · 書證', _score: 5 }))
      ]
    }));
    if (definitions.length) meanings.push({ language: 'zh', origin: 'moe', heading: '中文 · 臺灣國語辭典', partOfSpeech: '', definitions, synonyms: [] });
  }
  return { meanings, pronunciations: deduplicateSounds(pronunciations) };
}

function audioAttribution(sound) {
  const direct = safeHttps(sound?.source_url || sound?.sourceUrl);
  if (direct) return direct;
  const filename = text(sound?.audio, 250);
  return filename && !/[\r\n/\\]/.test(filename) ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}` : '';
}

function deduplicateSounds(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = `${value.label}|${value.phonetic || ''}|${value.audio || ''}`;
    if ((!value.phonetic && !value.audio) || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 6);
}

function regionalSounds(payloads, region) {
  const sounds = payloads.flatMap(payload => list(payload?.entries)
    .filter(entry => entry && typeof entry === 'object' && (!(entry.lang_code || entry.langcode) || (entry.lang_code || entry.langcode) === 'zh'))
    .flatMap(entry => list(entry.sounds).filter(sound => sound && typeof sound === 'object')
      .map(sound => ({ ...sound, _sourceUrl: wikiSource(payload._queryWord, payload._edition).url }))));
  const eligible = sounds.filter(sound => {
    const label = tags(sound);
    if (region === 'HK') return /Cantonese/.test(label) && !/Taishan|Taicheng/.test(label) && (/Jyutping/.test(label) || sound.audio);
    return /Mandarin/.test(label) && !/Dungan|Dongan|Xi'an|Cantonese/.test(label)
      && (region === 'CN' ? !/Taiwan/.test(label) : !/Mainland-China/.test(label));
  });
  const targetSystem = region === 'TW' ? 'Bopomofo' : region === 'HK' ? 'Jyutping' : 'Pinyin';
  const phoneticCandidates = eligible.filter(sound => list(sound.tags).includes(targetSystem) && text(sound.zh_pron));
  const explicitlyRegional = phoneticCandidates.filter(sound => regionScore(sound, region) >= 20);
  const selected = (explicitlyRegional.length ? explicitlyRegional : phoneticCandidates).sort((a, b) => regionScore(b, region) - regionScore(a, region));
  const seenPronunciations = unique(selected.map(sound => text(sound.zh_pron, 200))).slice(0, 2);
  const hasHongKong = selected.some(sound => /Hong.Kong|香港/.test(tags(sound)));
  const name = region === 'TW' ? '注音 · 維基詞典' : region === 'HK' ? hasHongKong ? '粵語拼音 · 香港' : '粵語拼音 · 通用' : '汉语拼音 · 普通话';
  const locale = region === 'TW' ? 'zh-TW' : region === 'HK' ? 'zh-HK' : 'zh-CN';
  const result = seenPronunciations.map(phonetic => ({ label: name, phonetic, locale, sourceUrl: selected.find(sound => text(sound.zh_pron, 200) === phonetic)._sourceUrl }));
  const audioCandidates = eligible.filter(sound => safeHttps(sound.mp3_url || sound.ogg_url)
    && (region !== 'TW' || /Taiwan/.test(tags(sound))));
  for (const sound of audioCandidates.slice(0, 1)) result.push({
    label: region === 'HK' ? '粵語詞典音頻' : region === 'TW' ? '臺灣國語音頻' : '普通话词典音频',
    phonetic: '', audio: safeHttps(sound.mp3_url) || safeHttps(sound.ogg_url), attributionUrl: audioAttribution(sound), locale, sourceUrl: sound._sourceUrl
  });
  if (region === 'HK') {
    const pinyin = regionalSounds(payloads, 'CN').find(sound => sound.phonetic);
    if (pinyin) result.push({ ...pinyin, label: '普通話拼音 · 補充' });
  }
  return deduplicateSounds(result);
}

function limitExamples(meanings, maximum = 2) {
  const candidates = meanings.flatMap(meaning => meaning.definitions.flatMap(definition => definition.examples.map(example => ({ definition, example }))));
  candidates.sort((a, b) => (b.example._score || 0) - (a.example._score || 0));
  const selected = new Set(), seen = new Set();
  for (const candidate of candidates) {
    const key = canonicalWord(candidate.example.text);
    if (seen.has(key)) continue;
    selected.add(candidate.example); seen.add(key);
    if (selected.size >= maximum) break;
  }
  for (const meaning of meanings) for (const definition of meaning.definitions) {
    definition.examples = definition.examples.filter(example => selected.has(example)).map(example => {
      const { _score, ...value } = example; return value;
    });
  }
}

let requestCount = 0;
const requestQueue = [];
async function limitedRequest(task) {
  if (requestCount >= 4) await new Promise(resolve => requestQueue.push(resolve)); else requestCount++;
  try { return await task(); }
  finally { const next = requestQueue.shift(); if (next) next(); else requestCount--; }
}

async function retrieve(url, kind, { fetchImpl, timeoutMs, expectedEdition, expectedWord }) {
  return limitedRequest(async () => {
    try {
      const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs), credentials: 'omit', redirect: 'error', cache: 'no-store' });
      if (response.status === 404) {
        let payload; try { payload = await readJsonLimited(response); } catch { /* Unknown 404 is not proof of a missing word. */ }
        const absent = kind === 'moe' ? payload?.error === 'Not Found' && /^找不到詞彙/.test(payload?.message || '')
          : confirmedWiktionaryMissing(payload, { word: expectedWord, edition: expectedEdition, language: 'zh' });
        return { status: absent ? 'not-found' : 'error', code: 'upstream' };
      }
      if (!response.ok) return { status: 'error', code: response.status === 429 ? 'rate-limit' : 'upstream' };
      const payload = await readJsonLimited(response);
      const supported = kind === 'moe'
        ? Array.isArray(payload?.heteronyms) && (payload.title === undefined || payload.title === expectedWord)
        : Array.isArray(payload?.entries) && (payload.edition === undefined || payload.edition === expectedEdition)
          && (payload.word === undefined || payload.word === expectedWord);
      return supported ? { status: 'ok', payload } : { status: 'error', code: 'unsupported-format' };
    } catch (error) { return { status: 'error', code: isResponseFormatError(error) ? 'unsupported-format'
      : ['TimeoutError', 'AbortError'].includes(error?.name) ? 'timeout' : 'network' }; }
  });
}

function localizedNotice(messages, region, english) {
  return messages.map(message => {
    const localized = english ? message[1] : convertChineseText(message[0], region);
    // Query spellings are evidence, not translatable prose. Insert them after
    // converting the UI text so 干 / 乾 / 幹 remain distinguishable.
    return localized.replace(/\{([a-z]+)\}/gi, (match, key) => typeof message[2]?.[key] === 'string' ? message[2][key] : match);
  }).join(' ');
}

export async function lookupChinese(value, { region = 'CN', uiLanguage = 'zh-CN', fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  region = ['CN', 'HK', 'TW'].includes(region) ? region : 'CN';
  const word = typeof value === 'string' ? value.trim().normalize('NFC') : '';
  const english = String(uiLanguage).toLowerCase().startsWith('en');
  if (!validChineseWord(word)) return fail('', region, 'invalid-word', english ? 'Select a Chinese character or a word of up to 32 characters.' : '请选择 32 个字以内的中文字词。');
  const queryWord = canonicalWord(word);
  const queryWords = Array.from(word).length === 1 && word !== queryWord ? [word, queryWord] : [queryWord];
  const options = { fetchImpl, timeoutMs };
  const wikiRequests = queryWords.map(async query => {
    const encoded = encodeURIComponent(query);
    const [chinese, counterpart] = await Promise.all(['zh', 'en'].map(edition =>
      retrieve(`https://api.wiktapi.dev/v1/${edition}/word/${encoded}?lang=zh`, 'wiki', { ...options, expectedEdition: edition, expectedWord: query })));
    return { query, chinese, counterpart,
      meaningsZh: chinese.status === 'ok' ? normalizeWikiMeanings(chinese.payload, { region, edition: 'zh' }) : [],
      meaningsEn: counterpart.status === 'ok' ? normalizeWikiMeanings(counterpart.payload, { region, edition: 'en' }) : [] };
  });
  const moeRequests = [];
  async function retrieveTaiwan() {
    if (region !== 'TW') return null;
    for (const query of queryWords) {
      const response = await retrieve(`https://www.moedict.tw/uni/${encodeURIComponent(query)}.json`, 'moe', { ...options, expectedWord: query });
      const candidate = { ...response, query };
      moeRequests.push(candidate);
      if (response.status === 'ok' && normalizeMoe(response.payload, region).meanings.length) return candidate;
    }
    return moeRequests.at(-1);
  }
  const [wikiGroups, moe] = await Promise.all([Promise.all(wikiRequests), retrieveTaiwan()]);
  const wikiChinese = wikiGroups.flatMap(group => group.meaningsZh);
  const wikiEnglish = wikiGroups.flatMap(group => group.meaningsEn);
  const taiwan = moe?.status === 'ok' ? normalizeMoe(moe.payload, region) : { meanings: [], pronunciations: [] };
  if (moe?.query) taiwan.pronunciations = taiwan.pronunciations.map(sound => ({ ...sound, sourceUrl: moeSource(moe.query).url }));
  const primaryMeanings = taiwan.meanings.length ? taiwan.meanings : wikiChinese;
  const meanings = english ? [...wikiEnglish, ...primaryMeanings] : [...primaryMeanings, ...wikiEnglish];
  const responses = [...wikiGroups.flatMap(group => [group.chinese, group.counterpart]), ...moeRequests];
  if (!meanings.length) {
    if (responses.every(response => response.status === 'not-found')) return baseResult(word, region, 'not-found');
    return fail(word, region, responses.find(response => response.status === 'error')?.code || 'unsupported-format', english ? 'The Chinese dictionary could not provide a usable entry. Please try again.' : '中文词源暂时无法提供可用词条，请稍后重试。');
  }
  limitExamples(meanings);
  const wikiPayloads = wikiGroups.flatMap(group => [
    group.counterpart.payload && { ...group.counterpart.payload, _queryWord: group.query, _edition: 'en' },
    group.chinese.payload && { ...group.chinese.payload, _queryWord: group.query, _edition: 'zh' }
  ]).filter(Boolean);
  const wikiPronunciations = regionalSounds(wikiPayloads, region);
  const moeZhuyin = taiwan.pronunciations.filter(sound => /注音/.test(sound.label));
  const pronunciations = taiwan.pronunciations.length ? deduplicateSounds([
    ...moeZhuyin,
    ...(!moeZhuyin.length ? wikiPronunciations.filter(sound => /注音/.test(sound.label)) : []),
    ...taiwan.pronunciations.filter(sound => !/注音/.test(sound.label)),
    ...wikiPronunciations.filter(sound => sound.audio)
  ]) : wikiPronunciations;
  const soundSources = new Set(pronunciations.map(sound => sound.sourceUrl));
  const componentCandidates = [
    ...(taiwan.meanings.length ? [moeSource(moe.query)] : []),
    ...wikiGroups.filter(group => group.meaningsZh.length && !taiwan.meanings.length || soundSources.has(wikiSource(group.query, 'zh').url)).map(group => wikiSource(group.query, 'zh')),
    ...wikiGroups.filter(group => group.meaningsEn.length || soundSources.has(wikiSource(group.query, 'en').url)).map(group => wikiSource(group.query, 'en')),
    ...(moe?.query && !taiwan.meanings.length && soundSources.has(moeSource(moe.query).url) ? [moeSource(moe.query)] : [])
  ];
  const components = componentCandidates.filter((component, index) => componentCandidates.findIndex(other => other.url === component.url) === index);
  const source = { ...components[0], components, sourceUrls: components.map(component => component.url) };
  const notices = [];
  const original = wikiGroups.find(group => group.query === word);
  const variants = characterVariants(word);
  const originalHasMeaning = original && (original.meaningsZh.length || original.meaningsEn.length) || moe?.query === word && taiwan.meanings.length;
  if (queryWords.length > 1 && (originalHasMeaning || variants.length > 1)) notices.push([
    '单字“{word}”可能涉及{variants}等字形；本次分别查询原字和“{query}”，并非全部字义，建议选完整词语。',
    'The character “{word}” can involve different spellings ({variants}). This result checks the original and “{query}”, not every sense; select a complete word for context.',
    { word, variants: unique([word, ...variants]).join(english ? ', ' : '、'), query: queryWord }
  ]);
  if (region === 'TW' && !taiwan.meanings.length) notices.push(['台湾词源未能提供此词，已显示维基词典补充资料。', 'The Taiwan dictionary did not provide this word; showing supplementary Wiktionary data.']);
  if (!primaryMeanings.length) notices.push(['中文词源未收录可用释义，已显示英文解释。', 'No usable Chinese definition was returned; showing the English explanation.']);
  if (!wikiEnglish.length) notices.push(['词源暂未提供英文解释。', 'An English explanation is not available from the current source.']);
  if (!pronunciations.some(pronunciation => pronunciation.phonetic)) notices.push(['词源暂未提供对应地区的读音。', 'The source does not provide a pronunciation for this region.']);
  if (region === 'HK' && !pronunciations.some(pronunciation => /粵語拼音.*香港/.test(pronunciation.label))) notices.push(['词源暂未标注香港粤语读音；通用粤语或普通话读音只作补充。', 'A reading explicitly marked Hong Kong is unavailable; general Cantonese or Mandarin is supplementary.']);
  if (!meanings.some(meaning => meaning.definitions.some(definition => definition.examples.length))) notices.push(['词源暂未提供例句。', 'The current sources do not provide an example sentence.']);
  const finalPronunciations = english ? pronunciations.map(pronunciation => ({
    ...pronunciation,
    label: /注音/.test(pronunciation.label) ? /臺灣/.test(pronunciation.label) ? 'Zhuyin · Taiwan' : 'Zhuyin · Wiktionary'
      : /粵語拼音/.test(pronunciation.label) ? /香港/.test(pronunciation.label) ? 'Jyutping · Hong Kong' : 'Jyutping · Cantonese'
        : /音頻|音频/.test(pronunciation.label) ? region === 'HK' ? 'Cantonese dictionary audio' : region === 'TW' ? 'Mandarin audio · Taiwan' : 'Mandarin dictionary audio'
          : /臺灣/.test(pronunciation.label) ? 'Pinyin · Taiwan' : /補充/.test(pronunciation.label) ? 'Pinyin · Mandarin (supplement)' : 'Pinyin · Mandarin'
  })) : pronunciations;
  const result = {
    ...baseResult(word, region, 'ok', source), queryWord, queryWords, meanings, pronunciations: finalPronunciations,
    // A usable card may still be missing a temporarily failed source. Let a
    // subsequent lookup retry it instead of caching that partial result.
    cacheable: !responses.some(response => response.status === 'error'),
    ...(queryWords.length > 1 && originalHasMeaning ? { displayWord: word } : {}),
    phonetic: pronunciations.find(pronunciation => pronunciation.phonetic)?.phonetic || '',
    scriptConversion: { engine: 'OpenCC 1.4.2', appliesTo: 'Wiktionary text and display/search spelling; MOE text is unchanged' },
    ...(notices.length ? { notice: localizedNotice(notices, region, english) } : {})
  };
  return result;
}
