/* This adapter is loaded only by try.html, never on user websites. */
window.__LEXILOOM_PREVIEW__ = {
  getSettings: async () => ({ enabled: true, provider: 'demo', targetLanguage: 'auto' }),
  lookup: async word => {
    if (globalThis.LexiLoomCore.wordLanguage(word) === 'zh') {
      if (globalThis.chrome?.runtime?.id) return chrome.runtime.sendMessage({ type: 'LOOKUP_PREVIEW', word });
      const { lookupChinese } = await import('../shared/chinese.js');
      const region = globalThis.LexiLoomLocale.profile(globalThis.LexiLoomI18n.languageTag()).region;
      return lookupChinese(word, { region, uiLanguage: globalThis.LexiLoomI18n.languageTag() });
    }
    await new Promise(resolve => setTimeout(resolve, 180));
    if (word === 'qzxqzxqz') return { word, status: 'not-found', source: { id: 'demo', name: '无结果状态演示', url: '' } };
    return globalThis.LexiLoomDemo.lookup(word);
  },
  openOptions: () => {
    if (globalThis.chrome?.runtime?.id) chrome.runtime.openOptionsPage();
    else document.querySelector('#demo-hint').textContent = globalThis.LexiLoomI18n?.t('previewOptionsHint') || '';
  }
};
