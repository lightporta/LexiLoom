# Sources and attribution

[中文](THIRD_PARTY.md)

The [MIT License](LICENSE) covers original code, styles, original demo entries, and documentation in this repository. It does not relicense dictionary text, audio, or other third-party material described below.

## Chinese Wiktionary / WiktApi

Chinese glosses are structured by [WiktApi](https://wiktapi.dev/quickstart). The data comes from [Chinese Wiktionary](https://zh.wiktionary.org/) through pipelines such as [Kaikki / Wiktextract](https://kaikki.org/). WiktApi is an independent third-party service, not an official Wikimedia, Oxford, or Cambridge service. English headwords in the English interface use Free Dictionary and do not call this service. Chinese headwords do, including from the English interface.

Cards link to the original entry and show “Chinese Wiktionary, excerpted via WiktApi” together with the [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) license link. Definitions and examples are shortened for display and the original text is kept. Citations use the reference the response provides. Other items may have further source requirements. The entry itself and [Wikimedia Terms of Use §7](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content) are the full record.

The Chinese entry in English Wiktionary is also read through WiktApi, so a Chinese word can show an English explanation. That text is CC BY-SA 4.0 as well.

Japanese, Korean, French, German and Spanish cards use entries for those languages in Chinese Wiktionary, with the same license and original-entry attribution. OpenCC converts Chinese glosses and Chinese example translations to Simplified spelling, as noted on the card. Original headwords and source-language examples are not converted. Missing or unreliable examples are not reconstructed.

Wikimedia Commons audio is licensed separately from the entry text. Cards link to the File description page for author, source, and license. They do not assume every audio file is CC BY-SA 4.0.

## Ministry of Education dictionary / Moedict

In the Taiwan interface, the Chinese definition and Zhuyin come first from the Ministry of Education dictionary JSON published by [Moedict](https://www.moedict.tw/). The text is shown as published. It is not converted between scripts and the examples are not rewritten. The license is [CC BY-ND 3.0 TW](https://creativecommons.org/licenses/by-nd/3.0/tw/). The card links to the entry on Moedict.

Hong Kong and mainland lookups do not call Moedict. A Hong Kong reading is a Wiktionary record marked Cantonese and Hong Kong. Converting a mainland or Taiwan entry to another script does not turn it into a Hong Kong entry.

## OpenCC

The extension vendors [opencc-js 1.4.2](https://github.com/nk2028/opencc-js), licensed MIT AND Apache-2.0. It converts the display spelling of Wiktionary text and the spelling used to search. Ministry of Education text does not pass through it. The font data and license copies are in `extension/shared/chinese-data/`.

## Free Dictionary API

Definitions, entry sources, and audio from the [Free Dictionary API](https://dictionaryapi.dev/) may each have their own license. The adapter keeps the entry source, text license, and separate audio source from the response, and the card links to them. This is the dictionary the English interface uses by default.

## Oxford / Cambridge

These modes use an API and dataset your own account is authorized to access. The extension does not ship or embed official dictionary content and does not persistently store query results. There is no evidence yet of a live check with real credentials. The license is the one on the official account and agreement. The English card shows English definitions, pronunciation, and example sentences, and omits Chinese fields.

## Dictionary navigation (external links)

The 23 built-in navigation entries (Wiktionary editions, Moedict, Han Dian, Larousse, Duden, RAE and others) store only a site name and an HTTPS URL template, used to open the external site when clicked. The extension does not fetch or rehost those pages; each destination site's own terms and privacy policy apply to your visit. A navigation entry does not confirm that the site contains the headword.

## Local demo and tests

The 12 bilingual samples and the test fixtures are original examples from this project. They are not presented as any official dictionary. Live online checks and synthetic-sample tests are recorded separately.

## Development tools

Playwright Core is used only for development and testing. Its [Apache-2.0 license](https://github.com/microsoft/playwright/blob/main/LICENSE) stays with that package. It is not packed into the extension.
