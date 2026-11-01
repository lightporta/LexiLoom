# Changelog

[中文](CHANGELOG.md)

## 0.3.1 · 2026-11-01

- Language profiles, dictionary adapters and cards now share one entry contract. UI language and headword language remain separate; combined requests share four slots until their response bodies finish downloading.
- Ambiguous simplified characters keep both the original and converted lookup. Mismatched headwords and readings from another language are rejected. Supplementary Taiwan readings retain their source attribution.
- Fixed hidden Chinese attribution and notices in the English UI, and Simplified part-of-speech labels in the Traditional UI. System speech follows the reading's explicit locale.
- Settings saves update only the supplied fields, preserving pause state and preferences changed in another window.
- Packaging writes both the unpacked-extension layout and a store layout with the manifest at its root. Added UI regressions and current validation notes.
- Fixed a macOS CI animation sampling false failure by checking the real transition timeline, retaining linear expansion assertions and adding renderer-stall and reduced-motion regressions.
- Hardened browser QA further: force `prefers-reduced-motion: no-preference` through Playwright and CDP on runners, wait for lookup completion by card busy/loading state (`browser-lookup-wait.js`), and include animation probe details on failure.

## 0.3.0 · 2026-10-31

- Chinese words use the same card as English words. Simplified Chinese shows Hanyu Pinyin. Taiwan shows the Ministry of Education wording and Zhuyin. Hong Kong prefers Jyutping marked as Hong Kong.
- A Chinese entry includes an English explanation and at most two examples. The card says when a reading, definition or example is missing.
- Script conversion applies to Wiktionary display and search spelling. A converted entry is not treated as another region's dictionary.
- Browser tests set the interface language inside a copy of the extension. `--lang` does not change the extension language on macOS or Linux. On Windows, the long and short names of one temporary directory are compared as the operating system's final path.

## 0.2.1 · 2026-10-31

- The interface follows the browser language. The Chinese interface keeps the existing Chinese-first cards. The English interface shows only the English definition, pronunciation, and example sentences, and it does not request the Chinese Wiktionary service.
- The English interface remembers Free Dictionary, the demo, Oxford, or Cambridge on its own and does not overwrite the dictionary saved for the Chinese interface.
- Added the MIT license and English copies of the README, privacy notice, cross-platform notes, local dictionary service guide, third-party attribution, and this changelog.

## 0.2.0 · 2026-10-31

- Chinese-first by default: Chinese Wiktionary through WiktApi, with no key or local service. A missing or failed entry falls back to English-English and says why.
- Chinese Wiktionary, Free Dictionary, the demo, Oxford, or Cambridge can be chosen on their own. An existing source setting is kept.
- Real sources, example citations, text licenses, and audio-file attribution are kept. Chinese text stays in the dictionary's original script.
- Network lookups share a concurrency limit of 4. A word is reported missing only when both sources confirm that.
- Windows, Linux, and macOS share one universal Chrome package. A deterministic ZIP is built with Node, without a platform compression command.
- Added service, preview, and package launchers for the three systems, including tests for paths that contain spaces and a fixed newline convention.
- Pinned the browser QA dependency, added three-platform CI and a byte-identical ZIP check. Default QA does not depend on a third-party site being online.
- Initialized a separate Git repository and the `main` branch, with a local commit for you to push.

Version 0.2.0 was verified locally on macOS. Commit `c5301dd` later passed the three-platform CI, as recorded in the validation notes. Official Oxford and Cambridge access still needs a credential check.

## 0.1.0 · 2026-10-31

- First double-click cards, connected words, independent smooth expand, pronunciation, and dismiss.
- Free Dictionary English-English lookup, 12 original bilingual samples, and an optional local service for official dictionaries.
