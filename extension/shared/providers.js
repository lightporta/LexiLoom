// Provider responses are reduced to a small, text-only view model. No API HTML
// is ever inserted into a page and no dictionary entries are persisted here.
const WORD = /^[a-z]+(?:['-][a-z]+)*$/i;
const MAX_BODY_BYTES = 1_000_000;
const text = (value, limit = 1800) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : '';
const array = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(Boolean))];

export function safeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function validWord(word) {
  return typeof word === 'string' && word.length <= 48 && WORD.test(word);
}

export function sourceFor(id, word) {
  const q = encodeURIComponent(word);
  if (id === 'oxford') return { id, name: 'Oxford Dictionaries API', url: 'https://developer.oxforddictionaries.com/' };
  if (id === 'cambridge') return { id, name: 'Cambridge Dictionary', url: `https://dictionary.cambridge.org/dictionary/english/${q}` };
  if (id === 'wiktionary') return { id, name: '中文维基词典 · WiktApi', url: `https://zh.wiktionary.org/wiki/${q}`, copyright: '中文维基词典，经 WiktApi 抽取并节选', license: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' } };
  return { id: 'free', name: 'Free Dictionary API', url: `https://dictionaryapi.dev/` };
}

export function providerError(word, id, code, message) {
  return { word, status: 'error', phonetic: '', pronunciations: [], meanings: [], source: sourceFor(id, word), error: { code, message } };
}

export function notFound(word, id) {
  return { word, status: 'not-found', phonetic: '', pronunciations: [], meanings: [], source: sourceFor(id, word) };
}

function result(word, id, pronunciations, meanings, sourceUrl = '') {
  const cleanMeanings = meanings.filter(item => item.definitions.length).slice(0, 8);
  if (!cleanMeanings.length) return providerError(word, id, 'unsupported-format', '词典返回的数据格式暂不支持，请打开原词典查看。');
  const sound = pronunciations.filter((item, index, all) => (item.phonetic || item.audio) && all.findIndex(other => other.phonetic === item.phonetic && other.audio === item.audio && other.label === item.label) === index).slice(0, 6);
  const source = sourceFor(id, word);
  if (safeHttps(sourceUrl)) source.url = safeHttps(sourceUrl);
  return { word, status: 'ok', phonetic: sound.find(item => item.phonetic)?.phonetic || '', pronunciations: sound, meanings: cleanMeanings, source };
}

export function normalizeFree(word, payload) {
  if (!Array.isArray(payload)) return providerError(word, 'free', 'unsupported-format', '词典返回的数据格式暂不支持。');
  const pronunciations = [];
  const meanings = [];
  for (const entry of payload.slice(0, 8)) {
    if (!entry || typeof entry !== 'object') continue;
    for (const pronunciation of array(entry.phonetics)) {
      const sound = { label: 'EN', phonetic: text(pronunciation?.text, 120), audio: safeHttps(pronunciation?.audio) };
      const attributionUrl = safeHttps(pronunciation?.sourceUrl);
      if (attributionUrl) sound.attributionUrl = attributionUrl;
      const license = normalizedLicense(pronunciation?.license);
      if (license) sound.license = license;
      pronunciations.push(sound);
    }
    if (text(entry.phonetic)) pronunciations.push({ label: 'EN', phonetic: text(entry.phonetic, 120), audio: '' });
    for (const meaning of array(entry.meanings).slice(0, 8)) {
      meanings.push({
        partOfSpeech: text(meaning?.partOfSpeech, 60),
        definitions: array(meaning?.definitions).slice(0, 6).filter(def => text(def?.definition)).map(def => ({ definition: text(def.definition), examples: text(def.example) ? [{ text: text(def.example) }] : [] })),
        synonyms: unique(array(meaning?.synonyms).map(item => text(item, 80))).slice(0, 8),
      });
    }
  }
  const normalized = result(word, 'free', pronunciations, meanings);
  const sourceUrls = unique(payload.slice(0, 8).flatMap(entry => array(entry?.sourceUrls)).map(safeHttps)).slice(0, 12);
  if (sourceUrls.length) {
    normalized.source.sourceUrls = sourceUrls;
    normalized.source.url = sourceUrls[0];
  }
  const license = payload.slice(0, 8).map(entry => normalizedLicense(entry?.license)).find(Boolean);
  if (license) normalized.source.license = license;
  return normalized;
}

function normalizedLicense(value) {
  const name = text(value?.name, 120);
  const url = safeHttps(value?.url);
  return name && url ? { name, url } : undefined;
}

function wiktionarySoundLabel(sound) {
  const label = [...array(sound?.tags), ...array(sound?.raw_tags)].map(value => text(value, 80)).join(' ');
  if (/\bUS\b|American|美国|美國/i.test(label)) return 'US';
  if (/\bUK\b|British|英国|英國/i.test(label)) return 'UK';
  if (/\bAU\b|Australian|澳洲|澳大利亚|澳大利亞/i.test(label)) return 'AU';
  return 'EN';
}

function wiktionaryAudioAttribution(sound) {
  const direct = safeHttps(sound?.source_url || sound?.sourceUrl);
  if (direct) return direct;
  // The filename identifies its Commons description page, where the audio's
  // own author and license can be checked independently of dictionary text.
  const filename = text(sound?.audio, 240);
  return filename && !/[\r\n/\\]/.test(filename) ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}` : '';
}

export function normalizeWiktionary(word, payload) {
  if (!Array.isArray(payload?.entries) || (payload.edition && payload.edition !== 'zh')) return providerError(word, 'wiktionary', 'unsupported-format', '中文词源返回的数据格式暂不支持，请打开原词典查看。');
  const pronunciations = [];
  const meanings = [];
  for (const entry of payload.entries.slice(0, 8)) {
    if (!entry || typeof entry !== 'object') continue;
    const language = entry.lang_code || entry.langcode;
    if (language && language !== 'en') continue;
    for (const sound of array(entry.sounds).slice(0, 12)) {
      const audio = safeHttps(sound?.mp3_url) || safeHttps(sound?.ogg_url);
      const pronunciation = { label: wiktionarySoundLabel(sound), phonetic: text(sound?.ipa, 120), audio };
      const attributionUrl = wiktionaryAudioAttribution(sound);
      if (audio && attributionUrl) pronunciation.attributionUrl = attributionUrl;
      const license = normalizedLicense(sound?.license);
      if (audio && license) pronunciation.license = license;
      pronunciations.push(pronunciation);
    }
    const definitions = [];
    for (const sense of array(entry.senses).slice(0, 12)) {
      const glosses = unique(array(sense?.glosses).map(value => text(value)).filter(Boolean));
      if (!glosses.length) continue;
      const examples = array(sense?.examples).slice(0, 3).filter(example => text(example?.text)).map(example => {
        const value = { text: text(example.text) };
        const translation = text(example.translation || example.english);
        if (translation) value.translation = translation;
        const reference = text(example.ref, 600);
        if (reference) value.reference = reference;
        return value;
      });
      const usage = unique([...array(sense?.tags), ...array(sense?.raw_tags)].map(value => text(value, 100))).join(' · ');
      // Keep the dictionary's original Chinese text, including traditional
      // characters. No generated translation or silent script conversion.
      definitions.push({ definition: glosses.join('；').slice(0, 1800), examples, ...(usage ? { usage } : {}) });
    }
    meanings.push({ partOfSpeech: text(entry.pos, 60), definitions: definitions.slice(0, 8), synonyms: unique(array(entry.synonyms).map(value => text(value?.word || value, 80))).slice(0, 8) });
  }
  return result(word, 'wiktionary', pronunciations, meanings);
}

export async function readJsonLimited(response) {
  const length = Number(response.headers?.get?.('content-length') || 0);
  if (length > MAX_BODY_BYTES) throw Object.assign(new Error('Response exceeds the size limit.'), { code: 'response-too-large' });
  if (!response.body?.getReader) {
    const value = await response.text();
    if (new TextEncoder().encode(value).length > MAX_BODY_BYTES) throw Object.assign(new Error('Response exceeds the size limit.'), { code: 'response-too-large' });
    return JSON.parse(value);
  }
  const reader = response.body.getReader();
  let bytes = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw Object.assign(new Error('Response exceeds the size limit.'), { code: 'response-too-large' });
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(merged));
}

export function httpError(word, id, status) {
  // Cambridge 404 can also mean InvalidDictionary or InvalidPath. Its response
  // body must be inspected separately before declaring a word absent.
  if (status === 404 && id !== 'cambridge') return notFound(word, id);
  if (status === 401 || status === 403) return providerError(word, id, 'authentication', '词典授权失败，请检查 API 凭据及词典访问权限。');
  if (status === 429) return providerError(word, id, 'rate-limit', '词典请求额度已用尽或过于频繁，请稍后重试。');
  return providerError(word, id, 'upstream', '词典服务暂时不可用，请稍后重试。');
}

export async function cambridgeHttpError(word, response, { lookup = false } = {}) {
  if (response.status !== 404) return httpError(word, 'cambridge', response.status);
  let code;
  try {
    const payload = await readJsonLimited(response);
    code = typeof payload?.errorCode === 'string' ? payload.errorCode : payload?.error?.errorCode;
  } catch { /* Unknown/malformed/oversized error bodies must not imply absence. */ }
  if (lookup && code === 'NoResults') return notFound(word, 'cambridge');
  if (code === 'InvalidDictionary') return providerError(word, 'cambridge', 'invalid-dictionary', '剑桥词典代码不存在或当前密钥未获授权，请读取可用词典列表并检查配置。');
  if (code === 'InvalidPath') return providerError(word, 'cambridge', 'integration', '剑桥 API 请求路径无效，请检查接入配置。');
  return providerError(word, 'cambridge', 'upstream', '剑桥服务返回了无法确认的错误，请稍后重试或检查词典配置。');
}

export async function lookupFree(word, { fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  if (!validWord(word)) return providerError('', 'free', 'invalid-word', '首版仅支持不超过 48 个字符的英文单词。');
  try {
    const response = await fetchImpl(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`, { signal: AbortSignal.timeout(timeoutMs), credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' } });
    if (!response.ok) return httpError(word, 'free', response.status);
    return normalizeFree(word, await readJsonLimited(response));
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return providerError(word, 'free', timeout ? 'timeout' : 'network', timeout ? '词典请求超时，请重试。' : '无法连接词典，请检查网络后重试。');
  }
}

