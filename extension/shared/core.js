/* Shared by the isolated content world, extension pages, and worker. */
(() => {
  'use strict';
  const MAX_WORDS = 8;
  const WORD = /^[a-z]+(?:['-][a-z]+)*$/i;
  function normalizeWord(value) {
    if (typeof value !== 'string' || value.length > 64) return '';
    const word = value.trim().normalize('NFKC').replace(/[’‘]/g, "'").toLowerCase();
    return WORD.test(word) && word.length <= 48 ? word : '';
  }
  function parseSelection(text) {
    if (typeof text !== 'string' || !text.trim()) return { words: [], truncated: false, reason: 'empty' };
    if (text.length > 1000) return { words: [], truncated: false, reason: 'too-long' };
    const tokens = text.normalize('NFKC').replace(/[’‘]/g, "'")
      .replace(/(?:https?:\/\/|www\.)[^\s]+|[^\s@]+@[^\s@]+/gi, ' ')
      .split(/[\s,;.!?，。；！？、()[\]{}:"“”]+/u).filter(Boolean);
    const words = [...new Set(tokens.map(token => normalizeWord(token.replace(/^'+|'+$/g, ''))).filter(Boolean))];
    return { words: words.slice(0, MAX_WORDS), truncated: words.length > MAX_WORDS,
      reason: words.length ? undefined : 'unsupported' };
  }
  function safeHttps(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }
  const DEFAULT_SETTINGS = Object.freeze({ enabled: true, provider: 'smart', englishProvider: 'free', bridgeToken: '' });
  function publicSettings(settings = {}) {
    return { enabled: settings.enabled !== false,
      provider: ['smart', 'wiktionary', 'demo', 'free', 'oxford', 'cambridge'].includes(settings.provider) ? settings.provider : 'smart' };
  }
  globalThis.LexiLoomCore = Object.freeze({ MAX_WORDS, normalizeWord, parseSelection, safeHttps, DEFAULT_SETTINGS, publicSettings });
})();
