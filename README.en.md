# LexiLoom

[中文](README.md)

**Let a word unfold with the reading.** LexiLoom joins lexicon and loom. The Chinese name 语织 leaves room for later work on Chinese, sentences, and other languages.

An independent Chrome Manifest V3 extension, version **0.2.1**, for Chrome on Windows, Linux, and macOS. The interface follows the browser language. The Chinese interface keeps Chinese-first glosses, translations, and usage notes. The English interface shows only the English definition, pronunciation, and example sentences. It does not translate whole sentences.

![Word card loaded in the browser](docs/browser-single.png)

## Try it: install in Chrome

**Chrome 140 or newer** is required. The extension itself does not need Node, npm install, or a build.

1. Open `chrome://extensions` and turn on Developer mode.
2. Click Load unpacked.
3. Choose this project's **`extension` folder**, the one that contains `manifest.json` directly. Do not choose the project root.
4. Refresh ordinary pages that are already open, then double-click an English word. You can pin the extension.
5. Click the extension icon, then **Open the reading room**, to try the original bilingual sample cards. Dictionary and connection settings can change the source.

You can also unzip `dist/LexiLoom-0.2.1-chrome.zip` and load the unpacked `LexiLoom` folder. All three operating systems use the **same universal package**. The ZIP itself cannot be loaded with Load unpacked. Platform launchers are in [Windows / Linux / macOS](docs/CROSS_PLATFORM.en.md).

A new install defaults to Chinese-first for a Chinese browser. No key or local service is required for that path. An English browser looks up Free Dictionary instead and does not request the Chinese Wiktionary service. Saved 0.1.0 settings are kept. The Chinese interface can switch back to Chinese-first, or you can restore defaults and save.

## How to use

| Action | Result |
| --- | --- |
| Double-click a word | Uses the browser's own highlight and shows a compact card |
| Drag across one or more words, then click Look up | Splits, deduplicates, and makes one connected card per word |
| Click the headword or the card summary | Expands width and content with a 280ms linear transition; click again to collapse |
| Windows / Linux: Ctrl + double-click; macOS: ⌘ + double-click | Appends another word, up to 8 |
| × on a card | Removes that word only |
| Top ×, Esc, or a click on empty page space | Leaves lookup and keeps your place in the text |
| Pronunciation button after expanding | Plays dictionary audio when the source provides it; system speech is labeled as such |

Several cards can be open at once. When the content is taller than the viewport, scroll inside the card; the close button stays visible. Reduced-motion settings are respected.

The browser can keep only one native selection, so words that are not in one span are **appended to the card row**. A double-click already selects the word. After a drag, click the lookup control directly so a second double-click does not change the selection.

A confirmed miss says **This word could not be found**. Offline, timeout, quota, configuration, and authorization failures each have their own message. A word missing from the demo list asks you to switch to an online dictionary; it does not pretend the word is absent from every dictionary.

## What the English interface shows

On an English browser, a card has three parts: pronunciation, the English definition, and example sentences from the source. Chinese glosses, Chinese translations, Chinese usage notes, and Chinese fallback banners are not shown. `smart` and Chinese Wiktionary settings stored for the Chinese interface are left untouched and are not queried. The English interface remembers its own choice among Free Dictionary (the default), the local demo, Oxford, or Cambridge.

If an Oxford or Cambridge payload has only Chinese text and no English definition, the card says so and does not fill the gap with Chinese.

## Where dictionary data comes from

| Mode | Ready to use? | What it contains |
| --- | --- | --- |
| Chinese first (default on the Chinese interface) | Yes, online | Chinese Wiktionary via WiktApi, then an English fallback. Used only when the browser language is Chinese |
| Chinese Wiktionary · WiktApi | Yes, online, Chinese interface | Chinese glosses, existing examples and citations, phonetics, and audio. Some text is Traditional Chinese. Not used by the English interface |
| Free Dictionary API | Yes, online | English definitions, phonetics, examples and audio already in the response. This is the English interface default |
| Local bilingual demo | Yes, offline | 12 original Chinese-English samples. The English card uses the English definition, phonetic, and example |
| Oxford Dictionaries API | Official access and the local service | Words lookup, senses, phonetics, and examples are adapted. The English card drops Chinese fields |
| Cambridge Dictionary API | Official approval, the local service, and an authorized dictionary code | Text is extracted from entry HTML. Chinese fields are not shown on the English card |

**Oxford and Cambridge have not been exercised with real keys.** Adapter and bridge tests use synthetic samples. That is not a claim that licensed data is connected. An unfamiliar Cambridge HTML shape is reported as an error.

