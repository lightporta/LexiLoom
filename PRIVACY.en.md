# LexiLoom 0.2.1 privacy notice

[中文](PRIVACY.md)

The extension reads text you choose so it can parse an English word and place a card. It does not scan or upload the whole page, record browsing history or lookup history, or create an account.

- **English interface:** When the browser language is English, the default lookup sends only the chosen word to `https://api.dictionaryapi.dev` (Free Dictionary). It does not request the Chinese Wiktionary service. The card shows the English definition, pronunciation, and example sentences. If you pick the demo, Oxford, or Cambridge on the English interface, that source is queried instead, and Chinese fields are still not shown. That choice is stored separately and does not change the dictionary selected for the Chinese interface.
- **Chinese-first / Chinese Wiktionary:** Only the word you look up is sent to `https://api.wiktapi.dev`, which returns a structured Chinese Wiktionary entry. If that source misses the word or fails, Chinese-first sends the same word to Free Dictionary for an English definition and shows why it fell back. It does not open a hidden tab, submit search history, or run site scripts.
- **Free Dictionary:** Only the looked-up word is sent to `https://api.dictionaryapi.dev`. Pronunciation buttons in online modes may request the HTTPS audio URL the API already provides, for example on Wikimedia Commons. Dictionary and audio hosts handle the request and network metadata under their own policies.
- **Local demo:** Entry lookup makes no network request. System speech is provided by the browser or operating system, and how the voice is processed depends on that voice.
- **Oxford / Cambridge:** The selected word is sent to the fixed local address `http://127.0.0.1:47821`. The local service then queries the official API you chose. Official keys live in your own `bridge/.env` and are not inside the extension package. The local service does not log query words or API keys and does not persistently cache official entries.
- **Local storage:** The extension stores the enabled flag, the Chinese-interface source, the English-interface source, and the local service token. It does not use Chrome sync. Storage access is limited to the background and trusted extension pages. Extension storage is not disk encryption. Uninstalling the extension removes its local settings. `bridge/.env` is a separate file you keep or delete yourself.
- **Source links:** A dictionary site opens only when you click, with `noopener noreferrer`.

Content-script access to ordinary HTTP and HTTPS pages is required so a double-click can be answered. Host permission for `api.wiktapi.dev`, `api.dictionaryapi.dev`, and the local address is required for lookups you start. At most four network lookups run at once. Entries are not cached persistently. Chrome host patterns cannot be limited by port, so the manifest permission covers `127.0.0.1` while the code pins the service to port 47821. The extension does not request clipboard, history, cookie, microphone, or camera permissions. Inputs, password fields, and editable regions do not trigger lookup.

Cards render text only. Cambridge entry HTML is reduced to text in the local service before it reaches the page, and it is not executed as page HTML. There is no analytics, ad tracking, or telemetry.
