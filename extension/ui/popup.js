'use strict';
const names = { smart: '中文优先 · 自动回退', wiktionary: '中文维基词典 · WiktApi', free: 'Free Dictionary · 英英', demo: '本地双语演示', oxford: 'Oxford Dictionaries', cambridge: 'Cambridge Dictionary' };
document.querySelector('#version').textContent = `v${chrome.runtime.getManifest().version} · 单词篇`;
const enabled = document.querySelector('#enabled');
const status = document.querySelector('#status');
const showError = () => { status.textContent = '设置读取失败，请重新打开插件。'; status.dataset.error = 'true'; };
chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }).then(settings => {
  enabled.checked = settings.enabled;
  document.querySelector('#provider').textContent = names[settings.provider] || '未选择';
}).catch(showError);
enabled.addEventListener('change', async () => {
  enabled.disabled = true;
  try {
    const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const result = await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { ...settings, enabled: enabled.checked } });
    if (!result.ok) throw new Error('save-failed');
    status.textContent = enabled.checked ? '已启用；已打开的网页也会生效。' : '已暂停；下次选词时生效。';
    status.dataset.error = 'false';
  } catch { showError(); } finally { enabled.disabled = false; }
});
document.querySelector('#options').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.querySelector('#try').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('try.html') }));
