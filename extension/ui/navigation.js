'use strict';
(async () => {
  const i18n = globalThis.LexiLoomI18n;
  const guidance = globalThis.LexiLoomGuidance;
  await i18n.ready;
  i18n.apply(document);
  const t = (key, substitutions) => i18n.t(key, substitutions);
  const form = document.querySelector('#navigation-form');
  const word = document.querySelector('#nav-word');
  const language = document.querySelector('#nav-language');
  const region = document.querySelector('#nav-region');
  const regionField = document.querySelector('#nav-region-field');
  const submit = form.querySelector('[type=submit]');
  const status = document.querySelector('#nav-status');
  const results = document.querySelector('#nav-results');
  const title = document.querySelector('#nav-results-title');
  const sites = document.querySelector('#nav-sites');
  const uiLanguage = i18n.languageTag();
  const ui = globalThis.LexiLoomLocale.profile(uiLanguage);
  if (ui.language === 'en') document.querySelector('.brand-cn').hidden = true;
  const labels = { en: 'navLanguageEn', zh: 'navLanguageZh', ja: 'navLanguageJa', ko: 'navLanguageKo', fr: 'navLanguageFr', de: 'navLanguageDe', es: 'navLanguageEs' };
  const languages = guidance.supportedLanguages();
  let settings = null;
  let settingsRequest = 0;
  let invalidHashWord = false;

  const chooseLanguage = document.createElement('option');
  chooseLanguage.value = ''; chooseLanguage.textContent = t('navInvalidLanguage'); chooseLanguage.disabled = true;
  language.append(chooseLanguage);
  for (const id of languages) {
    const option = document.createElement('option');
    option.value = id; option.textContent = t(labels[id]);
    language.append(option);
  }
  language.value = ui.language === 'en' ? 'en' : 'zh';

  function statusText(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }
  function showRegion() { regionField.hidden = language.value !== 'zh'; }
  const invalidWord = value => /[\u0000-\u001f\u007f]/u.test(value)
    || !value.isWellFormed() || Array.from(value.trim()).length > 64;
  function readHash() {
    const hash = location.hash.slice(1);
    const params = new URLSearchParams(hash);
    let requestedWord = params.get('word') || '';
    invalidHashWord = false;
    // URLSearchParams tolerates malformed UTF-8 by replacing it. Decode the
    // original field strictly before a single-line input can remove controls.
    for (const part of hash.split('&')) {
      const at = part.indexOf('=');
      const key = at < 0 ? part : part.slice(0, at);
      try {
        if (decodeURIComponent(key.replaceAll('+', ' ')) !== 'word') continue;
        requestedWord = decodeURIComponent((at < 0 ? '' : part.slice(at + 1)).replaceAll('+', ' '));
      } catch { invalidHashWord = true; }
      break;
    }
    invalidHashWord ||= invalidWord(requestedWord);
    word.value = requestedWord;
    const requestedLanguage = params.get('language');
    language.value = !params.has('language') ? ui.language === 'en' ? 'en' : 'zh'
      : languages.includes(requestedLanguage) ? requestedLanguage : '';
    const requestedRegion = params.get('region');
    region.value = ['CN', 'HK', 'TW'].includes(requestedRegion) ? requestedRegion : 'auto';
    showRegion();
  }
  function updateHash(query) {
    const params = new URLSearchParams({ word: query, language: language.value });
    if (language.value === 'zh') params.set('region', region.value);
    history.replaceState(null, '', `#${params}`);
  }
  function render() {
    sites.replaceChildren();
    results.hidden = true;
    const query = word.value.trim();
    if (!languages.includes(language.value)) { statusText(t('navInvalidLanguage'), true); return false; }
    if (invalidHashWord || invalidWord(word.value)) {
      statusText(t('navInvalidWord'), true); return false;
    }
    if (!query) { statusText(t('navEmpty')); return false; }
    if (!settings) { statusText(t('readFailed'), true); return false; }
    const selectedRegion = globalThis.LexiLoomLocale.profile(uiLanguage, region.value).region;
    const links = guidance.resolveAll({ word: query, language: language.value, region: language.value === 'zh' ? selectedRegion : '' }, {
      uiLanguage, uiRegion: selectedRegion, settings
    });
    title.textContent = t('navResults', [query, t(labels[language.value]), String(links.length)]);
    for (const link of links) {
      const item = document.createElement('li');
      item.className = 'navigation-site';
      const anchor = document.createElement('a');
      anchor.href = link.url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
      const name = guidance.displayName(link, ui.traditional);
      anchor.setAttribute('aria-label', t('navOpen', [name]));
      const content = document.createElement('span');
      content.className = 'navigation-site-text';
      const nameNode = document.createElement('span');
      nameNode.className = 'navigation-site-name'; nameNode.textContent = name;
      const host = document.createElement('span');
      host.className = 'navigation-site-host'; host.textContent = link.host;
      content.append(nameNode, host);
      const arrow = document.createElement('span');
      arrow.className = 'navigation-site-arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
      anchor.append(content, arrow); item.append(anchor); sites.append(item);
    }
    results.dataset.word = query;
    results.dataset.language = language.value;
    results.dataset.region = selectedRegion;
    results.hidden = false;
    statusText(links.length ? '' : t('navNoSites'));
    return true;
  }

  async function refreshSettings() {
    const request = ++settingsRequest;
    try {
      // This page only needs public preferences. Never request the bridge token.
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (!response || response.error || !response.guidance) throw new Error('settings');
      if (request !== settingsRequest) return;
      settings = { guidance: guidance.publicSettings(response) };
      document.documentElement.dataset.navigationReady = 'true';
      render();
    } catch {
      if (request !== settingsRequest) return;
      settings = null;
      sites.replaceChildren(); results.hidden = true;
      statusText(t('readFailed'), true);
      document.documentElement.dataset.navigationReady = 'error';
    } finally {
      if (request === settingsRequest) submit.disabled = false;
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!settings) await refreshSettings();
    if (render()) updateHash(word.value.trim());
  });
  // Only editing the headword clears an invalid incoming word. Submitting or
  // changing a language must not silently accept the input element's cleanup.
  word.addEventListener('input', () => { invalidHashWord = false; });
  language.addEventListener('change', () => { showRegion(); if (render()) updateHash(word.value.trim()); });
  region.addEventListener('change', () => { if (render()) updateHash(word.value.trim()); });
  window.addEventListener('hashchange', () => { readHash(); render(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) void refreshSettings();
  });
  readHash();
  await refreshSettings();
})();
