# Local bridge for official dictionaries

[中文](README.md)

This optional service lets the Chrome extension reach the Oxford Dictionaries API or the Cambridge Dictionary API through this computer. Official keys are written only in `bridge/.env`. They are not written into the extension and are not given to web pages.

Node.js 24 is required. Without official API access, use the extension's sample entries or Free Dictionary. On an English browser, Free Dictionary is already the default, and the Chinese Wiktionary service is not requested.

## Start

From the project root:

```sh
cp bridge/.env.example bridge/.env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Write the random string into `BRIDGE_TOKEN` in `bridge/.env`, and enter the same token in the extension settings. Fill in the Oxford or Cambridge credentials your account is authorized to use, then run:

```sh
node --env-file=bridge/.env bridge/server.js
```

The service listens only on `127.0.0.1:47821`. Close the terminal or press Ctrl+C to stop it. Restart after you change `.env`.

## Oxford

- Set `OXFORD_APP_ID`, `OXFORD_APP_KEY`, and `OXFORD_LANGUAGE` to `en-gb` or `en-us`.
- Trial credentials use `OXFORD_SANDBOX=true`. Production credentials use `false`.
- The trial environment accepts only words that start with *a*. The published trial quota is 500 calls; quota and plan follow the account and the official pages.
- The service uses the recommended Words endpoint and can query headwords and inflected forms.
- This is the **Oxford Dictionaries API**. It is not the OED or Oxford Learner’s Dictionaries, and it does not promise Chinese definitions.

Official docs: [credentials and authentication](https://developer.oxforddictionaries.com/documentation/getting_started), [Words endpoint](https://developer.oxforddictionaries.com/endpoints), [Sandbox](https://developer.oxforddictionaries.com/documentation/getting_started/sandbox), [API FAQ and caching](https://developer.oxforddictionaries.com/faq).

## Cambridge

Set `CAMBRIDGE_ACCESS_KEY`. The dictionary code must come from the list your account is actually authorized to use. Do not guess it from a website URL. **Read the Cambridge dictionary list** in the extension settings calls the local `/v1/dictionaries` route and lists the codes that key can access. Write the chosen code to `CAMBRIDGE_DICTIONARY_CODE` and restart the service.

The request is `GET /dictionaries/{dictionaryCode}/search/first?q={word}&format=html` with an `accessKey` header. `entryContent` in the response is an HTML string. The adapter extracts plain-text definitions, translations, phonetics, and examples from known structures. It does not execute that HTML or insert it into the page. An unknown layout is reported as a format error, with a link to the original dictionary.

The English interface drops Chinese translation fields. A monolingual dictionary is not given invented Chinese, and a bilingual one is not shown in Chinese on the English card. Cambridge requires an approved application and a matching license. Confirm that license before you distribute the extension to other people.

Official docs: [API specification](https://dev.eim-ciip-cambridge.org/api/specification), [developer resources](https://dev.eim-ciip-cambridge.org/api/resources), [terms](https://dev.eim-ciip-cambridge.org/api/terms-and-conditions).

## Local routes

Every route requires `Authorization: Bearer <BRIDGE_TOKEN>`.

| GET path | Role |
| --- | --- |
| `/v1/health` | Service and credential configuration, without returning secrets |
| `/v1/lookup?provider=oxford&word=apple` | Oxford lookup |
| `/v1/lookup?provider=cambridge&word=apple` | Authorized Cambridge lookup |
| `/v1/dictionaries` | Cambridge dictionary codes for this key |

Lookup returns one view model. `status` is `ok`, `not-found`, or `error`. A dropped network, failed authorization, exhausted quota, missing configuration, or unknown response shape is not reported as "this word could not be found". A Cambridge HTTP 404 can also mean a bad dictionary code or path. Lookup returns `not-found` only when the body confirms the official `NoResults` code. [Cambridge error notes](https://dev.eim-ciip-cambridge.org/api/faq)

The service accepts only a loopback Host, rejects ordinary web origins, and does not offer page CORS. The token is not an official dictionary key, but it should still stay private. One process handles at most four requests at once. Upstream calls have a timeout and a 1 MB response cap. The service does not log query words and does not persistently cache official entries. Responses include `Cache-Control: no-store`.

Automated tests use original synthetic responses. They do not need and do not use real official credentials. Without real API access, those tests check parsing and the call contract only. They do not show that a licensed dictionary has been connected.
