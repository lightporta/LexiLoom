# Sources and attribution

[中文](THIRD_PARTY.md)

The [MIT License](LICENSE) covers original code, styles, original demo entries, and documentation in this repository. It does not relicense dictionary text, audio, or other third-party material described below.

## Chinese Wiktionary / WiktApi

Chinese glosses are structured by [WiktApi](https://wiktapi.dev/quickstart). The data comes from [Chinese Wiktionary](https://zh.wiktionary.org/) through pipelines such as [Kaikki / Wiktextract](https://kaikki.org/). WiktApi is an independent third-party service, not an official Wikimedia, Oxford, or Cambridge service. The English interface does not request it.

Cards link to the original entry and show “Chinese Wiktionary, excerpted via WiktApi” together with the [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) license link. Definitions and examples are shortened for display and the original text is kept. Citations use the reference the response provides. Other items may have further source requirements. The entry itself and [Wikimedia Terms of Use §7](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content) are the full record.

Wikimedia Commons audio is licensed separately from the entry text. Cards link to the File description page for author, source, and license. They do not assume every audio file is CC BY-SA 4.0.

## Free Dictionary API

Definitions, entry sources, and audio from the [Free Dictionary API](https://dictionaryapi.dev/) may each have their own license. The adapter keeps the entry source, text license, and separate audio source from the response, and the card links to them. This is the dictionary the English interface uses by default.

## Oxford / Cambridge

These modes use an API and dataset your own account is authorized to access. The extension does not ship or embed official dictionary content and does not persistently store query results. There is no evidence yet of a live check with real credentials. The license is the one on the official account and agreement. The English card shows English definitions, pronunciation, and example sentences, and omits Chinese fields.

## Local demo and tests

The 12 bilingual samples and the test fixtures are original examples from this project. They are not presented as any official dictionary. Live online checks and synthetic-sample tests are recorded separately.

## Development tools

Playwright Core is used only for development and testing. Its [Apache-2.0 license](https://github.com/microsoft/playwright/blob/main/LICENSE) stays with that package. It is not packed into the extension.
