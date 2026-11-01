/* The view-model boundary: adapters do not send arbitrary response fields to pages. */
(() => {
  'use strict';
  const list = value => Array.isArray(value) ? value : [];
  const text = (value, maximum = 8000) => typeof value === 'string' ? value.slice(0, maximum) : '';
  const language = value => /^[a-z]{2,3}$/.test(value || '') ? value : '';
  const locale = value => /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value || '') ? value : '';
  function safeHttps(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
    catch { return ''; }
  }
  function license(value) {
    const url = safeHttps(value?.url), name = text(value?.name, 200);
    return url && name ? { name, url } : undefined;
  }
  function source(value = {}, depth = 0) {
    const output = { id: text(value?.id, 100), name: text(value?.name, 300), url: safeHttps(value?.url) };
    if (text(value?.copyright, 2000)) output.copyright = text(value.copyright, 2000);
    const permitted = license(value?.license); if (permitted) output.license = permitted;
    const sourceUrls = [...new Set(list(value?.sourceUrls).map(safeHttps).filter(Boolean))].slice(0, 12);
    if (sourceUrls.length) output.sourceUrls = sourceUrls;
    if (!depth && list(value?.components).length) output.components = value.components.slice(0, 8).map(item => source(item, depth + 1));
    return output;
  }
  function normalizeDictionaryEntry(raw, context = {}) {
    const registry = context.registry || globalThis.LexiLoomLanguages?.registry;
    const profile = context.profile || registry?.entryProfile(raw || {});
    const entryLanguage = language(context.language || profile?.language || raw?.language) || 'en';
    const word = text(context.word || raw?.word, 64);
    const region = /^[A-Z]{2,3}$/.test(context.region || raw?.region || '') ? context.region || raw.region : '';
    const base = {
      word, displayWord: text(raw?.displayWord || word, 64), lemma: text(raw?.lemma || raw?.queryWord || word, 64),
      language: entryLanguage, region, profileId: profile?.id || entryLanguage,
      status: ['ok', 'not-found', 'error'].includes(raw?.status) ? raw.status : 'error',
      phonetic: text(raw?.phonetic, 300), pronunciations: [], meanings: [], source: source(raw?.source)
    };
    if (raw?.queryWord) base.queryWord = text(raw.queryWord, 64);
    const queryWords = [...new Set(list(raw?.queryWords).filter(item => typeof item === 'string').map(item => text(item, 64)))].slice(0, 8);
    if (queryWords.length) base.queryWords = queryWords;
    if (text(raw?.notice, 4000)) base.notice = text(raw.notice, 4000);
    if (/^[A-Za-z0-9_]+$/.test(raw?.noticeKey || '')) base.noticeKey = raw.noticeKey;
    if (raw?.scriptConversion) base.scriptConversion = {
      engine: text(raw.scriptConversion.engine, 100), appliesTo: text(raw.scriptConversion.appliesTo, 1000)
    };
    if (base.status === 'not-found') return base;
    if (base.status === 'error') {
      base.error = {
        code: /^[a-z0-9_-]{1,80}$/i.test(raw?.error?.code || '') ? raw.error.code : 'unsupported-format',
        message: text(raw?.error?.message, 2000) || 'The dictionary did not return a usable entry.'
      };
      return base;
    }
    base.pronunciations = list(raw?.pronunciations).slice(0, 8).map(item => {
      const sound = { label: text(item?.label, 200), phonetic: text(item?.phonetic, 300), audio: safeHttps(item?.audio) };
      const speechLocale = locale(item?.locale) || profile?.readingLocale?.(item) || profile?.speechLocale;
      if (locale(speechLocale)) sound.locale = speechLocale;
      const attributionUrl = safeHttps(item?.attributionUrl); if (attributionUrl) sound.attributionUrl = attributionUrl;
      const sourceUrl = safeHttps(item?.sourceUrl); if (sourceUrl) sound.sourceUrl = sourceUrl;
      const permitted = license(item?.license); if (permitted) sound.license = permitted;
      return sound;
    }).filter(item => item.phonetic || item.audio);
    base.meanings = list(raw?.meanings).slice(0, 12).map(meaning => {
      const definitions = list(meaning?.definitions).slice(0, 8).map(definition => {
        const normalized = { definition: text(definition?.definition), examples: list(definition?.examples).slice(0, 4).map(example => {
          const normalized = { text: text(example?.text) };
          for (const key of ['translation', 'reference', 'roman']) if (text(example?.[key])) normalized[key] = text(example[key]);
          return normalized;
        }).filter(example => example.text) };
        for (const key of ['translation', 'usage']) if (text(definition?.[key])) normalized[key] = text(definition[key]);
        return normalized;
      }).filter(definition => definition.definition);
      const output = {
        language: language(meaning?.language) || registry?.contentLanguage(definitions[0]?.definition || '', entryLanguage) || entryLanguage,
        partOfSpeech: text(meaning?.partOfSpeech, 100), definitions,
        synonyms: list(meaning?.synonyms).filter(item => typeof item === 'string').slice(0, 10).map(item => text(item, 120))
      };
      for (const key of ['origin', 'heading']) if (text(meaning?.[key], 300)) output[key] = text(meaning[key], 300);
      return output;
    }).filter(meaning => meaning.definitions.length);
    if (!base.meanings.length) return { ...base, status: 'error', error: { code: 'unsupported-format', message: 'The dictionary did not return a usable definition.' } };
    if (!base.phonetic) base.phonetic = base.pronunciations.find(sound => sound.phonetic)?.phonetic || '';
    return base;
  }
  globalThis.LexiLoomEntry = Object.freeze({ normalizeDictionaryEntry, safeHttps });
})();
