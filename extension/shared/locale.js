/* UI language and dictionary region are related, but not interchangeable. */
(() => {
  'use strict';
  function profile(language = 'zh-CN', override = 'auto') {
    return globalThis.LexiLoomLanguages.registry.uiProfile(language, override);
  }
  function languageTag() {
    try { return globalThis.chrome?.i18n?.getUILanguage?.() || globalThis.navigator?.language || 'zh-CN'; }
    catch { return globalThis.navigator?.language || 'zh-CN'; }
  }
  globalThis.LexiLoomLocale = Object.freeze({ profile, languageTag });
})();
