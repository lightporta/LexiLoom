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
      mode: 'link-only', license: '' })
  ]);
  const BUILTIN_IDS = Object.freeze(BUILTIN.map(entry => entry.id));

  function clean(value, limit) {
    return typeof value === 'string' ? value.replace(CONTROL, '').trim().slice(0, limit) : '';
  }

  function uiTag(value) {
    return /^en(?:[-_]|$)/i.test(String(value || '')) ? 'en' : 'zh';
  }

  function headword(entry) {
    if (!entry || typeof entry !== 'object') return '';
    const value = clean(entry.displayWord, MAX_WORD) || clean(entry.word, MAX_WORD);
    return /[\p{L}\p{N}]/u.test(value) ? value : '';
  }

  function fill(template, word) {
    const target = clean(word, MAX_WORD);
    if (typeof template !== 'string' || !target || !template.includes(PLACEHOLDER)) return '';
    let url;
    try {
      url = new URL(template.split(PLACEHOLDER).join(encodeURIComponent(target)));
    } catch { return ''; }
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  }

  function validateTemplate(name, template) {
    const siteName = clean(name, MAX_NAME);
    const raw = clean(template, MAX_TEMPLATE);
    if (!siteName) return { ok: false, error: 'name' };
    if (!raw.startsWith('https://') || !raw.includes(PLACEHOLDER)) return { ok: false, error: 'template' };
    const withoutPlaceholder = raw.split(PLACEHOLDER).join('');
    if (/[{}]/.test(withoutPlaceholder)) return { ok: false, error: 'placeholder' };
    if (!fill(raw, 'word')) return { ok: false, error: 'url' };
    return { ok: true, value: Object.freeze({ name: siteName, template: raw }) };
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
      const checked = validateTemplate(item?.name, item?.template);
      if (checked.ok) custom.push(checked.value);
    }
    return { disabled, custom };
  }

  function publicSettings(settings = {}) {
    const state = sanitize(settings);
    return { disabled: state.disabled, custom: state.custom.map(item => ({ name: item.name, template: item.template })) };
  }

  function parseCustom(text) {
    const custom = [];
    const invalid = [];
    const lines = typeof text === 'string' ? text.split(/\r?\n/) : [];
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index].trim();
      if (!line || line.startsWith('#')) continue;
      const at = line.indexOf('|');
      const name = at < 0 ? '' : clean(line.slice(0, at), MAX_NAME);
      const template = at < 0 ? '' : clean(line.slice(at + 1), MAX_TEMPLATE);
      const checked = validateTemplate(name, template);
      if (checked.ok) custom.push(checked.value);
      else invalid.push({ line: index + 1, name: name || line.slice(0, MAX_NAME), error: checked.error });
    }
    return { custom: custom.slice(0, MAX_CUSTOM), invalid };
  }

  function resolve(entry = {}, options = {}) {
    const target = headword(entry);
    if (!target) return [];
    const settings = options.settings && typeof options.settings === 'object' ? options.settings : {};
    const state = sanitize(settings);
    const ui = uiTag(options.uiLanguage);
    const language = typeof entry.language === 'string' && /^[a-z]{2,3}$/.test(entry.language) ? entry.language : 'en';
    const region = REGIONS.includes(entry.region) ? entry.region : REGIONS.includes(options.uiRegion) ? options.uiRegion : '';
    const candidates = state.custom.map((item, index) => ({
      id: 'custom-' + (index + 1), language: '*', priority: 0, custom: true,
      name: item.name, nameTraditional: item.name, urlTemplate: item.template, mode: 'link-only', license: ''
    }));
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
      if (links.length >= MAX_LINKS) break;
    }
    return links;
  }

  function displayName(link, traditional = false) {
    if (!link) return '';
    return traditional && link.nameTraditional ? link.nameTraditional : link.name;
  }

  globalThis.LexiLoomGuidance = Object.freeze({
    PLACEHOLDER, MAX_LINKS, MAX_CUSTOM, MAX_TEMPLATE, MAX_NAME,
    builtins: () => BUILTIN, builtinIds: () => [...BUILTIN_IDS],
    fill, validateTemplate, sanitize, publicSettings, parseCustom, resolve, displayName
  });
})();
