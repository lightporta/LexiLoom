# Windows, Linux, and macOS

[中文](CROSS_PLATFORM.md)

LexiLoom uses one Manifest V3 source tree. All three systems load the same `extension` folder, or unzip the same `dist/LexiLoom-<version>-chrome.zip` and load the extension folder inside it. The version is read from `package.json`. There is not a separate extension per system.

## Install the Chrome extension

1. Use Chrome 140 or newer and open `chrome://extensions/`.
2. Turn on Developer mode and click Load unpacked.
3. Choose the folder that contains `manifest.json`. From source, that is `extension` in this project.
4. Refresh ordinary pages that are already open, then double-click an English word. After dragging across several words, click Look up to see the cards together.

Chrome internal pages, the Chrome Web Store, and the browser's built-in PDF viewer do not receive the selection overlay. This version injects only HTTP and HTTPS pages, not `file://`. For a local try, use the HTTP preview below. Loading the extension and using a normal dictionary do not require Node.js.

## Local service and packaging

The local dictionary service, page preview, and packager need Node.js 22 or newer. They use only Node built-ins, so `npm install` is not required first. The launchers do not install dependencies and do not print `.env` contents.

Run the commands below from the project directory. Each script finds the project from its own location, so another working directory is fine, including a path that contains spaces.

| Purpose | Windows PowerShell / Command Prompt | Linux | macOS terminal |
| --- | --- | --- | --- |
| Start the dictionary service | `.\scripts\start-bridge.cmd` | `sh scripts/start-bridge.sh` | `sh scripts/start-bridge.command` |
| Start the page preview | `.\scripts\start-preview.cmd` | `sh scripts/start-preview.sh` | `sh scripts/start-preview.command` |
| Build the universal ZIP | `.\scripts\package.cmd` | `sh scripts/package.sh` | `sh scripts/package.command` |

On macOS you can also double-click the `.command` file in Finder. Starting with `sh` in a terminal does not depend on the executable bit. On every platform you can also run `node scripts/start.js bridge`, `node scripts/start.js preview`, or `node scripts/start.js package`. Stop a service with `Ctrl+C`.

Only the dictionary service reads `bridge/.env`. Copy `bridge/.env.example` to `bridge/.env`, fill in the connection token and the dictionary credentials your account is allowed to use, then start the service. On Windows: `Copy-Item bridge/.env.example bridge/.env`. On macOS or Linux: `cp bridge/.env.example bridge/.env`. Do not overwrite a file you have already configured. The service loads that file by absolute path, so the terminal does not have to be in the project directory. Do not commit `.env` or share it. Authorization and configuration steps are in [bridge/README.en.md](../bridge/README.en.md).

Packaging collects extension files only. It uses a Node implementation of ZIP32, CRC32, and fixed metadata. It does not call `ditto`, the system `zip`, or PowerShell compression. Archive paths use `/`. The package does not contain the local service, `.env`, `node_modules`, `.DS_Store`, or `__MACOSX`. The same source bytes should produce a byte-identical ZIP on all three systems.

## Development checks and CI

Browser automation is a development tool. From the project root, `npm ci` installs the locked `playwright-core`. On Windows or macOS run `npx --no-install playwright-core install chromium`. On Linux run `npx --no-install playwright-core install --with-deps chromium`, which may need permission to install system packages. Then run:

```text
npm test
npm run check
npm run package
node tools/browser-qa.js
node tools/browser-locale-qa.js
```

The [CI workflow](../.github/workflows/ci.yml) runs Node tests, the static check, packaging, and real Chromium extension automation on Windows, Linux, and macOS. Each platform uploads its browser report and screenshots. A later job compares the file names and raw bytes of the three universal ZIPs. After the first push to GitHub, read each platform's result in Actions.

Automation uses the Chromium build Playwright downloads and loads the extension in a persistent context. It actually drives the cards and the settings page. Playwright's documentation describes headless extension testing. Shipping Chrome and Edge have removed some command-line flags for loading extensions, so the tests use Chromium. [Extension testing](https://playwright.dev/docs/chrome-extensions), [browser install](https://playwright.dev/docs/browsers), [playwright-core CLI](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/package.json).

CI uses deterministic test entries and responses by default. The browser and the extension really run; the check does not depend on a third-party dictionary site being online. To check the Free Dictionary API separately, set `LEXILOOM_LIVE_TESTS=1` and run the browser check again. That result is recorded apart from the simulated responses and the local demo.

The Chinese-interface check does not use `--lang=zh-CN`. On macOS and Linux that flag does not change `chrome.i18n.getUILanguage()`. The test copies the extension and replaces that function in the content script, the settings page and the background, then runs the original Chinese card checks. `browser-locale-qa.js` does the same for Simplified Chinese, Hong Kong, Taiwan and English. On Windows, the launcher test compares a temporary directory by the operating system's final path, so an 8.3 short name and the long path of the same directory count as one directory.

**Limit of the evidence:** The local browser run that has already been executed was on macOS. This workflow is written and has not yet run on remote GitHub Actions. Windows and Linux results have to come from those runners later. Configuring three platforms is not the same as having measured three platforms. A successful call to a licensed dictionary API still needs valid credentials from you. Demo entries and simulated responses do not prove that.
