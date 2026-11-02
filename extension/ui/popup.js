'use strict';
(async () => {
await globalThis.LexiLoomI18n.ready;
const t = (key, substitutions) => globalThis.LexiLoomI18n.t(key, substitutions);
const english = globalThis.LexiLoomI18n.locale() === 'en';
const names = { smart: 'providerSmart', wiktionary: 'providerWiktionary', free: 'providerFree', demo: 'providerDemo', oxford: 'providerOxford', cambridge: 'providerCambridge' };
document.querySelector('#version').textContent = `v${chrome.runtime.getManifest().version} · ${t('versionWords')}`;
document.querySelector('#provider').textContent = t('popupProviderLoading');
if (english) document.querySelector('.brand-cn')?.remove();
const enabled = document.querySelector('#enabled');
const targetLanguage = document.querySelector('#target-language');
const status = document.querySelector('#status');
let currentSettings;
enabled.disabled = targetLanguage.disabled = true;
const showError = () => { status.textContent = t('popupReadFailed'); status.dataset.error = 'true'; };
function renderProvider() {
  const provider = globalThis.LexiLoomPresent.resolveLookupProvider(currentSettings, globalThis.LexiLoomI18n.languageTag());
  document.querySelector('#provider').textContent = t(currentSettings.targetLanguage !== 'auto' ? 'providerMultilingual' : names[provider]) || t('popupProviderUnset');
}
chrome.runtime.sendMessage({ type: 'GET_PRIVATE_SETTINGS' }).then(settings => {
  if (!settings || settings.error) throw new Error('read-failed');
  currentSettings = { ...settings, targetLanguage: globalThis.LexiLoomLanguages.TARGET_LANGUAGES.includes(settings.targetLanguage) ? settings.targetLanguage : 'auto' };
  enabled.checked = settings.enabled !== false;
  targetLanguage.value = currentSettings.targetLanguage;
  renderProvider();
  enabled.disabled = targetLanguage.disabled = false;
}).catch(showError);
enabled.addEventListener('change', async () => {
  if (!currentSettings) return;
  enabled.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { enabled: enabled.checked } });
    if (!result.ok) throw new Error('save-failed');
    currentSettings.enabled = enabled.checked;
    status.textContent = enabled.checked ? t('popupEnabledOn') : t('popupEnabledOff');
    status.dataset.error = 'false';
  } catch { enabled.checked = currentSettings.enabled !== false; showError(); } finally { enabled.disabled = false; }
});
targetLanguage.addEventListener('change', async () => {
  if (!currentSettings) return;
  targetLanguage.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { targetLanguage: targetLanguage.value } });
    if (!result.ok) throw new Error('save-failed');
    currentSettings.targetLanguage = targetLanguage.value;
    renderProvider();
    status.textContent = t('saved'); status.dataset.error = 'false';
  } catch { targetLanguage.value = currentSettings.targetLanguage; showError(); } finally { targetLanguage.disabled = false; }
});
document.querySelector('#options').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.querySelector('#try').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('try.html') }));
document.querySelector('#navigation').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('navigation.html') }));
})();
