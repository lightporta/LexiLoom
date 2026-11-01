/* Shared by the isolated content world, extension pages, and worker. */
(() => {
  'use strict';
  const MAX_WORDS = 8;
  const languages = globalThis.LexiLoomLanguages;
  const { normalizeWord, wordLanguage } = languages.registry;
  function parseSelection(text, language = 'zh-CN') {
    if (typeof text !== 'string' || !text.trim()) return { words: [], truncated: false, reason: 'empty' };
    if (text.length > 1000) return { words: [], truncated: false, reason: 'too-long' };
    const tokens = text.normalize('NFKC').replace(/[’‘]/g, "'")
      .replace(/(?:https?:\/\/|www\.)[^\s]+|[^\s@]+@[^\s@]+/gi, ' ')
      .split(/[\s,;.!?，。；！？、()[\]{}:"“”]+/u).filter(Boolean);
    const selected = tokens.flatMap(token => languages.registry.splitToken(token.replace(/^'+|'+$/g, ''), language));
    const words = [...new Set(selected)];
    return { words: words.slice(0, MAX_WORDS), truncated: words.length > MAX_WORDS,
      reason: words.length ? undefined : 'unsupported' };
  }
  function safeHttps(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }
  const DEFAULT_SETTINGS = Object.freeze({ enabled: true, provider: 'smart', englishProvider: 'free', chineseRegion: 'auto', bridgeToken: '' });
  function publicSettings(settings = {}) {
    return { enabled: settings.enabled !== false, chineseRegion: ['CN', 'HK', 'TW'].includes(settings.chineseRegion) ? settings.chineseRegion : 'auto',
      provider: languages.PROVIDERS.includes(settings.provider) ? settings.provider : 'smart' };
  }
  globalThis.LexiLoomCore = Object.freeze({ MAX_WORDS, normalizeWord, wordLanguage, parseSelection, safeHttps, DEFAULT_SETTINGS, publicSettings });
})();
