/* Shared by the isolated content world, extension pages, and worker. */
(() => {
  'use strict';
  const MAX_WORDS = 8;
  const WORD = /^[a-z]+(?:['-][a-z]+)*$/i;
  const HAN = /^[\p{Script=Han}〇]+$/u;
  function normalizeWord(value) {
    if (typeof value !== 'string' || value.length > 64) return '';
    const word = value.trim().normalize('NFKC').replace(/[’‘]/g, "'").toLowerCase();
    return (WORD.test(word) || HAN.test(word)) && word.length <= 48 ? word : '';
  }
  function wordLanguage(word) {
    const value = normalizeWord(word);
    return value ? HAN.test(value) ? 'zh' : 'en' : '';
  }
  function parseSelection(text, language = 'zh-CN') {
    if (typeof text !== 'string' || !text.trim()) return { words: [], truncated: false, reason: 'empty' };
    if (text.length > 1000) return { words: [], truncated: false, reason: 'too-long' };
    const tokens = text.normalize('NFKC').replace(/[’‘]/g, "'")
      .replace(/(?:https?:\/\/|www\.)[^\s]+|[^\s@]+@[^\s@]+/gi, ' ')
      .split(/[\s,;.!?，。；！？、()[\]{}:"“”]+/u).filter(Boolean);
    let segmenter;
    try { segmenter = new Intl.Segmenter(language, { granularity: 'word' }); } catch { /* Exact-word lookup still works on older engines. */ }
    const selected = [];
    function add(value) {
      const word = normalizeWord(value);
      if (!word) return;
      if (HAN.test(word) && segmenter) {
        for (const item of segmenter.segment(word)) if (item.isWordLike && normalizeWord(item.segment)) selected.push(item.segment);
      } else selected.push(word);
    }
    for (const token of tokens) {
      const value = token.replace(/^'+|'+$/g, '');
      if (normalizeWord(value)) add(value);
      else if (/[\p{Script=Han}]/u.test(value) && /^[\p{Script=Han}〇a-z'-]+$/iu.test(value)) {
        for (const run of value.match(/[\p{Script=Han}〇]+|[a-z]+(?:['-][a-z]+)*/giu) || []) add(run);
      }
    }
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
      provider: ['smart', 'wiktionary', 'demo', 'free', 'oxford', 'cambridge'].includes(settings.provider) ? settings.provider : 'smart' };
  }
  globalThis.LexiLoomCore = Object.freeze({ MAX_WORDS, normalizeWord, wordLanguage, parseSelection, safeHttps, DEFAULT_SETTINGS, publicSettings });
})();