Chinese lookups from the Chinese interface request `api.wiktapi.dev` from the extension background. They do not open or control a hidden tab. WiktApi is a third-party structured view of Chinese Wiktionary, not an official Oxford, Cambridge, or Wikimedia API. Original script is kept; there is no automatic Traditional/Simplified conversion. Coverage and availability can change. [Quick start](https://wiktapi.dev/quickstart), [data pipeline](https://wiktapi.dev/concepts/data-pipeline).

Demo words: `serendipity`, `luminous`, `ephemeral`, `curiosity`, `language`, `wander`, `loom`, `bloom`, `resilient`, `connect`, `apple`, `hello`. The reading room's missing-word control is an explicit state demo.

Official keys stay in `bridge/.env` on this computer. They are not placed in page scripts, chats, or the extension ZIP. The extension stores only the local service token, and only trusted extension pages and the background can read it. Steps are in the **[local dictionary service](bridge/README.en.md)**.

The Oxford Sandbox has a call quota and currently accepts only words that start with *a*; `apple` is a usable test. That trial limit is not shown as "word not found". Before a public release, confirm the dictionary license. Official entries are not cached persistently or saved offline by default. [Oxford FAQ](https://developer.oxforddictionaries.com/faq), [Cambridge developer terms](https://dev.eim-ciip-cambridge.org/api/terms-and-conditions).

## Similar extensions

Official store and product pages already cover nearby interactions: **[Google Dictionary](https://chromewebstore.google.com/detail/google-dictionary-by-goog/mgijmajocgfcbeboacabfgobmjgjcoja)** has a double-click bubble; **[Saladict](https://chromewebstore.google.com/detail/cdonnmffkdaoajfknoeeecmchibpmkmg)** selects text and aggregates dictionaries; **[Mate Translate](https://matetranslate.com/en/chrome)** and **[TransOver](https://chromewebstore.google.com/detail/transover/aggiiclaiamajehmlfpkjmlbadmkledi)** also cover selection translation.

This project focuses on **several connected words, each card opening on its own**. Only those official descriptions were checked. The interaction is not claimed to be unique. More comparison notes, in Chinese, are in [docs/RESEARCH.md](docs/RESEARCH.md).

## Develop and verify

Development tools and the local dictionary service need **Node.js 22+**. The extension, service, and packager have no third-party runtime dependencies. Browser QA uses a locked dev dependency.

```sh
npm test          # 51 tests: sources and fallback, auth, concurrency, English card projection, cross-platform ZIP and launchers
npm run check     # JS syntax, manifest, resource references, version match, locale catalogs, CSP
npm run preview   # http://127.0.0.1:4173 only, local bilingual demo
npm run package   # unpacked directory and ZIP under dist/
```

Browser verification installs the locked dev dependency. On Linux, add `--with-deps`:

```sh
npm ci
npx --no-install playwright-core install chromium
npm run test:browser
```

The default browser flow uses deterministic synthetic dictionary samples. An extra online check on macOS or Linux is `LEXILOOM_LIVE_TESTS=1 npm run test:browser`. PowerShell: `$env:LEXILOOM_LIVE_TESTS='1'; npm run test:browser`. Browser QA launches Chromium with `--lang=zh-CN` so the Chinese interface assertions stay stable. English card projection is covered by Node tests.

On 2026-10-31 an unpacked extension was loaded in an isolated **Chrome for Testing 156.0.8078.4** on macOS, with **23 browser checks passing**, including the Chinese source, fallback, attribution, and a real online query. WiktApi returned “蘋果（水果）” for `apple`, and Free Dictionary succeeded as well. Windows, Linux, and macOS CI is configured and runs after you push. **There is no Windows or Linux host result yet.** The everyday Chrome profile was not modified, and the extension was not published to a store.

Verified and unverified items are recorded in Chinese in [docs/VALIDATION.md](docs/VALIDATION.md). Raw browser output is in [JSON](docs/browser-validation.json).

## Layout and later work

```text
extension/           Chrome extension that loads as-is
  content.js         Selection, triggers, closed Shadow DOM cards
  background/        Controlled messages and network requests; the page never sees the service token
  shared/            Word rules, the shared entry model, dictionary adapters, locale projection, demo data
  _locales/          Chinese and English interface catalogs
  ui/                Card theme, toolbar popup, settings, and the reading room
bridge/              Optional local proxy for official dictionaries
tests/               Automated tests and synthetic dictionary samples
tools/               Check, preview, package, icons, and browser verification
scripts/             Windows .cmd, Linux .sh, and macOS .command launchers
.github/workflows/   Node / Chromium checks on three platforms and byte-identical ZIP comparison
docs/                Research, validation, and real browser screenshots
dist/                Generated package, with no official keys
```

Further languages can be added on the shared entry model, then segmentation, sentence translation, and a word list. The first versions do not include those. The current build injects only the top document. It does not cover iframes, inputs, editors, Chrome internal pages, the store, or the built-in PDF viewer. A page's layout, CSP, or audio policy can also block playback; system speech is the alternative.

Privacy: [PRIVACY.en.md](PRIVACY.en.md).

## License

Original code, styles, original demo entries, and documentation in this repository are under the [MIT License](LICENSE), copyright lightporta, 2026. Wiktionary text and audio, and Oxford / Cambridge material available through an authorized account, keep their own licenses. MIT does not relicense those materials. See [THIRD_PARTY.en.md](THIRD_PARTY.en.md).

## Local Git and a manual push

This project is its own Git repository on `main`. The commit identity follows the existing local `lightporta` configuration. The repository was initialized locally and was not pushed from here. `.env`, dependencies, package output, and temporary results are ignored. The lockfile and validation records stay in source.

After you create an empty remote, run this from the project directory and replace the sample URL:

```sh
git remote add origin https://github.com/YOUR_ACCOUNT/LexiLoom.git
git push -u origin main
```

After the push, read the Windows, Linux, and macOS results in GitHub Actions. Version notes: [CHANGELOG.en.md](CHANGELOG.en.md).
