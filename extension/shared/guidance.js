/* URL guidance directory: link-only dictionary sites selected by headword
   language, dictionary region and interface language. Nothing in this module
   fetches a third-party page or extracts text; the card only renders links. */
(() => {
  'use strict';
  const PLACEHOLDER = '{word}';
  const MAX_LINKS = 3;
  const MAX_CUSTOM = 6;
  const MAX_TEMPLATE = 300;
  const MAX_NAME = 60;
  const MAX_WORD = 64;
  const LANGUAGES = Object.freeze(['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es']);
  const REGIONS = Object.freeze(['CN', 'HK', 'TW']);
  const CONTROL = /[\u0000-\u001f\u007f]/g;

  // mode is always "link-only": the extension never reads the linked page.
  const BUILTIN = Object.freeze([
    Object.freeze({ id: 'zh-youdao-en', language: 'en', uiLanguages: Object.freeze(['zh']), priority: 8,
      name: '有道词典', nameTraditional: '有道詞典', urlTemplate: 'https://dict.youdao.com/result?word={word}&lang=en',
      mode: 'link-only', license: '' }),
    Object.freeze({ id: 'en-wiktionary', language: 'en', priority: 10,
      name: 'Wiktionary', nameTraditional: '維基詞典', urlTemplate: 'https://en.wiktionary.org/wiki/{word}',
      mode: 'link-only', license: 'CC BY-SA 4.0' }),
    Object.freeze({ id: 'en-cambridge-zh', language: 'en', uiLanguages: Object.freeze(['zh']), regions: Object.freeze(['CN']), priority: 12,
      name: '剑桥英汉', nameTraditional: '劍橋英漢', urlTemplate: 'https://dictionary.cambridge.org/dictionary/english-chinese-simplified/{word}',
      mode: 'link-only', license: '' }),
    Object.freeze({ id: 'en-cambridge-zh-trad', language: 'en', uiLanguages: Object.freeze(['zh']), regions: Object.freeze(['HK', 'TW']), priority: 12,
      name: '剑桥英汉', nameTraditional: '劍橋英漢', urlTemplate: 'https://dictionary.cambridge.org/dictionary/english-chinese-traditional/{word}',
      mode: 'link-only', license: '' }),
    Object.freeze({ id: 'en-oxford-learner', language: 'en', priority: 20,
      name: "Oxford Learner's Dictionaries", nameTraditional: "Oxford Learner's Dictionaries", urlTemplate: 'https://www.oxfordlearnersdictionaries.com/definition/english/{word}',
      mode: 'link-only', license: '' }),
    Object.freeze({ id: 'en-cambridge', language: 'en', priority: 20,
      name: 'Cambridge Dictionary', nameTraditional: '劍橋詞典', urlTemplate: 'https://dictionary.cambridge.org/dictionary/english/{word}',
      mode: 'link-only', license: '' }),
    Object.freeze({ id: 'en-merriam-webster', language: 'en', priority: 30,
      name: 'Merriam-Webster', nameTraditional: 'Merriam-Webster', urlTemplate: 'https://www.merriam-webster.com/dictionary/{word}',
      mode: 'link-only', license: '' }),
    Object.freeze({ id: 'zh-bing-dict', language: 'en', uiLanguages: Object.freeze(['zh']), regions: Object.freeze(['CN']), priority: 30,
      name: '必应词典', nameTraditional: '必應詞典', urlTemplate: 'https://cn.bing.com/dict/{word}',
      mode: 'link-only', license: '' }),
    Object.freeze({ id: 'zh-moedict', language: 'zh', regions: Object.freeze(['TW']), priority: 8,
      name: '萌典', nameTraditional: '萌典', urlTemplate: 'https://www.moedict.tw/{word}',
      mode: 'link-only', license: 'CC BY-ND 3.0 TW' }),
    Object.freeze({ id: 'zh-zdic-hans', language: 'zh', regions: Object.freeze(['CN']), priority: 8,
      name: '汉典', nameTraditional: '漢典', urlTemplate: 'https://www.zdic.net/hans/{word}',
      mode: 'link-only', license: '' }),
    Object.freeze({ id: 'zh-wiktionary', language: 'zh', priority: 10,
      name: '中文维基词典', nameTraditional: '中文維基詞典', urlTemplate: 'https://zh.wiktionary.org/wiki/{word}',
      mode: 'link-only', license: 'CC BY-SA 4.0' }),
    Object.freeze({ id: 'zh-zdic-hant', language: 'zh', regions: Object.freeze(['HK', 'TW']), priority: 12,
      name: '汉典', nameTraditional: '漢典', urlTemplate: 'https://www.zdic.net/hant/{word}',
      mode: 'link-only', license: '' }),
    Object.freeze({ id: 'zh-words-hk', language: 'zh', regions: Object.freeze(['HK']), priority: 8,
      name: '粤典', nameTraditional: '粵典', urlTemplate: 'https://words.hk/zidin/{word}',
      mode: 'link-only', license: '' }),
    Object.freeze({ id: 'zh-youdao', language: 'zh', priority: 20,
      name: '有道词典', nameTraditional: '有道詞典', urlTemplate: 'https://dict.youdao.com/result?word={word}&lang=zh',
      mode: 'link-only', license: '' }),
    Object.freeze({ id: 'zh-baidu-hanyu', language: 'zh', regions: Object.freeze(['CN']), priority: 30,
      name: '百度汉语', nameTraditional: '百度漢語', urlTemplate: 'https://hanyu.baidu.com/s?wd={word}',
      mode: 'link-only', license: '' }),
    Object.freeze({ id: 'ja-wiktionary', language: 'ja', priority: 10,
      name: '日本語ウィクショナリー', urlTemplate: 'https://ja.wiktionary.org/wiki/{word}',
      mode: 'link-only', license: 'CC BY-SA 4.0' }),
    Object.freeze({ id: 'ko-wiktionary', language: 'ko', priority: 10,
      name: '위키낱말사전', urlTemplate: 'https://ko.wiktionary.org/wiki/{word}',
      mode: 'link-only', license: 'CC BY-SA 4.0' }),
    Object.freeze({ id: 'fr-wiktionary', language: 'fr', priority: 10,
      name: 'Wiktionnaire', urlTemplate: 'https://fr.wiktionary.org/wiki/{word}',
      mode: 'link-only', license: 'CC BY-SA 4.0' }),
    Object.freeze({ id: 'fr-larousse', language: 'fr', priority: 20,
      name: 'Larousse', urlTemplate: 'https://www.larousse.fr/dictionnaires/francais/{word}',
      mode: 'link-only', license: '' }),
    Object.freeze({ id: 'de-wiktionary', language: 'de', priority: 10,
      name: 'Wiktionary (Deutsch)', urlTemplate: 'https://de.wiktionary.org/wiki/{word}',
      mode: 'link-only', license: 'CC BY-SA 4.0' }),
    Object.freeze({ id: 'de-duden', language: 'de', priority: 20,
      name: 'Duden', urlTemplate: 'https://www.duden.de/suchen/dudenonline/{word}',
      mode: 'link-only', license: '' }),
    Object.freeze({ id: 'es-wiktionary', language: 'es', priority: 10,
      name: 'Wikcionario', urlTemplate: 'https://es.wiktionary.org/wiki/{word}',
      mode: 'link-only', license: 'CC BY-SA 4.0' }),
    Object.freeze({ id: 'es-rae', language: 'es', priority: 20,
      name: 'Diccionario de la lengua española · RAE', urlTemplate: 'https://dle.rae.es/{word}',
      mode: 'link-only', license: '' })
  ]);
  const BUILTIN_IDS = Object.freeze(BUILTIN.map(entry => entry.id));

  function wordText(value) {
    if (typeof value !== 'string' || value.replace(CONTROL, '') !== value) return '';
    const trimmed = value.trim();
    return Array.from(trimmed).length <= MAX_WORD ? trimmed : '';
  }

  function uiTag(value) {
    return /^en(?:[-_]|$)/i.test(String(value || '')) ? 'en' : 'zh';
  }

  function headword(entry) {
    if (!entry || typeof entry !== 'object') return '';
    const candidate = typeof entry.displayWord === 'string' && entry.displayWord.trim() ? entry.displayWord : entry.word;
    const value = wordText(candidate);
    return /[\p{L}\p{N}]/u.test(value) ? value : '';
  }

  function checkTemplate(template) {
    const raw = typeof template === 'string' ? template.trim() : '';
    if (raw.length > MAX_TEMPLATE) return { ok: false, error: 'template_length' };
    if (!raw.startsWith('https://') || !raw.includes(PLACEHOLDER)) return { ok: false, error: 'template' };
    if (template.replace(CONTROL, '') !== template || raw.includes('\\')) return { ok: false, error: 'url' };
    const withoutPlaceholder = raw.split(PLACEHOLDER).join('');
    if (/[{}]/.test(withoutPlaceholder)) return { ok: false, error: 'placeholder' };
    // A lookup changes a path, query or fragment, never the site's authority.
    // Validate this before substitution; a sample word would make a hostname
    // placeholder look like a perfectly valid HTTPS address.
    const authority = raw.slice('https://'.length).split(/[/?#]/, 1)[0];
    if (authority.includes(PLACEHOLDER)) return { ok: false, error: 'authority' };
    try {
      const url = new URL(raw.split(PLACEHOLDER).join('word'));
      if (url.protocol !== 'https:' || url.username || url.password) return { ok: false, error: 'url' };
      return { ok: true, raw, origin: url.origin };
    } catch { return { ok: false, error: 'url' }; }
  }

  function fill(template, word) {
    const target = wordText(word);
    const checked = checkTemplate(template);
    if (!target || !checked.ok) return '';
    try {
      const url = new URL(checked.raw.split(PLACEHOLDER).join(encodeURIComponent(target)));
      return url.origin === checked.origin && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }

  function validateTemplate(name, template, language) {
    const rawName = typeof name === 'string' ? name.trim() : '';
    if (Array.from(rawName).length > MAX_NAME) return { ok: false, error: 'name_length' };
    const siteName = rawName;
    if (!siteName) return { ok: false, error: 'name' };
    if (name.replace(CONTROL, '') !== name || siteName.includes('|')) return { ok: false, error: 'name' };
    const checked = checkTemplate(template);
    if (!checked.ok) return { ok: false, error: checked.error };
    const value = { name: siteName, template: checked.raw };
    if (language !== undefined) {
      const tag = typeof language === 'string' ? language.trim().toLowerCase() : '';
      if (tag !== '*' && !LANGUAGES.includes(tag)) return { ok: false, error: 'language' };
      value.language = tag;
    }
    return { ok: true, value: Object.freeze(value) };
  }

  // SAVE_SETTINGS uses strict validation so the user cannot lose rows through
  // sanitization. Reading older or malformed storage remains tolerant below.
  // `index` is zero-based; a non-array has no item index.
  function validateCustom(items) {
    if (!Array.isArray(items)) return { ok: false, error: 'custom', index: -1 };
    if (items.length > MAX_CUSTOM) return { ok: false, error: 'limit', index: MAX_CUSTOM };
    const custom = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, error: 'item', index };
      const checked = validateTemplate(item.name, item.template, item.language);
      if (!checked.ok) return { ok: false, error: checked.error, index };
      custom.push(checked.value);
    }
    return { ok: true, custom };
  }

  function sanitize(settings = {}) {
    const source = settings && typeof settings === 'object' ? settings : {};
    const guidance = source.guidance && typeof source.guidance === 'object' ? source.guidance : {};
    const disabledSource = Array.isArray(source.guidanceDisabled) ? source.guidanceDisabled : guidance.disabled;
    const customSource = Array.isArray(source.guidanceCustom) ? source.guidanceCustom : guidance.custom;
    const disabled = Array.isArray(disabledSource)
      ? [...new Set(disabledSource.filter(id => typeof id === 'string' && BUILTIN_IDS.includes(id)))]
      : [];
    const custom = [];
    for (const item of Array.isArray(customSource) ? customSource.slice(0, MAX_CUSTOM) : []) {
      const checked = validateTemplate(item?.name, item?.template, item?.language);
      if (checked.ok) custom.push(checked.value);
    }
    return { disabled, custom };
  }

  function publicSettings(settings = {}) {
    const state = sanitize(settings);
    return { disabled: state.disabled, custom: state.custom.map(item => ({ ...item })) };
  }

  function parseCustom(text) {
    const custom = [];
    const invalid = [];
    const lines = typeof text === 'string' ? text.split(/\r?\n/) : [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const at = line.indexOf('|');
      const rest = at < 0 ? '' : line.slice(at + 1);
      const second = rest.indexOf('|');
      // Preserve the old two-field format, including literal pipes in an HTTPS
      // URL. New entries can scope the same template syntax to a language.
      const scoped = second >= 0 && !/^\s*https?:\/\//i.test(rest);
      const language = scoped ? line.slice(0, at) : undefined;
      const name = scoped ? rest.slice(0, second) : at < 0 ? '' : line.slice(0, at);
      const template = scoped ? rest.slice(second + 1) : rest;
      const checked = validateTemplate(name, template, language);
      if (checked.ok && custom.length >= MAX_CUSTOM) invalid.push({ line: index + 1, name: checked.value.name, error: 'limit' });
      else if (checked.ok) custom.push(checked.value);
      else invalid.push({ line: index + 1, name: name || line.slice(0, MAX_NAME), error: checked.error });
    }
    return { custom, invalid };
  }

  function resolve(entry = {}, options = {}) {
    const target = headword(entry);
    if (!target) return [];
    const settings = options.settings && typeof options.settings === 'object' ? options.settings : {};
    const state = sanitize(settings);
    const ui = uiTag(options.uiLanguage);
    const language = typeof entry.language === 'string' && /^[a-z]{2,3}$/i.test(entry.language) ? entry.language.toLowerCase() : '';
    const region = REGIONS.includes(entry.region) ? entry.region : REGIONS.includes(options.uiRegion) ? options.uiRegion : '';
    const limit = options.limit === Infinity || (Number.isInteger(options.limit) && options.limit >= 0) ? options.limit : MAX_LINKS;
    if (limit === 0) return [];
    const candidates = state.custom.map((item, index) => ({
      id: 'custom-' + (index + 1), language: item.language || '*', priority: 0, custom: true,
      name: item.name, nameTraditional: item.name, urlTemplate: item.template, mode: 'link-only', license: ''
    })).filter(item => item.language === '*' || item.language === language);
    for (const item of BUILTIN) {
      if (state.disabled.includes(item.id)) continue;
      if (item.language !== language) continue;
      if (item.uiLanguages && !item.uiLanguages.includes(ui)) continue;
      if (item.regions && !(region && item.regions.includes(region))) continue;
      candidates.push(item);
    }
    candidates.sort((a, b) => a.priority - b.priority);
    const links = [];
    const seen = new Set();
    for (const item of candidates) {
      const url = fill(item.urlTemplate, target);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      let host = '';
      try { host = new URL(url).hostname; } catch { host = ''; }
      links.push(Object.freeze({
        id: item.id, name: item.name, nameTraditional: item.nameTraditional || item.name,
        url, host, custom: Boolean(item.custom), mode: item.mode || 'link-only', license: item.license || ''
      }));
      if (links.length >= limit) break;
    }
    return links;
  }

  function resolveAll(entry = {}, options = {}) {
    return resolve(entry, { ...options, limit: Infinity });
  }

  function displayName(link, traditional = false) {
    if (!link) return '';
    return traditional && link.nameTraditional ? link.nameTraditional : link.name;
  }

  globalThis.LexiLoomGuidance = Object.freeze({
    PLACEHOLDER, MAX_LINKS, MAX_CUSTOM, MAX_TEMPLATE, MAX_NAME,
    supportedLanguages: () => [...LANGUAGES],
    builtins: () => BUILTIN, builtinIds: () => [...BUILTIN_IDS],
    fill, validateTemplate, validateCustom, sanitize, publicSettings, parseCustom, resolve, resolveAll, displayName
  });
})();
