import '../shared/languages.js';
import '../shared/locale.js';
import '../shared/guidance.js';
import '../shared/core.js';
import '../shared/present.js';
import '../shared/demo-data.js';
import { lookupFree, lookupWiktionary, lookupSmart, readJsonLimited } from '../shared/providers.js';
import { lookupChinese, localizeChineseEntry } from '../shared/chinese.js';
import { lookupMultilingual } from '../shared/multilingual.js';
import { createDictionaryEngine } from '../shared/dictionary.js';

const { DEFAULT_SETTINGS, normalizeWord, publicSettings } = globalThis.LexiLoomCore;
const BRIDGE = 'http://127.0.0.1:47821';
const settingsReady = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
async function getSettings() {
  await settingsReady;
  const settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get('settings')).settings };
  if (!globalThis.LexiLoomLanguages.TARGET_LANGUAGES.includes(settings.targetLanguage)) settings.targetLanguage = 'auto';
  return settings;
}
function errorResult(word, code, message, provider = '', settings = {}) {
  const registry = globalThis.LexiLoomLanguages.registry;
  const profile = registry.get(settings.targetLanguage);
  const context = registry.lookupContext(word, { settings, uiLanguage: interfaceLanguage() })
    || { word: '', ...(profile ? { profile, language: profile.language } : {}) };
  return globalThis.LexiLoomEntry.normalizeDictionaryEntry({ word, status: 'error', error: { code, message }, source: { id: provider, name: provider, url: '' } }, context);
}
function interfaceLanguage() {
  return globalThis.LexiLoomLocale.languageTag();
}
async function lookupOfficial(word, { settings, adapterId: provider, fetchImpl }) {
  if (!settings.bridgeToken) return errorResult(word, 'not-configured', '请先在设置中连接本地词典服务。', provider);
  try {
    const url = new URL('/v1/lookup', BRIDGE);
    url.searchParams.set('provider', provider);
    url.searchParams.set('word', word);
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${settings.bridgeToken}` },
      signal: AbortSignal.timeout(14000), cache: 'no-store', credentials: 'omit', redirect: 'error'
    });
    if (response.status === 401 || response.status === 403) return errorResult(word, 'bridge-auth', '本地服务连接口令不正确，请检查设置。', provider);
    if (response.status === 429) return errorResult(word, 'bridge-busy', '本地词典服务繁忙，请稍后重试。', provider);
    const result = await readJsonLimited(response);
    if (!['ok', 'not-found', 'error'].includes(result?.status)) throw new Error('invalid-response');
    return result;
  } catch {
    return errorResult(word, 'bridge-unavailable', '无法连接本地词典服务，请确认服务正在运行。', provider);
  }
}
const dictionaries = createDictionaryEngine({
  adapters: {
    demo: word => globalThis.LexiLoomDemo.lookup(word),
    smart: (word, { fetchImpl }) => lookupSmart(word, { fetchImpl }),
    wiktionary: (word, { fetchImpl }) => lookupWiktionary(word, { fetchImpl }),
    free: (word, { fetchImpl }) => lookupFree(word, { fetchImpl }),
    chinese: (word, { region, uiLanguage, fetchImpl }) => lookupChinese(word, { region, uiLanguage, fetchImpl }),
    multilingual: (word, { language, fetchImpl }) => lookupMultilingual(word, { language, fetchImpl }),
    oxford: lookupOfficial, cambridge: lookupOfficial
  },
  localize: (entry, context) => context.profile.localizeForUi?.(context.ui)
    ? localizeChineseEntry(entry, context.ui.region) : entry
});
const pageNames = new Set(['popup.html', 'options.html', 'try.html']);
function isExtensionPage(sender) {
  try {
    const url = new URL(sender.url);
    return url.protocol === 'chrome-extension:' && url.host === chrome.runtime.id && pageNames.has(url.pathname.slice(1));
  } catch { return false; }
}
let pending = 0;
const catalogs = new Map();
let settingsWrites = Promise.resolve();
// Initial reads and later broadcasts must expose the same validated shape so
// content scripts can compare source changes against the actual saved value.
function contentSettings(settings) {
  return { ...publicSettings(settings), guidance: globalThis.LexiLoomGuidance.publicSettings(settings) };
}
// Content scripts cannot read chrome.storage directly because storage access is
// limited to trusted contexts. Push the public settings shape to open tabs after
// every save so an already-open word card can refresh without a page reload.
function broadcastSettings(settings) {
  const message = {
    type: 'SETTINGS_CHANGED',
    settings: contentSettings(settings)
  };
  const tabs = chrome.tabs && chrome.tabs.query ? chrome.tabs.query({}) : Promise.resolve([]);
  return tabs.then(list => Promise.all((list || [])
    .filter(tab => typeof tab.id === 'number')
    .map(tab => chrome.tabs.sendMessage(tab.id, message).catch(() => {}))))
    .catch(() => {});
}
function saveSettings(incoming) {
  const operation = settingsWrites.then(async () => {
    if (Object.hasOwn(incoming, 'guidanceCustom')) {
      const checked = globalThis.LexiLoomGuidance.validateCustom(incoming.guidanceCustom);
      if (!checked.ok) return { ok: false, error: 'invalid-guidance', index: checked.index, reason: checked.error };
    }
    const next = { ...await getSettings() };
    if (typeof incoming.enabled === 'boolean') next.enabled = incoming.enabled;
    if (typeof incoming.bridgeToken === 'string') next.bridgeToken = incoming.bridgeToken.trim().slice(0, 512);
    if (globalThis.LexiLoomLanguages.PROVIDERS.includes(incoming.provider)) next.provider = incoming.provider;
    if (globalThis.LexiLoomLanguages.ENGLISH_PROVIDERS.includes(incoming.englishProvider)) next.englishProvider = incoming.englishProvider;
    if (['auto', 'CN', 'HK', 'TW'].includes(incoming.chineseRegion)) next.chineseRegion = incoming.chineseRegion;
    if (globalThis.LexiLoomLanguages.TARGET_LANGUAGES.includes(incoming.targetLanguage)) next.targetLanguage = incoming.targetLanguage;
    if (Array.isArray(incoming.guidanceDisabled) || Array.isArray(incoming.guidanceCustom)) {
      const guidance = globalThis.LexiLoomGuidance.sanitize({
        guidanceDisabled: Array.isArray(incoming.guidanceDisabled) ? incoming.guidanceDisabled : next.guidanceDisabled,
        guidanceCustom: Array.isArray(incoming.guidanceCustom) ? incoming.guidanceCustom : next.guidanceCustom
      });
      next.guidanceDisabled = guidance.disabled;
      next.guidanceCustom = guidance.custom;
    }
    await chrome.storage.local.set({ settings: next });
    await broadcastSettings(next);
    return { ok: true };
  });
  settingsWrites = operation.catch(() => {});
  return operation;
}
async function getCatalog(name) {
  if (!['en', 'zh_CN', 'zh_TW'].includes(name)) return { error: 'invalid-catalog' };
  if (!catalogs.has(name)) {
    const pending = (async () => {
      const response = await fetch(new URL(`../_locales/${name}/messages.json`, import.meta.url), { cache: 'no-store' });
      if (!response.ok) throw new Error('catalog');
      const messages = await readJsonLimited(response);
      if (!messages?.extName?.message || Object.values(messages).some(value => typeof value?.message !== 'string')) throw new Error('catalog');
      return { messages };
    })();
    catalogs.set(name, pending);
    pending.catch(() => catalogs.delete(name));
  }
  return catalogs.get(name);
}
async function handle(message, sender) {
  if (sender.id !== chrome.runtime.id) return { error: 'unauthorized' };
  if (message.type === 'GET_SETTINGS') {
    const settings = await getSettings();
    // The content script needs the resolved guidance state, never the bridge token.
    return contentSettings(settings);
  }
  if (message.type === 'GET_CATALOG') return getCatalog(message.catalog);
  if (message.type === 'OPEN_OPTIONS') {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  }
  if (message.type === 'OPEN_NAVIGATION') {
    const rawWord = typeof message.word === 'string' ? message.word : '';
    const word = rawWord.trim();
    if (!word || Array.from(word).length > 64 || !rawWord.isWellFormed() || /[\u0000-\u001f\u007f]/u.test(rawWord)
      || !globalThis.LexiLoomGuidance.supportedLanguages().includes(message.language)) return { error: 'invalid-word' };
    const query = new URLSearchParams({ word, language: message.language });
    if (['CN', 'HK', 'TW'].includes(message.region)) query.set('region', message.region);
    await chrome.tabs.create({ url: chrome.runtime.getURL('navigation.html') + '#' + query });
    return { ok: true };
  }
  if (message.type === 'LOOKUP' || message.type === 'LOOKUP_PREVIEW') {
    const previewLookup = message.type === 'LOOKUP_PREVIEW';
    if (previewLookup && (!isExtensionPage(sender) || new URL(sender.url).pathname !== '/try.html')) return { error: 'unauthorized' };
    if (pending >= 16) return errorResult('', 'busy', '正在查询其他单词，请稍后重试。');
    pending++;
    try {
      const saved = await getSettings();
      // The packaged reading room is an isolated Chinese/English demo. It must
      // not reinterpret its Chinese sample using the user's foreign-word mode.
      const settings = previewLookup ? { ...saved, targetLanguage: 'auto' } : saved;
      const word = normalizeWord(message.word, settings.targetLanguage);
      if (!word) return errorResult('', 'invalid-word', '请选择当前查词语言支持的词头。', '', settings);
      return await dictionaries.lookup(word, { settings, uiLanguage: interfaceLanguage() });
    } finally { pending--; }
  }
  if (!isExtensionPage(sender)) return { error: 'unauthorized' };
  if (message.type === 'GET_PRIVATE_SETTINGS') return getSettings();
  if (message.type === 'SAVE_SETTINGS') {
    return saveSettings(message.settings && typeof message.settings === 'object' ? message.settings : {});
  }
  if (message.type === 'CHECK_BRIDGE' || message.type === 'LIST_DICTIONARIES') {
    const settings = await getSettings();
    if (!settings.bridgeToken) return { ok: false, code: 'missing_token', message: '请先保存连接口令。' };
    try {
      const endpoint = message.type === 'LIST_DICTIONARIES' ? '/v1/dictionaries' : '/v1/health';
      const response = await fetch(`${BRIDGE}${endpoint}`, { headers: { Authorization: `Bearer ${settings.bridgeToken}` }, signal: AbortSignal.timeout(message.type === 'LIST_DICTIONARIES' ? 14000 : 4000), cache: 'no-store', redirect: 'error', credentials: 'omit' });
      if (!response.ok) return { ok: false, code: 'http_status', status: response.status, message: `连接失败（HTTP ${response.status}），请检查服务和口令。` };
      const data = await response.json();
      return { ok: true, data };
    } catch { return { ok: false, code: 'bridge_down', message: '未连接。请先启动本地词典服务。' }; }
  }
  return { error: 'unsupported-message' };
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  handle(message, sender).then(sendResponse).catch(() => sendResponse({ error: 'internal-error' }));
  return true;
});
// Defaults are read without writing on installation, so a first settings save
// cannot be overwritten by an in-flight install event.
