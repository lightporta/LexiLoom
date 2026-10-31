'use strict';
const form = document.querySelector('#settings-form');
const provider = document.querySelector('#provider');
const enabled = document.querySelector('#enabled');
const token = document.querySelector('#bridge-token');
const status = document.querySelector('#save-status');
const notes = {
  smart: '后台优先通过 WiktApi 查询中文维基词典中的英文词条，缺词或不可用时回退 Free Dictionary 英英释义。无需密钥和本地服务。维基词条可能使用繁体中文，词卡会注明真实来源与回退原因。',
  wiktionary: '通过 api.wiktapi.dev 查询中文维基词典，直接显示中文释义、词条中已有的例句、音标和音频。无需密钥。开放协作词典的覆盖范围和内容质量因词条而异，部分释义为繁体；不是牛津或剑桥数据。',
  free: '直接查询 Free Dictionary API，无需申请密钥。提供英文释义、音标及接口中已有的例句，不包含自动中文翻译。请求会发送到 api.dictionaryapi.dev。',
  demo: '完全离线的交互演示，包含 12 个自编中英词条，例如 serendipity、luminous、ephemeral、apple。未收录的词会提示切换在线词典。',
  oxford: '通过本地服务连接 Oxford Dictionaries API。需要 App ID 和 App Key；英语试用仅支持 a 开头词，且有调用额度。释义语言由授权数据集决定。',
  cambridge: '通过本地服务连接 Cambridge 官方 API。需要审批授权、accessKey 以及账号可用的词典代码。若授权包含英汉词典，可以显示其中文释义。'
};
function showProvider() {
  document.querySelector('#source-note').textContent = notes[provider.value];
  document.querySelector('#bridge-section').hidden = !['oxford', 'cambridge'].includes(provider.value);
}
provider.addEventListener('change', showProvider);
async function load() {
  try {
    const settings = await chrome.runtime.sendMessage({ type: 'GET_PRIVATE_SETTINGS' });
    if (settings.error) throw new Error('read-failed');
    enabled.checked = settings.enabled;
    provider.value = settings.provider;
    token.value = settings.bridgeToken || '';
    showProvider();
  } catch { status.textContent = '设置读取失败，请刷新后重试。'; status.dataset.error = 'true'; }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  try {
    if (['oxford', 'cambridge'].includes(provider.value) && token.value.trim().length < 24) {
      status.textContent = '请填写至少 24 个字符的本地服务连接口令。'; status.dataset.error = 'true'; return;
    }
    const response = await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { provider: provider.value, enabled: enabled.checked, bridgeToken: token.value } });
    if (!response.ok) throw new Error('save-failed');
    status.textContent = '已保存。下次查词使用新设置，无需刷新网页。'; status.dataset.error = 'false';
  } catch { status.textContent = '未能保存设置，请重试。'; status.dataset.error = 'true'; } finally { submit.disabled = false; }
});
document.querySelector('#restore').addEventListener('click', () => {
  enabled.checked = true; provider.value = 'smart'; token.value = ''; showProvider();
  status.textContent = '已恢复表单默认值；点击“保存设置”后生效。'; status.dataset.error = 'false';
});
document.querySelector('#check-bridge').addEventListener('click', async event => {
  const output = document.querySelector('#bridge-status');
  event.target.disabled = true;
  output.textContent = '正在检查…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'CHECK_BRIDGE' });
    output.dataset.error = String(!result.ok);
    if (!result.ok) output.textContent = result.message;
    else {
      const states = result.data.providers || {};
      output.textContent = `本地服务已连接。牛津：${states.oxford?.configured ? '已配置' : '未配置'}；剑桥：${states.cambridge?.configured ? '已配置' : '未配置'}。配置状态不代表官方授权已验证，请实际查词确认。`;
    }
  } catch { output.textContent = '连接检查失败，请重试。'; output.dataset.error = 'true'; }
  finally { event.target.disabled = false; }
});
document.querySelector('#list-dictionaries').addEventListener('click', async event => {
  const output = document.querySelector('#dictionary-list');
  output.hidden = false;
  output.textContent = '正在读取账号已授权的词典…';
  event.target.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: 'LIST_DICTIONARIES' });
    if (!result.ok) { output.textContent = result.message; return; }
    const items = Array.isArray(result.data?.dictionaries) ? result.data.dictionaries.slice(0, 100) : [];
    output.textContent = items.length ? '将所需 dictionaryCode 填入 bridge/.env 的 CAMBRIDGE_DICTIONARY_CODE，然后重启服务：' : '账号未返回可用词典，请检查授权。';
    for (const item of items) {
      const row = document.createElement('div');
      row.textContent = `${String(item.dictionaryCode).slice(0, 100)} · ${String(item.dictionaryName).slice(0, 200)}`;
      output.append(row);
    }
  } catch { output.textContent = '读取失败，请检查本地服务和剑桥授权。'; }
  finally { event.target.disabled = false; }
});
load();
