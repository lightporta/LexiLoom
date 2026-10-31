/* This adapter is loaded only by try.html, never on user websites. */
window.__LEXILOOM_PREVIEW__ = {
  getSettings: async () => ({ enabled: true, provider: 'demo' }),
  lookup: async word => {
    await new Promise(resolve => setTimeout(resolve, 180));
    if (word === 'qzxqzxqz') return { word, status: 'not-found', source: { id: 'demo', name: '无结果状态演示', url: '' } };
    return globalThis.LexiLoomDemo.lookup(word);
  },
  openOptions: () => {
    if (globalThis.chrome?.runtime?.id) chrome.runtime.openOptionsPage();
    else document.querySelector('#demo-hint').textContent = globalThis.LexiLoomI18n?.t('previewOptionsHint') || '';
  }
};
