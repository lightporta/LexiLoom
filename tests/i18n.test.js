import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function load(language) {
  const requests = [];
  const context = vm.createContext({
    navigator: { language }, location: { protocol: 'chrome-extension:', hostname: 'a'.repeat(32) },
    chrome: {
      i18n: { getUILanguage: () => language, getMessage: () => '' },
      runtime: { id: 'a'.repeat(32), sendMessage: async request => {
        requests.push(request);
        return { messages: {
          example: { message: '$1 / $2 / $10 / $0' },
          labelText: { message: 'Label text' },
          labelAria: { message: 'Aria label' },
          labelTitle: { message: 'Title text' },
          labelPlaceholder: { message: 'Placeholder text' }
        } };
      } }
    },
    document: { readyState: 'loading', addEventListener() {} }
  });
  for (const name of ['languages', 'locale', 'i18n']) vm.runInContext(await readFile(new URL(`../extension/shared/${name}.js`, import.meta.url), 'utf8'), context);
  await context.LexiLoomI18n.ready;
  return { i18n: context.LexiLoomI18n, requests };
}
test('localized substitutions remain literal and are not recursively expanded', async () => {
  const { i18n } = await load('en-US');
  assert.equal(i18n.t('example', ['$2 literal', 'done']), '$2 literal / done / $10 / $0');
  assert.equal(i18n.t(undefined), '');
  assert.equal(i18n.t('source_unregistered-with-hyphens'), '');
});
test('Hong Kong and Taiwan request the packaged Traditional Chinese catalog', async () => {
  for (const language of ['zh-HK', 'zh-Hant-HK', 'zh-TW']) {
    const { requests } = await load(language);
    assert.equal(requests[0].type, 'GET_CATALOG');
    assert.equal(requests[0].catalog, 'zh_TW');
  }
  assert.equal((await load('zh-CN')).requests[0].catalog, 'zh_CN');
});

test('apply translates text, aria labels, titles, placeholders and the document language', async () => {
  const { i18n } = await load('en-US');
  const node = (key, field) => {
    const item = {
      dataset: {}, textContent: '', placeholder: '', title: '', attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; }
    };
    item.dataset[field] = key;
    return item;
  };
  const text = node('labelText', 'i18n');
  const aria = node('labelAria', 'i18nAria');
  const title = node('labelTitle', 'i18nTitle');
  const placeholder = node('labelPlaceholder', 'i18nPlaceholder');
  const root = {
    documentElement: { lang: '' },
    querySelectorAll(selector) {
      return {
        '[data-i18n]': [text], '[data-i18n-aria]': [aria],
        '[data-i18n-title]': [title], '[data-i18n-placeholder]': [placeholder]
      }[selector] || [];
    }
  };
  i18n.apply(root);
  assert.equal(root.documentElement.lang, 'en');
  assert.equal(text.textContent, 'Label text');
  assert.equal(aria.attributes['aria-label'], 'Aria label');
  assert.equal(title.title, 'Title text');
  assert.equal(placeholder.placeholder, 'Placeholder text');
});
