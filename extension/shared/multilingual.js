// Chinese Wiktionary definitions for an explicitly selected headword language.
// Edition controls the gloss language; ?lang controls the word language.
// https://wiktapi.dev/concepts/editions
import { confirmedWiktionaryMissing, isResponseFormatError, readJsonLimited, safeHttps } from './providers.js';
import { convertChineseText } from './chinese.js';

const languages = Object.freeze({
  ja: { name: '日语', locale: 'ja-JP', maximum: 32, word: /^[\p{Unified_Ideograph}\p{Script=Hiragana}\p{Script=Katakana}々〆〇〻ー]+$/u },
  ko: { name: '韩语', locale: 'ko-KR', maximum: 32, word: /^[\p{Script=Hangul}]+$/u },
  fr: { name: '法语', locale: 'fr-FR' },
  de: { name: '德语', locale: 'de-DE' },
  es: { name: '西班牙语', locale: 'es-ES' }
});
const latinWord = /^[\p{Script=Latin}]+[\p{Script=Latin}\p{M}]*(?:['-][\p{Script=Latin}]+[\p{Script=Latin}\p{M}]*)*$/u;
const han = /\p{Script=Han}/u;
const list = value => Array.isArray(value) ? value : [];
const text = (value, maximum = 1800) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maximum) : '';
const distinct = values => [...new Set(values.filter(Boolean))];
const ENGLISH_NAMES = Object.freeze({ ja: 'Japanese', ko: 'Korean', fr: 'French', de: 'German', es: 'Spanish' });
const englishUi = value => typeof value === 'string' && value.trim().toLowerCase().startsWith('en');
const chineseText = value => {
  const clean = text(value);
  return han.test(clean) ? convertChineseText(clean, 'CN') : '';
};

export function validMultilingualWord(word, language) {
  return Boolean(typeof language === 'string' && Object.hasOwn(languages, language)
    && typeof word === 'string' && word.isWellFormed()
    && Array.from(word).length > 0 && Array.from(word).length <= (languages[language].maximum || 48)
    && (language !== 'ja' || /[\p{Unified_Ideograph}\p{Script=Hiragana}\p{Script=Katakana}〇]/u.test(word))
    && (languages[language].word || latinWord).test(word));
}

function source(word) {
  return {
    id: 'wiktionary-multilingual', name: '中文维基词典 · WiktApi',
    url: `https://zh.wiktionary.org/wiki/${encodeURIComponent(word)}`,
    copyright: 'Wiktionary contributors; extraction via WiktApi / Kaikki; selected Chinese glosses converted to Simplified Chinese by OpenCC. Original headwords and examples retain their source spelling.',
    license: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' }
  };
}

function base(word, language, status) {
  return { word, displayWord: word, language, region: '', status, phonetic: '', pronunciations: [], meanings: [], source: source(word) };
}

function failure(word, language, code, message) {
  return { ...base(word, language, 'error'), error: { code, message } };
}

function audioAttribution(sound) {
  const direct = safeHttps(sound?.source_url || sound?.sourceUrl);
  if (direct) return direct;
  const filename = text(sound?.audio, 240);
  return filename && !/[\r\n/\\]/.test(filename)
    ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}` : '';
}

function pronunciationsFor(entry, language, sourceUrl, uiLanguage) {
  const profile = languages[language];
  const english = englishUi(uiLanguage);
  const output = [];
  for (const sound of list(entry.sounds).slice(0, 16)) {
    if (!sound || typeof sound !== 'object') continue;
    const soundLanguage = sound.lang_code || sound.langcode;
    if (soundLanguage && soundLanguage !== language) continue;
    const ipa = text(sound.ipa, 180);
    const native = language === 'ja' ? text(sound.hira || sound.kana || sound.other, 180)
      : language === 'ko' ? text(sound.hangeul || sound.hangul, 180) : '';
    const roman = text(sound.roman, 180);
    const phonetic = ipa || distinct([native, roman]).join(' · ');
    const attributionUrl = audioAttribution(sound);
    // An audio URL alone does not identify its author/license description page.
    const audio = attributionUrl ? safeHttps(sound.mp3_url) || safeHttps(sound.ogg_url) || safeHttps(sound.wav_url) : '';
    if (!phonetic && !audio) continue;
    const tags = distinct([...list(sound.tags), ...list(sound.raw_tags)].map(value => text(value, 80))).join(' · ');
    const reading = ipa ? 'IPA'
      : native ? language === 'ja' ? english ? 'kana' : '假名' : english ? 'hangul' : '谚文'
        : roman ? english ? 'romanization' : '罗马字' : '';
    const label = [english ? ENGLISH_NAMES[language] : profile.name, reading, tags ? convertChineseText(tags, 'CN') : ''].filter(Boolean).join(' · ');
    const pronunciation = { label, phonetic, audio, locale: profile.locale, sourceUrl };
    if (audio) {
      pronunciation.attributionUrl = attributionUrl;
      const licenseName = text(sound.license?.name, 180), licenseUrl = safeHttps(sound.license?.url);
      if (licenseName && licenseUrl) pronunciation.license = { name: licenseName, url: licenseUrl };
    }
    output.push(pronunciation);
  }
  return output;
}

function originalExample(example, language) {
  const value = text(example?.text);
  if (!value || /lyrics|作詞|作词/i.test(text(example?.ref, 600))) return null;
  // Some extracted Chinese-edition examples put a Chinese sentence in `text`
  // and the foreign sentence in `ref`. Do not reinterpret a citation as text.
  // Pure Han text cannot reliably establish that this is a Japanese example.
  // Require kana rather than relabelling a Chinese extraction as Japanese.
  const expectedScript = language === 'ja' ? /[\p{Script=Hiragana}\p{Script=Katakana}]/u
    : language === 'ko' ? /\p{Script=Hangul}/u : /\p{Script=Latin}/u;
  if (!expectedScript.test(value)) return null;
  const translation = chineseText(example.translation);
  const reference = text(example.ref, 600);
  return {
    text: value,
    ...(translation ? { translation } : {}),
    ...(reference ? { reference } : {}),
    ...(text(example.roman, 300) ? { roman: text(example.roman, 300) } : {})
  };
}

export function normalizeMultilingual(word, payload, { language, uiLanguage = 'zh-CN' } = {}) {
  if (!validMultilingualWord(word, language)) return failure('', language || '', 'invalid-word', '请选择当前目标语言支持的单词。');
  const mismatch = !payload || payload.edition !== 'zh' || payload.word !== word || !Array.isArray(payload.entries);
  if (mismatch) return failure(word, language, 'unsupported-format', '词源返回的词头、版本或格式不符合本次查询。');
  const output = base(word, language, 'ok');
  let accepted = 0, schema = 0, examplesUsed = 0;
  const seenExamples = new Set();
  for (const entry of payload.entries.slice(0, 12)) {
    if (!entry || typeof entry !== 'object') continue;
    const entryLanguage = entry.lang_code || entry.langcode;
    // WiktApi's compact Chinese-edition records can omit these fields. The
    // documented ?lang filter is mandatory in lookupMultilingual; explicit
    // contradictory metadata is never accepted.
    if ((entryLanguage && entryLanguage !== language) || (entry.word !== undefined && entry.word !== word)) continue;
    accepted++;
    if (!Array.isArray(entry.senses)) continue;
    schema++;
    const definitions = [];
    for (const sense of entry.senses.slice(0, 16)) {
      const glosses = distinct(list(sense?.glosses).map(chineseText));
      if (!glosses.length) continue;
      const examples = [];
      for (const raw of list(sense?.examples).slice(0, 12)) {
        if (examplesUsed >= 2) break;
        const example = originalExample(raw, language);
        if (!example || seenExamples.has(example.text)) continue;
        examples.push(example); seenExamples.add(example.text); examplesUsed++;
      }
      const usage = distinct([...list(sense.tags), ...list(sense.raw_tags)].map(value => text(value, 100))).join(' · ');
      definitions.push({ definition: glosses.join('；').slice(0, 1800), examples,
        ...(usage ? { usage: convertChineseText(usage, 'CN') } : {}) });
      if (definitions.length >= 8) break;
    }
    if (definitions.length) {
      output.meanings.push({ language: 'zh', origin: 'wiktionary-zh', partOfSpeech: text(entry.pos, 60), definitions, synonyms: [] });
      output.pronunciations.push(...pronunciationsFor(entry, language, output.source.url, uiLanguage));
    }
  }
  if (payload.entries.length && (!accepted || !schema)) return failure(word, language, 'unsupported-format', '词源返回的数据不属于当前语言或格式暂不支持。');
  if (!output.meanings.length) return failure(word, language, 'translation-unavailable', '词源尚未提供这个词的中文释义，可以打开原词典查看。');
  output.pronunciations = output.pronunciations.filter((item, index, all) => all.findIndex(other =>
    other.phonetic === item.phonetic && other.audio === item.audio && other.label === item.label) === index).slice(0, 8)
    .map(item => ({ ...item, sourceUrl: output.source.url }));
  output.phonetic = output.pronunciations.find(item => item.label.includes('IPA'))?.phonetic
    || output.pronunciations.find(item => item.phonetic)?.phonetic || '';
  if (!output.pronunciations.length) output.noticeKey = 'noticeMultilingualReadingMissing';
  return output;
}

async function lookupExact(word, { language, uiLanguage, fetchImpl, timeoutMs }) {
  try {
    const response = await fetchImpl(`https://api.wiktapi.dev/v1/zh/word/${encodeURIComponent(word)}?lang=${language}`, {
      signal: AbortSignal.timeout(timeoutMs), credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' }
    });
    if (response.status === 404) {
      let payload;
      try { payload = await readJsonLimited(response); } catch { /* An unknown 404 cannot establish word absence. */ }
      if (confirmedWiktionaryMissing(payload, { word, edition: 'zh', language })) return base(word, language, 'not-found');
      return failure(word, language, 'upstream', '词源返回了无法确认的错误，请稍后重试。');
    }
    if (response.status === 401 || response.status === 403) return failure(word, language, 'authentication', '词源访问被拒绝，请稍后重试。');
    if (response.status === 429) return failure(word, language, 'rate-limit', '词源请求过于频繁，请稍后重试。');
    if (!response.ok) return failure(word, language, 'upstream', '词源暂不可用，请稍后重试。');
    return normalizeMultilingual(word, await readJsonLimited(response), { language, uiLanguage });
  } catch (error) {
    if (isResponseFormatError(error)) {
      return failure(word, language, 'unsupported-format', '词源返回的内容格式或大小不符合要求，请打开原词典查看。');
    }
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return failure(word, language, timeout ? 'timeout' : 'network', timeout ? '词源请求超时，请重试。' : '无法连接词源，请检查网络后重试。');
  }
}

export async function lookupMultilingual(word, { language, uiLanguage = 'zh-CN', fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  if (!validMultilingualWord(word, language)) return failure('', language || '', 'invalid-word', '请选择当前目标语言支持的单词。');
  const options = { language, uiLanguage, fetchImpl, timeoutMs };
  const started = performance.now();
  const exact = await lookupExact(word, options);
  // A French/Spanish sentence often begins with a capitalized common word.
  // Preserve exact spellings first, and never lowercase German nouns or turn
  // an unavailable source into a supposed missing headword.
  if (exact.status !== 'not-found' || !['fr', 'es'].includes(language)) return exact;
  const queryWord = word.toLocaleLowerCase(language);
  if (queryWord === word || !validMultilingualWord(queryWord, language)) return exact;
  const fallback = await lookupExact(queryWord, { ...options, timeoutMs: Math.max(1, Math.ceil(timeoutMs - (performance.now() - started))) });
  return { ...fallback, word, displayWord: word, queryWord, lemma: queryWord };
}
