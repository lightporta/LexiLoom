/* UI language and dictionary region are related, but not interchangeable. */
(() => {
  'use strict';
  function profile(language = 'zh-CN', override = 'auto') {
    const tag = String(language).replaceAll('_', '-').toLowerCase();
    const english = tag.startsWith('en');
    let region = /(?:^yue|-(?:hk|mo)(?:-|$))/.test(tag) ? 'HK'
      : /-(?:tw)(?:-|$)|^zh-hant(?:$|-)/.test(tag) ? 'TW' : 'CN';
    if (['CN', 'HK', 'TW'].includes(override)) region = override;
    const traditional = !english && region !== 'CN';
    return Object.freeze({
      language: english ? 'en' : 'zh', region,
      catalog: english ? 'en' : traditional ? 'zh_TW' : 'zh_CN',
      tag: english ? 'en' : region === 'HK' ? 'zh-HK' : region === 'TW' ? 'zh-TW' : 'zh-CN',
      traditional, speechLanguage: region === 'HK' ? 'zh-HK' : region === 'TW' ? 'zh-TW' : 'zh-CN'
    });
  }
  function languageTag() {
    try { return globalThis.chrome?.i18n?.getUILanguage?.() || globalThis.navigator?.language || 'zh-CN'; }
    catch { return globalThis.navigator?.language || 'zh-CN'; }
  }
  globalThis.LexiLoomLocale = Object.freeze({ profile, languageTag });
})();
