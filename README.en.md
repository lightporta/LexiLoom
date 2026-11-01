# LexiLoom

[中文](README.md)

Look up a word without leaving the page. Double-click an English word. For Chinese, select the word and click the small lookup button. A short definition shows up beside the text; open the card for pronunciation, usage and examples. Several cards can stay on the page, and each one opens on its own.

![English word card](docs/browser-single.png)

## Install

Chrome 140 or newer. The same extension runs on Windows, macOS and Linux. There is nothing to compile.

1. Download the source, or unzip `dist/LexiLoom-<version>-chrome.zip`.
2. Open `chrome://extensions` and turn on Developer mode.
3. Choose Load unpacked. For a source checkout, pick the `extension` folder. It has to contain `manifest.json`.
4. Refresh pages that were already open.

The toolbar icon opens settings, and a page where you can try the cards before reading anything.

Packaging also writes a `-store.zip` with `manifest.json` at the root for a future store submission.

## Use

Click a headword to open the card, and click it again to close it. Hold Ctrl (⌘ on a Mac) and double-click another word to add it to the same group, up to 8. The × on a card removes that word. The × at the top, Esc, or a click on empty page closes the whole group.

If the dictionary has a recording, the card plays it. Otherwise it uses the browser's own voice.

Chinese and English use the same card. The interface follows Chrome's language. A Chinese lookup shows the reading for that region, one or two examples, and an English explanation. If the source left something out, the card says so.

- Simplified Chinese, mainland China: simplified definitions and Hanyu Pinyin.
- Traditional Chinese, Taiwan: a Taiwan entry and Zhuyin. The wording is the Ministry of Education text.
- Traditional Chinese, Hong Kong: traditional definitions, with Jyutping that the source marks as Hong Kong. A Mandarin reading, when there is one, is labeled as a supplement.

OpenCC only changes how Wiktionary text is displayed and which spelling is searched. A mainland entry with its characters converted is still a mainland entry. If Chrome only offers one Traditional Chinese and cannot tell Hong Kong from Taiwan, pick the region in settings.

Some simplified characters have several traditional counterparts. For a character such as “干”, the card keeps the original lookup and names the converted spelling it also checked. This does not cover every possible sense; selecting a complete word gives more context.

In the English interface, an English word shows the English definition, pronunciation and examples. A Chinese word still keeps its Chinese spelling and reading.

Chrome's own pages, the extension store, the built-in PDF viewer, text fields, editors and iframes are not covered yet.

## Where the words come from

The defaults need no API key.

In a Chinese interface, an English word tries Chinese Wiktionary first and then Free Dictionary. The card names the source and says when it had to fall back. In an English interface, an English word uses Free Dictionary.

Chinese words follow the region:

- Mainland definitions, and the Wiktionary readings, come through [WiktApi](https://wiktapi.dev/).
- Taiwan definitions and Zhuyin come first from the Ministry of Education dictionary on Moedict.
- Hong Kong prefers a Wiktionary reading marked Cantonese and Hong Kong.
- The English explanation comes from the Chinese entry in English Wiktionary.
- [Free Dictionary](https://dictionaryapi.dev/) supplies the English definition and audio for English words.
- Oxford and Cambridge are optional. They need your own official access and the local dictionary service. See [bridge/README.en.md](bridge/README.en.md).
- The English demo entries are written for this project. The Chinese practice section uses online dictionaries.

Source links, example references and license links stay at the bottom of the card. Coverage differs by dictionary. Attribution is in [THIRD_PARTY.en.md](THIRD_PARTY.en.md). A lookup sends the word you selected. It does not upload the page or keep a history. See [Privacy](PRIVACY.en.md).

## Development

Node.js 22 or newer. The extension loads on its own and includes OpenCC. The local service and packager need no npm runtime dependencies. Playwright is for the browser tests.

```sh
npm ci
npm test
npm run check
npm run preview   # http://127.0.0.1:4173
npm run package   # writes to dist/
```

Browser tests:

```sh
npx --no-install playwright-core install chromium
npm run test:browser
npm run test:browser:locales
npm run test:browser:ui
```

On Linux, install Chromium with `install --with-deps chromium`. Tests use fixed samples unless you set `LEXILOOM_LIVE_TESTS=1`.

Launchers and CI are in the [cross-platform notes](docs/CROSS_PLATFORM.en.md). Recorded results are in [docs/VALIDATION.md](docs/VALIDATION.md). The [architecture notes](docs/ARCHITECTURE.en.md) describe language profiles, adapters and the card contract. Release notes are in [CHANGELOG.en.md](CHANGELOG.en.md).

## License

Code, styles, sample entries and these notes are [MIT](LICENSE), copyright lightporta. Dictionary text, quotations and audio keep their own licenses. See [THIRD_PARTY.en.md](THIRD_PARTY.en.md).
