/* Language profiles shared by selection, lookup and card presentation. */
(() => {
  'use strict';
  const ENGLISH_PROVIDERS = Object.freeze(['free', 'demo', 'oxford', 'cambridge']);
  const PROVIDERS = Object.freeze(['smart', 'wiktionary', ...ENGLISH_PROVIDERS]);
  const han = /^[\p{Unified_Ideograph}〇]+$/u;
  const latin = /^[a-z]+(?:['-][a-z]+)*$/i;
  const chinese = region => ({
    id: `zh-${region}`, language: 'zh', region, family: 'zh', regional: true,
    scripts: ['Han'], matches: value => han.test(value), maximumCharacters: 32,
    normalize: value => value, runs: '[\\p{Unified_Ideograph}〇]+', segment: 'word',
    contentTest: value => /[\p{Script=Han}]/u.test(value),
    adapter: 'chinese', catalog: region === 'CN' ? 'zh_CN' : 'zh_TW',
    readingSystem: region === 'CN' ? 'pinyin' : region === 'HK' ? 'jyutping' : 'bopomofo',
    speechLocale: `zh-${region}`, presentation: { bilingual: true, maxExamples: 2, headings: true, notFoundKey: 'notFoundChinese' },
    uiMatches: region === 'HK' ? tag => /(?:^yue|-(?:hk|mo)(?:-|$))/.test(tag)
      : region === 'TW' ? tag => /-tw(?:-|$)|^zh-hant(?:$|-)/.test(tag)
        : tag => /^zh(?:-|$)/.test(tag)
  });
  const DEFAULT_PROFILES = Object.freeze([
    Object.freeze({
      id: 'en', language: 'en', family: 'en', scripts: ['Latin'],
      matches: value => latin.test(value), normalize: value => value.toLowerCase(), maximumCharacters: 48,
      runs: "[a-z]+(?:['-][a-z]+)*", segment: 'whole', catalog: 'en',
      readingSystem: 'ipa', speechLocale: 'en-US', uiMatches: tag => /^en(?:-|$)/.test(tag),
      readingLocale: sound => /\bUK\b|British/i.test(sound?.label || '') ? 'en-GB' : 'en-US',
      selectAdapter: ({ settings, ui }) => ui.language === 'en'
        ? ENGLISH_PROVIDERS.includes(settings.englishProvider) ? settings.englishProvider : 'free'
        : PROVIDERS.includes(settings.provider) ? settings.provider : 'smart',
      localizeForUi: ui => ui.language === 'zh',
      presentation: { bilingual: false, maxExamples: 4, headings: false, notFoundKey: 'notFound' }
    }),
    // Specific UI regions precede the generic Chinese UI fallback.
    Object.freeze(chinese('HK')), Object.freeze(chinese('TW')), Object.freeze(chinese('CN'))
  ]);

  function createLanguageRegistry(definitions = DEFAULT_PROFILES, { fallbackUi = 'zh-CN' } = {}) {
    const profiles = new Map();
    const segmenters = new Map();
    function register(definition) {
      if (!definition || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(definition.id || '')
        || !/^[a-z]{2,3}$/.test(definition.language || '') || typeof definition.matches !== 'function') throw new TypeError('Invalid language profile.');
      if (profiles.has(definition.id)) throw new Error(`Duplicate language profile: ${definition.id}`);
      profiles.set(definition.id, Object.freeze({ ...definition, presentation: Object.freeze({ ...definition.presentation }) }));
      return api;
    }
    const clean = value => typeof value === 'string' && value.length <= 1000
      ? value.trim().normalize('NFKC').replace(/[’‘]/g, "'") : '';
    function matching(value, { selection = false } = {}) {
      const candidate = clean(value);
      if (!candidate || /\s|[<>\x00-\x1f\x7f]/u.test(candidate)) return null;
      for (const profile of profiles.values()) {
        const word = profile.normalize ? profile.normalize(candidate) : candidate;
        if (typeof word === 'string' && (selection || Array.from(word).length <= (profile.maximumCharacters || 48)) && profile.matches(word)) return { profile, word };
      }
      return null;
    }
    function normalizeWord(value) { return matching(value)?.word || ''; }
    function wordLanguage(value) { return matching(value)?.profile.language || ''; }
    function uiProfile(language = 'zh-CN', override = 'auto') {
      const tag = String(language).replaceAll('_', '-').toLowerCase();
      const selected = [...profiles.values()].find(profile => profile.uiMatches?.(tag)) || profiles.get(fallbackUi) || profiles.values().next().value;
      const chineseRegion = ['CN', 'HK', 'TW'].includes(override) ? override : selected.region || 'CN';
      const regional = profiles.get(`zh-${chineseRegion}`);
      const display = selected.language === 'zh' ? regional || selected : selected;
      return Object.freeze({
        id: selected.id, language: selected.language, region: chineseRegion,
        catalog: display.catalog || selected.catalog || 'en',
        tag: selected.language === 'zh' ? display.id : selected.id,
        traditional: selected.language === 'zh' && chineseRegion !== 'CN',
        speechLanguage: regional?.speechLocale || selected.speechLocale || 'en-US'
      });
    }
    function wordProfile(value, { uiLanguage = 'zh-CN', region = 'auto' } = {}) {
      const match = matching(value);
      if (!match) return null;
      if (!match.profile.regional) return match.profile;
      const requestedRegion = uiProfile(uiLanguage, region).region;
      return [...profiles.values()].find(profile => profile.family === match.profile.family && profile.region === requestedRegion) || match.profile;
    }
    function entryProfile(entry = {}) {
      if (profiles.has(entry.profileId)) return profiles.get(entry.profileId);
      return [...profiles.values()].find(profile => profile.language === entry.language && (!profile.regional || profile.region === (entry.region || 'CN')))
        || profiles.get('en') || profiles.values().next().value;
    }
    function segment(value, uiLanguage = 'zh-CN') {
      const match = matching(value, { selection: true });
      if (!match) return [];
      if (match.profile.segment !== 'word') return normalizeWord(match.word) ? [match.word] : [];
      try {
        const key = `${match.profile.language}:${uiLanguage}`;
        if (!segmenters.has(key)) segmenters.set(key, new Intl.Segmenter(uiLanguage, { granularity: 'word' }));
        return [...segmenters.get(key).segment(match.word)].filter(item => item.isWordLike).map(item => normalizeWord(item.segment)).filter(Boolean);
      } catch { return [match.word]; }
    }
    function splitToken(value, uiLanguage = 'zh-CN') {
      if (matching(value, { selection: true })) return segment(value, uiLanguage);
      const patterns = [...new Set([...profiles.values()].map(profile => profile.runs).filter(Boolean))];
      if (!patterns.length) return [];
      const runs = value.match(new RegExp(patterns.map(pattern => `(?:${pattern})`).join('|'), 'giu')) || [];
      // Never turn a partially supported token, URL or identifier into a word.
      if (runs.join('').toLowerCase() !== value.toLowerCase()) return [];
      return runs.flatMap(run => segment(run, uiLanguage));
    }
    function contentLanguage(value, fallback) {
      // Non-Latin scripts identify their language more reliably than Latin text.
      return [...profiles.values()].find(profile => profile.contentTest?.(value))?.language || fallback;
    }
    function lookupContext(word, { settings = {}, uiLanguage = 'zh-CN' } = {}) {
      const profile = wordProfile(word, { uiLanguage, region: settings.chineseRegion });
      if (!profile) return null;
      const ui = uiProfile(uiLanguage, settings.chineseRegion);
      return {
        word: normalizeWord(word), profile, ui, uiLanguage,
        language: profile.language, region: profile.region || '',
        adapterId: profile.selectAdapter?.({ settings, ui }) || profile.adapter,
        settings
      };
    }
    const api = Object.freeze({
      register, get: id => profiles.get(id), all: () => [...profiles.values()],
      normalizeWord, wordLanguage, uiProfile, wordProfile, entryProfile, segment, splitToken, contentLanguage, lookupContext
    });
    for (const definition of definitions) register(definition);
    return api;
  }
  const registry = createLanguageRegistry();
  globalThis.LexiLoomLanguages = Object.freeze({ registry, createLanguageRegistry, DEFAULT_PROFILES, PROVIDERS, ENGLISH_PROVIDERS });
})();
