/* Locale-specific lookup choice and English card projection. */
(() => {
  'use strict';
  const { registry: languages, ENGLISH_PROVIDERS } = globalThis.LexiLoomLanguages;

  function hasCjk(value) {
    return typeof value === 'string' && languages.contentLanguage(value, '') === 'zh';
  }

  function localeFrom(language) {
    return languages.uiProfile(language).language;
  }

  function resolveLookupProvider(settings = {}, language = 'zh-CN') {
    return languages.get('en').selectAdapter({ settings, ui: languages.uiProfile(language) });
  }

  function englishText(value) {
    return typeof value === 'string' && value.trim() && !hasCjk(value) ? value.trim() : '';
  }

  function presentEntry(result, language = 'zh-CN', { registry = languages } = {}) {
    // Profiles describe whether the headword needs bilingual content, independently
    // of the UI language. A future language adapter uses this same projection.
    if (!result || typeof result !== 'object') return result;
    if (registry.entryProfile(result)?.presentation.bilingual || registry.uiProfile(language).language !== 'en') return result;
    if (result.status !== 'ok') {
      const next = { ...result };
      if (hasCjk(next.notice)) delete next.notice;
      return next;
    }
    const pronunciations = (Array.isArray(result.pronunciations) ? result.pronunciations : []).map(item => {
      const sound = {
        label: englishText(item?.label) || 'EN',
        phonetic: englishText(item?.phonetic),
        audio: typeof item?.audio === 'string' ? item.audio : ''
      };
      if (typeof item?.locale === 'string') sound.locale = item.locale;
      if (typeof item?.sourceUrl === 'string') sound.sourceUrl = item.sourceUrl;
      if (typeof item?.attributionUrl === 'string') sound.attributionUrl = item.attributionUrl;
      if (item?.license) sound.license = item.license;
      return sound;
    }).filter(item => item.phonetic || item.audio);
    const meanings = [];
    for (const meaning of Array.isArray(result.meanings) ? result.meanings : []) {
      const definitions = [];
      for (const definition of Array.isArray(meaning?.definitions) ? meaning.definitions : []) {
        const text = englishText(definition?.definition);
        if (!text) continue;
        const examples = (Array.isArray(definition.examples) ? definition.examples : [])
          .map(example => ({ text: englishText(example?.text), ...(englishText(example?.reference) ? { reference: englishText(example.reference) } : {}) }))
          .filter(example => example.text)
          .slice(0, 4);
        definitions.push({ definition: text, examples });
      }
      if (definitions.length) meanings.push({
        language: 'en', partOfSpeech: englishText(meaning?.partOfSpeech), definitions, synonyms: [],
        ...(englishText(meaning?.heading) ? { heading: englishText(meaning.heading) } : {}),
        ...(englishText(meaning?.origin) ? { origin: englishText(meaning.origin) } : {})
      });
    }
    return {
      ...result,
      phonetic: englishText(result.phonetic) || pronunciations.find(item => item.phonetic)?.phonetic || '',
      pronunciations,
      meanings,
      notice: englishText(result.notice),
      noticeKey: meanings.length ? result.noticeKey || '' : 'noticeNoEnglish'
    };
  }

  function createCardView(result, uiLanguage = 'zh-CN', { registry = languages } = {}) {
    const entry = presentEntry(result, uiLanguage, { registry });
    const profile = registry.entryProfile(entry || {});
    const ui = registry.uiProfile(uiLanguage);
    const presentation = profile?.presentation || {};
    const bilingual = Boolean(presentation.bilingual || ui.language !== 'en');
    const desiredLanguage = ui.language;
    const meaning = entry?.meanings?.find(item => item.language === desiredLanguage && item.definitions?.length)
      || entry?.meanings?.find(item => item.definitions?.length);
    const definition = meaning?.definitions?.[0];
    const part = typeof meaning?.partOfSpeech === 'string' ? meaning.partOfSpeech : '';
    const meaningText = !presentation.bilingual && ui.language !== 'en'
      ? definition?.translation || definition?.definition || '' : definition?.definition || '';
    return {
      entry,
      summary: meaningText, partOfSpeech: part,
      showTranslations: bilingual, showUsage: bilingual, showReferences: true, showSynonyms: bilingual,
      maxExamples: Math.max(1, Math.min(4, presentation.maxExamples || 4)),
      showMeaningHeadings: Boolean(presentation.headings),
      headingKeys: { zh: 'sectionChineseMeaning', en: 'sectionEnglishMeaning', ...presentation.headingKeys },
      speechFallbackLocale: profile?.speechLocale || 'en-US',
      notFoundKey: presentation.notFoundKey || 'notFound'
    };
  }

  globalThis.LexiLoomPresent = Object.freeze({
    hasCjk, localeFrom, resolveLookupProvider, presentEntry, createCardView, ENGLISH_PROVIDERS
  });
})();
