'use strict';
(async () => {
await globalThis.LexiLoomI18n.ready;
const t = (key, substitutions) => globalThis.LexiLoomI18n.t(key, substitutions);
const english = globalThis.LexiLoomI18n.locale() === 'en';
const form = document.querySelector('#settings-form');
const provider = document.querySelector('#provider');
const enabled = document.querySelector('#enabled');
const token = document.querySelector('#bridge-token');
const status = document.querySelector('#save-status');
const chineseRegion = document.querySelector('#chinese-region');
const guidanceGroups = document.querySelector('#guidance-groups');
const guidanceCustom = document.querySelector('#guidance-custom');
const guidanceStatus = document.querySelector('#guidance-status');
const guidanceBuiltins = globalThis.LexiLoomGuidance ? globalThis.LexiLoomGuidance.builtins() : [];
const guidanceTraditional = globalThis.LexiLoomLocale.profile(globalThis.LexiLoomI18n.languageTag()).traditional;
let guidanceReady = false;
if (!guidanceCustom.placeholder) guidanceCustom.placeholder = t('guidanceCustomPlaceholder');
function showRegion() {
  const profile = globalThis.LexiLoomLocale.profile(globalThis.LexiLoomI18n.languageTag(), chineseRegion.value);
  document.querySelector('#resolved-region').textContent = t('regionResolved', [t(`region${profile.region}`)]);
}
chineseRegion.addEventListener('change', showRegion);
const notes = { smart: 'noteSmart', wiktionary: 'noteWiktionary', free: 'noteFree', demo: 'noteDemo', oxford: 'noteOxford', cambridge: 'noteCambridge' };
if (english) document.querySelector('.brand-cn')?.remove();
for (const option of provider.options) {
  const chineseOnly = option.value === 'smart' || option.value === 'wiktionary';
  option.hidden = english && chineseOnly;
  option.disabled = english && chineseOnly;
}
function showProvider() {
  document.querySelector('#source-note').textContent = t(notes[provider.value] || 'noteFree');
  document.querySelector('#bridge-section').hidden = !['oxford', 'cambridge'].includes(provider.value);
}
provider.addEventListener('change', showProvider);
function bridgeFailure(result) {
  if (result?.code === 'http_status') return t('error_http_status', [String(result.status)]);
  return t(`error_${result?.code || ''}`) || result?.message || t('bridgeCheckFailed');
}
function guidanceHost(template) {
  try { return new URL(template).hostname; } catch { return ''; }
}
function renderGuidance(settings) {
  const disabled = Array.isArray(settings.guidanceDisabled) ? settings.guidanceDisabled : [];
  guidanceGroups.replaceChildren();
  for (const group of [{ language: 'en', label: 'guidanceGroupEn' }, { language: 'zh', label: 'guidanceGroupZh' }]) {
    const wrapper = document.createElement('div');
    wrapper.className = 'guidance-group';
    const heading = document.createElement('h3');
    heading.textContent = t(group.label);
    wrapper.append(heading);
    for (const entry of guidanceBuiltins.filter(item => item.language === group.language)) {
      const row = document.createElement('label');
      row.className = 'switch-row guidance-option';
      row.title = guidanceHost(entry.urlTemplate);
      const name = document.createElement('span');
      name.textContent = globalThis.LexiLoomGuidance.displayName(entry, guidanceTraditional);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'switch';
      input.dataset.guidanceId = entry.id;
      input.checked = !disabled.includes(entry.id);
      row.append(name, input);
      wrapper.append(row);
    }
    guidanceGroups.append(wrapper);
  }
  const custom = Array.isArray(settings.guidanceCustom) ? settings.guidanceCustom : [];
  guidanceCustom.value = custom.map(item => `${item.name} | ${item.template}`).join('\n');
  guidanceReady = true;
}
function guidanceOverflow(text) {
  const limit = globalThis.LexiLoomGuidance.MAX_CUSTOM;
  const lines = typeof text === 'string' ? text.split(/\r?\n/) : [];
  let accepted = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('|');
    const checked = globalThis.LexiLoomGuidance.validateTemplate(at < 0 ? '' : line.slice(0, at), at < 0 ? '' : line.slice(at + 1));
    if (!checked.ok) continue;
    accepted++;
    if (accepted > limit) return { line: index + 1, name: checked.value.name };
  }
  return null;
}
function resetGuidance() {
  for (const input of guidanceGroups.querySelectorAll('[data-guidance-id]')) input.checked = true;
  guidanceCustom.value = '';
  guidanceStatus.textContent = ''; guidanceStatus.dataset.error = 'false';
}
async function load() {
  try {
    const settings = await chrome.runtime.sendMessage({ type: 'GET_PRIVATE_SETTINGS' });
    if (settings.error) throw new Error('read-failed');
    enabled.checked = settings.enabled;
    provider.value = english
      ? (globalThis.LexiLoomPresent.ENGLISH_PROVIDERS.includes(settings.englishProvider) ? settings.englishProvider : 'free')
      : settings.provider;
    token.value = settings.bridgeToken || '';
    chineseRegion.value = ['CN', 'HK', 'TW'].includes(settings.chineseRegion) ? settings.chineseRegion : 'auto';
    renderGuidance(settings);
    showRegion();
    showProvider();
  } catch { status.textContent = t('readFailed'); status.dataset.error = 'true'; }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  try {
    guidanceStatus.textContent = ''; guidanceStatus.dataset.error = 'false';
    if (['oxford', 'cambridge'].includes(provider.value) && token.value.trim().length < 24) {
      status.textContent = t('tokenShort'); status.dataset.error = 'true'; return;
    }
    const settings = { enabled: enabled.checked, bridgeToken: token.value, chineseRegion: chineseRegion.value };
    if (english) settings.englishProvider = provider.value;
    else settings.provider = provider.value;
    if (guidanceReady) {
      const parsed = globalThis.LexiLoomGuidance.parseCustom(guidanceCustom.value);
      if (parsed.invalid.length) {
        const first = parsed.invalid[0];
        guidanceStatus.textContent = t('guidanceInvalid', [String(first.line), first.name]);
        guidanceStatus.dataset.error = 'true';
        return;
      }
      // parseCustom silently caps at MAX_CUSTOM, so reject overflow explicitly instead of dropping lines.
      const overflow = guidanceOverflow(guidanceCustom.value);
      if (overflow) {
        guidanceStatus.textContent = t('guidanceInvalid', [String(overflow.line), overflow.name]);
        guidanceStatus.dataset.error = 'true';
        return;
      }
      settings.guidanceDisabled = guidanceBuiltins.filter(entry => {
        const input = guidanceGroups.querySelector(`[data-guidance-id="${entry.id}"]`);
        return Boolean(input) && !input.checked;
      }).map(entry => entry.id);
      settings.guidanceCustom = parsed.custom;
    }
    const response = await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
    if (!response.ok) throw new Error('save-failed');
    status.textContent = t('saved'); status.dataset.error = 'false';
  } catch { status.textContent = t('saveFailed'); status.dataset.error = 'true'; } finally { submit.disabled = false; }
});
document.querySelector('#restore').addEventListener('click', () => {
  enabled.checked = true; provider.value = english ? 'free' : 'smart'; token.value = ''; showProvider();
  chineseRegion.value = 'auto'; showRegion();
  resetGuidance();
  status.textContent = t('restored'); status.dataset.error = 'false';
});
document.querySelector('#check-bridge').addEventListener('click', async event => {
  const output = document.querySelector('#bridge-status');
  event.target.disabled = true;
  output.textContent = t('bridgeChecking');
  try {
    const result = await chrome.runtime.sendMessage({ type: 'CHECK_BRIDGE' });
    output.dataset.error = String(!result.ok);
    if (!result.ok) output.textContent = bridgeFailure(result);
    else {
      const states = result.data.providers || {};
      output.textContent = t('bridgeConnected', [
        states.oxford?.configured ? t('configured') : t('notConfigured'),
        states.cambridge?.configured ? t('configured') : t('notConfigured')
      ]);
    }
  } catch { output.textContent = t('bridgeCheckFailed'); output.dataset.error = 'true'; }
  finally { event.target.disabled = false; }
});
document.querySelector('#list-dictionaries').addEventListener('click', async event => {
  const output = document.querySelector('#dictionary-list');
  output.hidden = false;
  output.textContent = t('bridgeListing');
  event.target.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'LIST_DICTIONARIES' });
    if (!result.ok) { output.textContent = bridgeFailure(result); return; }
    const items = Array.isArray(result.data?.dictionaries) ? result.data.dictionaries.slice(0, 100) : [];
    output.textContent = items.length ? t('bridgeListHint') : t('bridgeListEmpty');
    for (const item of items) {
      const row = document.createElement('div');
      row.textContent = `${String(item.dictionaryCode).slice(0, 100)} · ${String(item.dictionaryName).slice(0, 200)}`;
      output.append(row);
    }
  } catch { output.textContent = t('bridgeListFailed'); }
  finally { event.target.disabled = false; }
});
load();
})();
