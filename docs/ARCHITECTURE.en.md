# The lookup and card contract

[中文](ARCHITECTURE.md)

UI language, headword language and dictionary region are separate inputs. An English UI can look up “學習”; a Chinese UI looking up `apple` still keeps an English headword. Shipped support covers English and Chinese for mainland China, Hong Kong and Taiwan.

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

Register a profile and adapter with a speech locale, sources and presentation policy. The card's expansion, grouping, removal and close behavior remains reusable. A hypothetical language in the contract tests verifies this extension point; it is not advertised as an additional shipped language.

Languages sharing Latin script cannot be reliably distinguished by character shape alone. Supporting them will also need an explicit target-language choice or a suitable detection strategy.

## Link directory (links, not fetches)

`extension/shared/guidance.js` is the dictionary link directory. It only builds external links to dictionary sites; it never requests, parses or rehosts the destination page, so it is not a dictionary adapter. The background worker, the content script and the options page load the same module; the module itself makes no network request.

### Contract

```js
globalThis.LexiLoomGuidance.resolve(entry, { uiLanguage, uiRegion, settings })
```

Returns at most three frozen link objects, selected by ascending `priority` with duplicate URLs removed:

| Field | Meaning |
| --- | --- |
| `id` | Built-in site id (such as `zh-wiktionary` or `en-oxford-learner`) or `custom-<number>` |
| `name` / `nameTraditional` | Site name; a Traditional Chinese interface uses `nameTraditional` and falls back to `name` |
| `url` | HTTPS address with `{word}` filled in and encoded |
| `host` | Hostname of that address |
| `custom` | Whether the entry comes from a user template |
| `mode` | Always `"link-only"` |
| `license` | Site license, or an empty string when none is declared (for example `CC BY-SA 4.0` or `CC BY-ND 3.0 TW`) |

Matching: `entry.language` (`zh` / `en`) selects the language; `entry.region` filters sites that declare `regions`, falling back to `options.uiRegion` when the entry has no region; `options.uiLanguage` filters sites that declare `uiLanguages` as `en` / `zh`. Custom templates are language-neutral, have `priority` 0 and come before built-in sites.

### Custom templates

The format is `Name | https://…/{word}`, one per line, at most six; lines starting with `#` are ignored. `sanitize` validates again before saving: the template must start with `https://`, must contain `{word}`, must not contain other braces, the name is limited to 60 characters and the template to 300 characters. Entries that fail are dropped and not stored.

### Settings and refresh

`guidanceDisabled` (array of disabled built-in site ids) and `guidanceCustom` (array of `{ name, template }`) live in the `settings` key of `chrome.storage.local`. The worker writes them only after `sanitize`, and `GET_SETTINGS` sends the content script just the `publicSettings` result.

The content script listens to `chrome.storage.onChanged` (the `settings` key). On a settings change it resolves and renders the links of cards that are already open; when `provider`, `englishProvider` or `chineseRegion` changes it looks the word up again. Open cards therefore do not wait for the next selection, and they do not keep showing the previous source's text after a source change.
