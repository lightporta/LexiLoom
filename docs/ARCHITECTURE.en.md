# The lookup and card contract

[中文](ARCHITECTURE.md)

UI language, headword language and dictionary region are separate inputs. Automatic mode covers English and Chinese for mainland China, Hong Kong and Taiwan. Explicit targets add Japanese, Korean, French, German and Spanish cards with Simplified Chinese definitions, including in an English interface.

## Lookup path

```text
Selection → LanguageProfile detection and segmentation
          → DictionaryEngine adapter selection
          → DictionaryEntry validation
          → CardView presentation policy
          → optional LexiLoomGuidance links (link-only) → card
```

- `extension/shared/languages.js` registers detection, segmentation, regions, reading systems, adapter selection and presentation policy. `core.js` and `locale.js` keep their existing entry points.
- `dictionary.js` registers adapters and shares request limits. Choosing an English dictionary does not overwrite the Chinese region.
- `entry.js` keeps adapter responses within one bounded model. Arbitrary response fields are not forwarded to pages.
- `present.js` creates a `CardView`. Cards use its summary, display flags, example limit and speech locale instead of choosing dictionaries themselves.

## DictionaryEntry

| Field | Meaning |
| --- | --- |
| `word` | Validated query |
| `displayWord` | Spelling shown on the card |
| `lemma` | Canonical headword where provided; otherwise the query, not a claim of lemmatization |
| `language`, `profileId`, `region` | Headword language, profile and dictionary region |
| `status` | `ok`, `not-found` or `error` |
| `pronunciations` | Readings, optional audio, explicit speech locale and audio attribution |
| `meanings` | Definitions, original part of speech, usage and examples; independent corpora may have separate Chinese and English sections |
| `source` | Primary and combined sources, attribution and their respective licenses |
| `notice`, `error` | Missing fields, fallback information or errors |

`queryWord` and `queryWords` retain the spellings used for lookup. A “干／幹” result explains its scope; it does not claim to cover every sense of “干／乾／幹”.

Definitions and references remain text. Links accept only HTTPS URLs without credentials. Taiwan MOE text stays verbatim, rather than being rewritten to fit another region. Example references, text licenses and audio licenses are retained separately.

## Requests and settings

All adapters share at most four external requests, including subrequests for combined entries. A slot stays occupied until the bounded JSON response body finishes downloading. Requests have size and time limits; official entries are not persistently cached.

Settings saves are serialized partial updates. Only supplied fields change, so a delayed popup toggle cannot overwrite a region just saved by another window or resume a paused lookup.

## Adding a language

Register a profile and adapter with a speech locale, sources and presentation policy. New profiles are `explicitOnly`, selected by `targetLanguage: auto | ja | ko | fr | de | es`. Japanese/Korean use their own segmentation locale; foreign case and accents remain intact. The hypothetical contract-test language still tests the extension point only.

`normalizeWord(value, targetLanguage)` and `parseSelection(text, uiLanguage, targetLanguage)` carry the explicit choice through the pipeline. Content scripts capture the selection before refreshing settings and parsing. Workers use one settings snapshot for validation and dispatch. Language changes clear old reading/example controls and repeat lookup; version guards reject stale results.

`multilingual.js` requests `/v1/zh/word/{word}?lang={language}`. It checks the headword, edition and any explicit source-language fields; compact records without those fields rely on the documented API filter. Only Chinese glosses and Chinese example translations are converted to Simplified. Headwords and source-language examples keep their spelling. `preferredMeaningLanguage: 'zh'` keeps Chinese definitions visible in an English UI; speech uses the headword language.

Confirmed missing entries and valid entries lacking Chinese glosses become `not-found` and `translation-unavailable` respectively. Generic HTTP errors do not establish absence. A coverage gap retains dictionary navigation, while missing readings/examples are identified without inventing content or interpreting a citation as an example.

## Link directory (links, not fetches)

`extension/shared/guidance.js` is the dictionary link directory. It only builds external links to dictionary sites; it never requests, parses or rehosts the destination page, so it is not a dictionary adapter. The background worker, the content script and the options page load the same module; the module itself makes no network request.

### Contract

```js
globalThis.LexiLoomGuidance.resolve(entry, { uiLanguage, uiRegion, settings })
```

Returns at most three frozen link objects, selected by ascending `priority` with duplicate URLs removed:

`resolveAll(entry, options)` returns the full directory for `navigation.html`. That page explicitly selects `en / zh / ja / ko / fr / de / es`, rather than guessing a new language from Latin letters or Han characters. It does not change Chinese/English card detection or adapters.

| Field | Meaning |
| --- | --- |
| `id` | Built-in site id (such as `zh-wiktionary` or `en-oxford-learner`) or `custom-<number>` |
| `name` / `nameTraditional` | Site name; a Traditional Chinese interface uses `nameTraditional` and falls back to `name` |
| `url` | HTTPS address with `{word}` filled in and encoded |
| `host` | Hostname of that address |
| `custom` | Whether the entry comes from a user template |
| `mode` | Always `"link-only"` |
| `license` | Site license, or an empty string when none is declared (for example `CC BY-SA 4.0` or `CC BY-ND 3.0 TW`) |

Matching: `entry.language` selects the language; unknown languages do not fall back to English sites. `entry.region` filters sites declaring `regions`, falling back to `options.uiRegion`; `options.uiLanguage` filters sites declaring `uiLanguages`. A custom template's optional `language` scopes it to that headword language; omission or `*` is universal. Custom templates have priority 0.

### Custom templates

Use `Name | https://…/{word}`, or `fr | Name | https://…/{word}` for a language, up to six rows; `#` starts a comment. Names allow 60 Unicode code points and templates 300 characters. HTTPS and `{word}` are required; credentials, control characters, backslashes and extra braces are rejected. The headword cannot change the URL authority. A query allows up to 64 Unicode code points without truncation.

`validateCustom` validates the entire group before writing. One invalid row rejects the save without partial writes. `sanitize` tolerates damaged older storage and creates public snapshots; it does not silently drop rows from a successful save.

### Settings and refresh

`guidanceDisabled` and `guidanceCustom` (`{ name, template, language? }`) live in local `settings`. Options send only changed fields. `GET_SETTINGS` and broadcasts share a public shape, including `englishProvider` and template language scope, without the bridge token.

Storage is limited to trusted contexts. The worker broadcasts `SETTINGS_CHANGED` after saves; content scripts refresh links or repeat lookup when `provider`, `englishProvider`, `chineseRegion` or `targetLanguage` changes. A card's `OPEN_NAVIGATION` request asks the worker to open the extension page with an encoded URL fragment. The page need not be web-accessible.
