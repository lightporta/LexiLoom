/* Chrome locale catalogs, with a preview fallback when chrome.i18n is absent. */
(() => {
  'use strict';
  const bundles = {};
  function languageTag() {
    if (globalThis.LexiLoomLocale) return globalThis.LexiLoomLocale.languageTag();
    try {
      return globalThis.chrome?.i18n?.getUILanguage?.() || navigator.language || 'zh-CN';
    } catch {
      return navigator.language || 'zh-CN';
    }
  }
  function locale() {
    return languageTag().toLowerCase().startsWith('en') ? 'en' : 'zh';
  }
  function catalog() {
    return globalThis.LexiLoomLocale?.profile(languageTag()).catalog || (locale() === 'en' ? 'en' : 'zh_CN');
  }
  function fill(message, substitutions) {
    const values = Array.isArray(substitutions) ? substitutions : substitutions == null ? [] : [substitutions];
    return message.replace(/\$(\d+)/g, (match, index) => Number(index) > 0 && Number(index) <= values.length ? String(values[Number(index) - 1]) : match);
  }
  function t(key, substitutions) {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_]+$/.test(key)) return '';
    const local = bundles[catalog()]?.[key]?.message;
    if (local) return fill(local, substitutions);
    try {
      if (globalThis.chrome?.i18n?.getMessage) {
        const message = chrome.i18n.getMessage(key, substitutions);
        if (message) return message;
      }
    } catch { /* Preview pages and Node tests have no extension catalog. */ }
    const message = bundles[catalog()]?.[key]?.message;
    return message ? fill(message, substitutions) : '';
  }
  async function loadCatalog() {
    const name = catalog();
    if (bundles[name]) return;
    if (globalThis.chrome?.runtime?.id && chrome.runtime.sendMessage) {
      const result = await chrome.runtime.sendMessage({ type: 'GET_CATALOG', catalog: name });
      if (result?.messages && typeof result.messages === 'object') {
        bundles[name] = result.messages; return;
      }
      throw new Error('messages');
    }
    const response = await fetch(`/_locales/${name}/messages.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error('messages');
    bundles[name] = await response.json();
  }
  const ready = loadCatalog().catch(() => {});
  function apply(root = document) {
    if (root.documentElement) root.documentElement.lang = globalThis.LexiLoomLocale?.profile(languageTag()).tag || (locale() === 'en' ? 'en' : 'zh-CN');
    const scope = root.querySelectorAll ? root : document;
    for (const node of scope.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
    for (const node of scope.querySelectorAll('[data-i18n-aria]')) {
      const label = t(node.dataset.i18nAria);
      if (label) node.setAttribute('aria-label', label);
    }
    for (const node of scope.querySelectorAll('[data-i18n-title]')) {
      const label = t(node.dataset.i18nTitle);
      if (label) node.title = label;
    }
    for (const node of scope.querySelectorAll('[data-i18n-placeholder]')) {
      const label = t(node.dataset.i18nPlaceholder);
      if (label) node.placeholder = label;
    }
  }
  function ownExtensionPage() {
    const runtime = globalThis.chrome?.runtime;
    if (!runtime?.id) return true;
    return location.protocol === 'chrome-extension:' && location.hostname === runtime.id;
  }
  function applyWhenReady() {
    if (!ownExtensionPage()) return;
    const run = () => apply(document);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void ready.then(run); });
    else void ready.then(run);
  }
  applyWhenReady();
  globalThis.LexiLoomI18n = Object.freeze({ t, locale, languageTag, ready, apply, loadCatalog });
})();
