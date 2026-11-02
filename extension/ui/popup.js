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
const status = document.querySelector('#status');
const showError = () => { status.textContent = t('popupReadFailed'); status.dataset.error = 'true'; };
chrome.runtime.sendMessage({ type: 'GET_PRIVATE_SETTINGS' }).then(settings => {
  if (settings.error) throw new Error('read-failed');
  enabled.checked = settings.enabled;
  const provider = globalThis.LexiLoomPresent.resolveLookupProvider(settings, globalThis.LexiLoomI18n.languageTag());
  document.querySelector('#provider').textContent = t(names[provider]) || t('popupProviderUnset');
}).catch(showError);
enabled.addEventListener('change', async () => {
  enabled.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { enabled: enabled.checked } });
    if (!result.ok) throw new Error('save-failed');
    status.textContent = enabled.checked ? t('popupEnabledOn') : t('popupEnabledOff');
    status.dataset.error = 'false';
  } catch { showError(); } finally { enabled.disabled = false; }
});
document.querySelector('#options').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.querySelector('#try').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('try.html') }));
document.querySelector('#navigation').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('navigation.html') }));
})();
