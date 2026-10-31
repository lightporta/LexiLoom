/* Locale-specific lookup choice and English card projection. */
(() => {
  'use strict';
  const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
  const PROVIDERS = ['smart', 'wiktionary', 'demo', 'free', 'oxford', 'cambridge'];
  const ENGLISH_PROVIDERS = ['free', 'demo', 'oxford', 'cambridge'];

  function hasCjk(value) {
    return typeof value === 'string' && CJK.test(value);
  }

  function localeFrom(language) {
    return typeof language === 'string' && language.toLowerCase().startsWith('en') ? 'en' : 'zh';
  }

  function resolveLookupProvider(settings = {}, language = 'zh-CN') {
    const provider = PROVIDERS.includes(settings.provider) ? settings.provider : 'smart';
    if (localeFrom(language) !== 'en') return provider;
    return ENGLISH_PROVIDERS.includes(settings.englishProvider) ? settings.englishProvider : 'free';
  }

  function englishText(value) {
    return typeof value === 'string' && value.trim() && !hasCjk(value) ? value.trim() : '';
  }

  function presentEntry(result, language = 'zh-CN') {
    if (!result || typeof result !== 'object' || localeFrom(language) !== 'en') return result;
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
          .map(example => ({ text: englishText(example?.text) }))
          .filter(example => example.text)
          .slice(0, 4);
        definitions.push({ definition: text, examples });
      }
      if (definitions.length) meanings.push({ partOfSpeech: englishText(meaning?.partOfSpeech), definitions });
    }
    return {
      ...result,
      phonetic: englishText(result.phonetic) || pronunciations.find(item => item.phonetic)?.phonetic || '',
      pronunciations,
      meanings,
      notice: '',
      noticeKey: meanings.length ? '' : 'noticeNoEnglish'
    };
  }

  globalThis.LexiLoomPresent = Object.freeze({
    hasCjk, localeFrom, resolveLookupProvider, presentEntry, ENGLISH_PROVIDERS
  });
})();
