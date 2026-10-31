import '../shared/locale.js';
import '../shared/core.js';
import '../shared/present.js';
import '../shared/demo-data.js';
import { lookupFree, lookupWiktionary, lookupSmart, readJsonLimited } from '../shared/providers.js';
import { lookupChinese, localizeChineseEntry } from '../shared/chinese.js';

const { DEFAULT_SETTINGS, normalizeWord, wordLanguage, publicSettings } = globalThis.LexiLoomCore;
const BRIDGE = 'http://127.0.0.1:47821';
let lookupActive = 0;
const lookupWaiters = [];
async function withLookupSlot(task) {
  if (lookupActive >= 4) await new Promise(resolve => lookupWaiters.push(resolve));
  else lookupActive++;
  try { return await task(); }
  finally {
    const next = lookupWaiters.shift();
    if (next) next();
    else lookupActive--;
  }
}
const settingsReady = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
async function getSettings() {
  await settingsReady;
  return { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get('settings')).settings };
}
function errorResult(word, code, message, provider = '') {
  return { word, status: 'error', error: { code, message }, source: { id: provider, name: provider, url: '' } };
}
function interfaceLanguage() {
  return globalThis.LexiLoomLocale.languageTag();
}
async function lookup(word) {
  const settings = await getSettings();
  const uiLanguage = interfaceLanguage();
  const profile = globalThis.LexiLoomLocale.profile(uiLanguage, settings.chineseRegion);
  if (!settings.enabled) return errorResult(word, 'disabled', '查词已暂停。');
  if (wordLanguage(word) === 'zh') return withLookupSlot(() => lookupChinese(word, { region: profile.region, uiLanguage }));
  const provider = globalThis.LexiLoomPresent.resolveLookupProvider(settings, uiLanguage);
  const result = await lookupEnglish(word, settings, provider);
  return profile.language === 'en' ? result : localizeChineseEntry(result, profile.region);
}
async function lookupEnglish(word, settings, provider) {
  if (provider === 'demo') return globalThis.LexiLoomDemo.lookup(word);
  if (provider === 'smart') return withLookupSlot(() => lookupSmart(word));
  if (provider === 'wiktionary') return withLookupSlot(() => lookupWiktionary(word));
  if (provider === 'free') return withLookupSlot(() => lookupFree(word));
  if (!settings.bridgeToken) return errorResult(word, 'not-configured', '请先在设置中连接本地词典服务。', provider);
  return withLookupSlot(async () => { try {
    const url = new URL('/v1/lookup', BRIDGE);
    url.searchParams.set('provider', provider);
    url.searchParams.set('word', word);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${settings.bridgeToken}` },
      signal: AbortSignal.timeout(14000), cache: 'no-store', credentials: 'omit', redirect: 'error'
    });
    if (response.status === 401 || response.status === 403) return errorResult(word, 'bridge-auth', '本地服务连接口令不正确，请检查设置。', provider);
    if (response.status === 429) return errorResult(word, 'bridge-busy', '本地词典服务繁忙，请稍后重试。', provider);
    const result = await response.json();
    if (!['ok', 'not-found', 'error'].includes(result?.status)) throw new Error('invalid-response');
    return result;
  } catch {
    return errorResult(word, 'bridge-unavailable', '无法连接本地词典服务，请确认服务正在运行。', provider);
  } });
}
const pageNames = new Set(['popup.html', 'options.html', 'try.html']);
function isExtensionPage(sender) {
  try {
    const url = new URL(sender.url);
    return url.protocol === 'chrome-extension:' && url.host === chrome.runtime.id && pageNames.has(url.pathname.slice(1));
  } catch { return false; }
}
let pending = 0;
const catalogs = new Map();
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
  if (message.type === 'GET_SETTINGS') return publicSettings(await getSettings());
  if (message.type === 'GET_CATALOG') return getCatalog(message.catalog);
  if (message.type === 'OPEN_OPTIONS') {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  }
  if (message.type === 'LOOKUP') {
    const word = normalizeWord(message.word);
    if (!word) return errorResult('', 'invalid-word', '请选择 48 个字符以内的英文单词或中文字词。');
    if (pending >= 16) return errorResult(word, 'busy', '正在查询其他单词，请稍后重试。');
    pending++;
    try { return await lookup(word); } finally { pending--; }
  }
  if (!isExtensionPage(sender)) return { error: 'unauthorized' };
  if (message.type === 'GET_PRIVATE_SETTINGS') return getSettings();
  if (message.type === 'SAVE_SETTINGS') {
    const old = await getSettings();
    const incoming = message.settings || {};
    const next = { ...old, enabled: incoming.enabled !== false };
    if (typeof incoming.bridgeToken === 'string') next.bridgeToken = incoming.bridgeToken.trim().slice(0, 512);
    if (['smart', 'wiktionary', 'demo', 'free', 'oxford', 'cambridge'].includes(incoming.provider)) next.provider = incoming.provider;
    if (globalThis.LexiLoomPresent.ENGLISH_PROVIDERS.includes(incoming.englishProvider)) next.englishProvider = incoming.englishProvider;
    if (['auto', 'CN', 'HK', 'TW'].includes(incoming.chineseRegion)) next.chineseRegion = incoming.chineseRegion;
    await chrome.storage.local.set({ settings: next });
    return { ok: true };
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
