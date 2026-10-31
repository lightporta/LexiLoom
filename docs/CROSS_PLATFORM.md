# Windows、Linux 与 macOS

[English](CROSS_PLATFORM.en.md)

LexiLoom 的 Chrome 扩展使用同一套 Manifest V3 源码。三个系统加载相同的 `extension` 文件夹，或解压同一个 `dist/LexiLoom-<版本>-chrome.zip` 后加载其中的插件文件夹。版本从 `package.json` 读取，无需维护三份插件。

## 安装 Chrome 扩展

1. 使用 Chrome 140 或更高版本，打开 `chrome://extensions/`。
2. 开启“开发者模式”，点击“加载已解压的扩展程序”。
3. 选择包含 `manifest.json` 的插件文件夹。直接使用源码时选择项目下的 `extension`。
4. 刷新已经打开的普通网页，然后双击英文单词。拖选多个词后点击查词按钮，可同时查看词卡。

Chrome 内部页面、Chrome 网上应用店及浏览器内置 PDF 阅读器不支持本插件的网页选词浮层。当前版本仅向 HTTP/HTTPS 网页注入浮层，不支持 `file://` 页面；本机体验可使用下方 HTTP 预览服务。插件加载与普通词典使用无需安装 Node.js。

## 本地服务和打包

本地词典服务、网页预览和打包需要 Node.js 22 或更高版本。它们仅使用 Node 内置模块，无需先运行 `npm install`。启动脚本不会自动安装依赖，也不会输出 `.env` 内容。

在项目目录执行以下命令。脚本会根据自身位置寻找项目，因此从其他当前目录启动也可以；移动项目、目录名包含空格均可。

| 用途 | Windows PowerShell / 命令提示符 | Linux | macOS 终端 |
| --- | --- | --- | --- |
| 启动词典服务 | `.\scripts\start-bridge.cmd` | `sh scripts/start-bridge.sh` | `sh scripts/start-bridge.command` |
| 启动网页预览 | `.\scripts\start-preview.cmd` | `sh scripts/start-preview.sh` | `sh scripts/start-preview.command` |
| 生成通用 ZIP | `.\scripts\package.cmd` | `sh scripts/package.sh` | `sh scripts/package.command` |

macOS 也可在 Finder 中双击相应 `.command` 文件；终端中使用 `sh` 启动不依赖可执行权限。所有平台也可直接运行 `node scripts/start.js bridge`、`node scripts/start.js preview`、`node scripts/start.js package`。关闭服务时按 `Ctrl+C`。

只有词典服务需要读取 `bridge/.env`。先将 `bridge/.env.example` 复制为 `bridge/.env`，填写连接口令及自己获授权的词典 API 凭据，再启动服务。Windows 可用 `Copy-Item bridge/.env.example bridge/.env`，macOS/Linux 可用 `cp bridge/.env.example bridge/.env`；已有配置时不要覆盖。服务按绝对路径加载该文件，不要求当前终端位于项目目录。不要把 `.env` 加入版本控制或分享给他人。词典授权和配置步骤见 [bridge/README.md](../bridge/README.md)。

打包只收集扩展文件，使用 Node 原生实现的 ZIP32、CRC32 和固定元数据，不依赖 `ditto`、系统 `zip` 或 PowerShell 压缩命令。归档路径统一使用 `/`；包内不包含本地服务、`.env`、`node_modules`、`.DS_Store` 或 `__MACOSX`。相同源码字节应在三个系统生成字节一致的 ZIP。

## 开发验证与 CI

浏览器自动化属于开发工具，需要先在项目根目录运行 `npm ci` 安装锁定的 `playwright-core`。在 Windows/macOS 执行 `npx --no-install playwright-core install chromium`；Linux 执行 `npx --no-install playwright-core install --with-deps chromium`，后者可能需要系统包安装权限。随后运行：

```text
npm test
npm run check
npm run package
node tools/browser-qa.js
```

[CI 工作流](../.github/workflows/ci.yml) 已配置 Windows、Linux、macOS 三个平台的 Node 测试、静态检查、打包以及真实 Chromium 扩展自动化。每个平台上传独立的浏览器报告和截图，再由汇总任务比较三份通用 ZIP 的文件名与原始字节。首次上传到 GitHub 后，可在 Actions 中查看各平台的实际结果。

自动化使用 Playwright 下载的 Chromium，通过持久上下文加载扩展；它会实际操作浏览器中的词卡和设置页。官方文档说明该方式支持无界面扩展测试，Chrome/Edge 成品浏览器已移除部分命令行加载扩展参数，因此测试使用 Chromium。[扩展测试说明](https://playwright.dev/docs/chrome-extensions)、[浏览器安装说明](https://playwright.dev/docs/browsers)、[playwright-core CLI 定义](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/package.json)。

CI 默认使用确定性测试词条和响应，浏览器与扩展本身实际运行，不依赖第三方词典网站当时是否在线。需要单独验证 Free Dictionary API 联网情况时，可设置环境变量 `LEXILOOM_LIVE_TESTS=1` 再运行浏览器检查；这与模拟响应和本地演示检查分别记录。

**验证边界：** 当前已执行的本地浏览器验证来自 macOS。此工作流已编写，尚未在远程 GitHub Actions 上运行；Windows/Linux 的真实结果须以后续对应 runner 的报告为准。三平台配置不等同于三平台实测。词典授权 API 的成功访问还需要用户提供有效凭据，不能由本地演示词条或模拟响应证明。