export async function lookupWiktionary(word, { fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  if (!validWord(word)) return providerError('', 'wiktionary', 'invalid-word', '首版仅支持不超过 48 个字符的英文单词。');
  try {
    const response = await fetchImpl(`https://api.wiktapi.dev/v1/zh/word/${encodeURIComponent(word.toLowerCase())}?lang=en`, { signal: AbortSignal.timeout(timeoutMs), credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' } });
    if (response.status === 404) {
      let payload;
      try { payload = await readJsonLimited(response); } catch { /* An unknown 404 may be a service/route failure. */ }
      if (payload?.error === true && payload?.status === 404 && typeof payload?.message === 'string' && /^No entries found for /i.test(payload.message)) return notFound(word, 'wiktionary');
      return providerError(word, 'wiktionary', 'upstream', '中文词源返回了无法确认的错误，请稍后重试。');
    }
    if (!response.ok) return httpError(word, 'wiktionary', response.status);
    return normalizeWiktionary(word, await readJsonLimited(response));
  } catch (error) {
    const timeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return providerError(word, 'wiktionary', timeout ? 'timeout' : 'network', timeout ? '中文词源请求超时，请重试。' : '无法连接中文词源，请检查网络后重试。');
  }
}

export async function lookupSmart(word, options = {}) {
  if (!validWord(word)) return providerError('', 'wiktionary', 'invalid-word', '首版仅支持不超过 48 个字符的英文单词。');
  const chinese = await lookupWiktionary(word, options);
  if (chinese.status === 'ok') return chinese;
  const english = await lookupFree(word, options);
  if (english.status === 'ok') return { ...english, notice: chinese.status === 'not-found' ? '中文词源暂无此词，已显示英英释义。' : '中文词源暂不可用，已显示英英释义。' };
  if (chinese.status === 'not-found' && english.status === 'not-found') return notFound(word, 'wiktionary');
  if (chinese.status === 'error') return { ...chinese, notice: english.status === 'not-found' ? '英英词源也未收录；中文词源暂不可用，暂时无法确认此词。' : '中文和英英词源均暂不可用，请稍后重试。' };
  return { ...english, notice: '中文词源暂无此词，英英词源暂不可用。' };
}

function oxfordPronunciations(values) {
  return array(values).map(value => ({ label: array(value?.dialects).map(item => text(item, 30)).join(' / ') || 'EN', phonetic: text(value?.phoneticSpelling, 120), audio: safeHttps(value?.audioFile) }));
}

function oxfordDefinitions(senses, depth = 0) {
  if (depth > 8) return [];
  const definitions = [];
  for (const sense of array(senses).slice(0, 20)) {
    if (!sense || typeof sense !== 'object') continue;
    const usage = unique([...array(sense.registers), ...array(sense.domains), ...array(sense.grammaticalFeatures)].map(item => text(item?.text || item?.id, 100))).join(' · ');
    const translation = array(sense.translations).map(item => text(item?.text || item, 500)).filter(Boolean).join('；');
    const examples = array(sense.examples).slice(0, 3).filter(item => text(item?.text)).map(item => ({ text: text(item.text), translation: array(item.translations).map(value => text(value?.text || value)).filter(Boolean).join('；') }));
    for (const definition of array(sense.definitions).slice(0, 6)) if (text(definition)) definitions.push({ definition: text(definition), translation, examples, usage });
    definitions.push(...oxfordDefinitions(sense.subsenses, depth + 1));
    if (definitions.length >= 12) break;
  }
  return definitions.slice(0, 12);
}

export function normalizeOxford(word, payload) {
  const pronunciations = [];
  const meanings = [];
  for (const entry of array(payload?.results).slice(0, 8)) {
    for (const lexical of array(entry?.lexicalEntries).slice(0, 8)) {
      if (!lexical || typeof lexical !== 'object') continue;
      pronunciations.push(...oxfordPronunciations(lexical.pronunciations));
      const definitions = [];
      const synonyms = [];
      for (const lexicalEntry of array(lexical.entries).slice(0, 8)) {
        if (!lexicalEntry || typeof lexicalEntry !== 'object') continue;
        pronunciations.push(...oxfordPronunciations(lexicalEntry.pronunciations));
        definitions.push(...oxfordDefinitions(lexicalEntry.senses));
        for (const sense of array(lexicalEntry.senses)) synonyms.push(...array(sense?.synonyms).map(item => text(item?.text, 80)));
      }
      meanings.push({ partOfSpeech: text(lexical.lexicalCategory?.text || lexical.lexicalCategory?.id, 60), definitions: definitions.slice(0, 8), synonyms: unique(synonyms).slice(0, 8) });
    }
  }
  return result(word, 'oxford', pronunciations, meanings);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', pound: '£', eacute: 'é' };
function decodeEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (full, name) => {
    if (name[0] !== '#') return ENTITIES[name] ?? full;
    const code = name[1]?.toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
  });
}

// An inert, deliberately bounded HTML token tree, not a browser DOM. The parser
// only extracts text/HTTPS URLs from known dictionary classes; script/style and
// arbitrary markup are never executed or rendered. Unknown layouts fail closed.
function parseEntryMarkup(markup) {
  const root = { tag: 'root', classes: [], attrs: {}, children: [], parent: null, index: 0 };
  const stack = [root];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const tokens = markup.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g) || [];
  if (tokens.length > 30_000) throw new Error('Markup too complex.');
  let index = 0;
  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<!') || token.startsWith('<?')) continue;
    if (token.startsWith('</')) {
      const tag = token.match(/^<\/\s*([\w:-]+)/)?.[1]?.toLowerCase();
      const at = stack.findLastIndex(node => node.tag === tag);
      if (at > 0) stack.length = at;
      continue;
    }
    if (token.startsWith('<')) {
      const tag = token.match(/^<\s*([\w:-]+)/)?.[1]?.toLowerCase();
      if (!tag) continue;
      const attrs = {};
      for (const match of token.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
      const parent = stack.at(-1);
      const node = { tag, classes: (attrs.class || '').split(/\s+/), attrs, children: [], parent, index: ++index };
      parent.children.push(node);
      if (!voidTags.has(tag) && !token.endsWith('/>') && stack.length < 80) stack.push(node);
    } else {
      stack.at(-1).children.push({ tag: '#text', value: decodeEntities(token), parent: stack.at(-1), index: ++index });
    }
  }
  return root;
}

const has = (node, names) => names.some(name => node.classes?.includes(name) || node.tag === name);
const blocked = node => ['script', 'style', 'iframe', 'noscript'].includes(node.tag);
function descendants(node, predicate) {
  const result = [];
  function walk(item) {
    if (blocked(item)) return;
    if (predicate(item)) result.push(item);
    for (const child of item.children || []) walk(child);
  }
  walk(node);
  return result;
}
function nodeText(node, exclude = () => false) {
  if (blocked(node) || exclude(node)) return '';
  if (node.tag === '#text') return node.value;
  return (node.children || []).map(child => nodeText(child, exclude)).join(' ');
}
function closest(node, predicate) {
  for (let parent = node.parent; parent; parent = parent.parent) if (predicate(parent)) return parent;
  return null;
}
const DEF = ['def', 'ddef_d', 'definition'];
const TRANS = ['trans', 'dtrans', 'translation'];
const EXAMPLE = ['eg', 'examp', 'dexamp', 'example'];

export function normalizeCambridge(word, payload) {
  const markup = payload?.entryContent;
  if (typeof markup !== 'string' || markup.length > MAX_BODY_BYTES) return providerError(word, 'cambridge', 'unsupported-format', '剑桥返回了暂不支持的词条格式，请打开原词典查看。');
  try {
    const tree = parseEntryMarkup(markup);
    const definitions = descendants(tree, node => has(node, DEF)).filter(node => !closest(node, parent => has(parent, DEF)));
    const posNodes = descendants(tree, node => has(node, ['pos', 'dpos']));
    const meanings = new Map();
    for (const definitionNode of definitions.slice(0, 48)) {
      const definition = text(nodeText(definitionNode, node => has(node, TRANS) || has(node, EXAMPLE)));
      if (!definition) continue;
      const block = closest(definitionNode, node => has(node, ['def-block', 'ddef_block', 'sense', 'sense-block'])) || definitionNode.parent;
      const entry = closest(definitionNode, node => has(node, ['entry-body__el', 'entry', 'entry-body', 'pos-block'])) || tree;
      const pos = posNodes.filter(node => node.index < definitionNode.index && (entry === tree || closest(node, candidate => candidate === entry))).at(-1);
      const partOfSpeech = pos ? text(nodeText(pos), 60) : '';
      const translations = descendants(block, node => has(node, TRANS)).filter(node => !closest(node, parent => has(parent, TRANS) || has(parent, EXAMPLE))).map(node => text(nodeText(node)));
      const examples = descendants(block, node => has(node, EXAMPLE)).filter(node => !closest(node, parent => has(parent, EXAMPLE))).slice(0, 3).map(node => ({ text: text(nodeText(node, item => has(item, TRANS))), translation: descendants(node, item => has(item, TRANS)).map(item => text(nodeText(item))).join('；') })).filter(item => item.text);
      const usage = unique(descendants(block, node => has(node, ['usage', 'dusage', 'gram', 'dgram', 'lab', 'dlab'])).map(node => text(nodeText(node), 180))).join(' · ');
      if (!meanings.has(partOfSpeech)) meanings.set(partOfSpeech, { partOfSpeech, definitions: [], synonyms: [] });
      meanings.get(partOfSpeech).definitions.push({ definition, translation: unique(translations).join('；'), examples, usage });
    }
    const pronunciations = descendants(tree, node => has(node, ['ipa', 'dipa', 'phon', 'pron'])).slice(0, 6).map(node => {
      const region = closest(node, parent => has(parent, ['uk', 'us', 'ukpron', 'uspron']));
      const label = region && has(region, ['us', 'uspron']) ? 'US' : region ? 'UK' : 'EN';
      const scope = region || node.parent;
      const audio = descendants(scope, item => item.tag === 'source' || item.tag === 'audio').map(item => safeHttps(item.attrs?.src || item.attrs?.['data-src-mp3'])).find(Boolean) || '';
      return { label, phonetic: text(nodeText(node), 120), audio };
    });
    const sourceUrl = safeHttps(payload.entryUrl);
    // Canonical Cambridge URLs only. A malformed upstream response must not
    // turn its source button into a link to an unrelated site.
    const normalized = result(word, 'cambridge', pronunciations, [...meanings.values()], sourceUrl && new URL(sourceUrl).hostname === 'dictionary.cambridge.org' ? sourceUrl : '');
    const copyright = text(payload.copyright || descendants(tree, node => has(node, ['copyright', 'dcopy', 'copyrightText'])).map(node => nodeText(node)).join(' '), 1000);
    if (copyright) normalized.source.copyright = copyright;
    return normalized;
  } catch {
    return providerError(word, 'cambridge', 'unsupported-format', '剑桥词条暂时无法解析，请打开原词典查看。');
  }
}
