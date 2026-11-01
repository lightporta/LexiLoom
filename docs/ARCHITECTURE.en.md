# The lookup and card contract

[中文](ARCHITECTURE.md)

UI language, headword language and dictionary region are separate inputs. An English UI can look up “學習”; a Chinese UI looking up `apple` still keeps an English headword. Shipped support covers English and Chinese for mainland China, Hong Kong and Taiwan.

## Lookup path

```text
Selection → LanguageProfile detection and segmentation
          → DictionaryEngine adapter selection
          → DictionaryEntry validation
          → CardView presentation policy → card
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
