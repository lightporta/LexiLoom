# Changelog

[中文](CHANGELOG.md)

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

The run that has actually been measured is from macOS. Windows and Linux results wait for the matching CI runners after you push. The official Oxford and Cambridge APIs still need a credential check.

## 0.1.0 · 2026-10-31

- First double-click cards, connected words, independent smooth expand, pronunciation, and dismiss.
- Free Dictionary English-English lookup, 12 original bilingual samples, and an optional local service for official dictionaries.
