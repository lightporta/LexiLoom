# LexiLoom · 语织

[English](README.en.md)

**让单词沿着阅读展开。** LexiLoom 取自 lexicon（词汇）与 loom（织机）；中文名“语织”也为后续中文、句子和其他语言留下空间。

一个独立的 Chrome Manifest V3 扩展项目。当前版本 **0.2.1**，支持 Windows、Linux、macOS 的 Chrome。界面跟随浏览器语言：中文界面保持中文优先的释义、译文和用法；英文界面只显示英文释义、拼读和例句。不做整句翻译。

![实际加载扩展的词卡截图](docs/browser-single.png)

## 先体验：安装到 Chrome

要求 **Chrome 140 或更新版本**。插件本体无需 Node、npm install 或构建。

1. 在 Chrome 地址栏输入 `chrome://extensions`，打开右上角“开发者模式”。
2. 点击“加载已解压的扩展程序”。
3. 选择本项目的 **`extension` 文件夹**，其中直接包含 `manifest.json`。不要选择项目根目录。
4. 刷新已打开的普通网页，再双击一个英文单词。可把插件固定在工具栏。
5. 点击插件图标 → **打开交互体验页**，体验自编双语词卡；“词典与连接设置”可以切换数据源。

也可解压 `dist/LexiLoom-0.2.1-chrome.zip`，加载解压得到的 `LexiLoom` 文件夹。三个系统使用**同一个通用包**；ZIP 本身不能直接通过“加载已解压的扩展程序”安装。平台启动脚本见 [Windows / Linux / macOS 说明](docs/CROSS_PLATFORM.md)。

新安装默认“中文优先”，无需密钥或本地服务即可查词。已有 0.1.0 设置会保留，可在设置中改为“中文优先”，或恢复默认后保存。

## 怎么使用

| 操作 | 结果 |
| --- | --- |
| 双击单词 | 使用浏览器原生高亮选区，显示紧凑释义卡 |
| 拖选一个或多个词 → 点击“查 N 词” | 分词、去重，每个词生成一张相连的卡片 |
| 点击词头或卡片摘要区域 | 以 280ms 线性过渡展开宽度和内容；再次点击收起 |
| Windows / Linux：Ctrl + 双击；macOS：⌘ + 双击 | 追加其他单词到已有卡片，最多 8 个 |
| 每张卡右上角 × | 只移除此词 |
| 顶部 ×、Esc、点击网页空白处 | 退出查词，保留阅读位置 |
| 展开后的发音按钮 | 优先播放接口提供的词典音频；系统语音明确标为“系统朗读” |

多张卡可以同时展开，互不替换。内容超过视口时，在卡片区域内滚动；顶部退出按钮保留可见。尊重系统减少动态效果设置。

浏览器原生选区通常只能保留一个连续区域，因此不连续单词通过快捷键**追加到词卡**，不会假装同时原生高亮多个选区。双击本身就会选中单词；拖选后可直接点击查词入口，避免再次双击改变已选区域。

查无词条时显示 **“无法找到该单词”**。断网、超时、额度、配置或授权错误分别提示；演示词库未收录会提示切换在线词典，不冒充真实无词条。

## 词典数据从哪里来

浏览器语言为英文时，不走下面的中文优先路径，也不请求中文维基接口。英文词卡只显示英文释义、拼读和例句。英文界面可以另行选择演示、Oxford 或 Cambridge，这项选择单独保存，切回中文界面后仍使用原来的词典来源。

| 模式 | 可以直接使用吗 | 内容与边界 |
| --- | --- | --- |
| 中文优先（默认） | 是，需要联网 | WiktApi 中文词典优先；缺词或不可用时回退英英，并在词卡中注明原因；只在两个词源都确认未收录时报告无词条 |
| 中文维基词典 · WiktApi | 是，需要联网 | 真实中文释义、已有例句及出处、音标和音频；部分为繁体，文字和音频分别保留来源许可 |
| Free Dictionary API | 是，需要联网 | 英文释义、音标、接口中已有的例句和音频；**没有自动中文翻译** |
| 本地双语演示 | 是，无需联网 | 12 个原创中英示例，仅用于体验，不是牛津或剑桥词典数据 |
| Oxford Dictionaries API | 需要官方授权、本地服务 | 已实现 Words 查询、释义、音标、例句、用法标签适配；英语释义为主，不能默认承诺英汉数据 |
| Cambridge Dictionary API | 需要官方审批、本地服务和授权词典代码 | 已实现 HTML 词条的安全文本提取与中英字段适配；中文是否可用取决于账号授权数据集 |

**牛津、剑桥还没有使用真实密钥联调。** 适配器和桥接测试使用合成样本，不能据此声称官方授权数据已接通。剑桥不同授权词典的实际 HTML 结构可能需要拿到账号后进一步适配；未知格式会明确报错。

中文查询在扩展后台直接请求 `api.wiktapi.dev`，不打开或操控隐藏标签页。WiktApi 从中文维基词典的开放数据提取结构化词条，属于第三方服务；不是牛津、剑桥或 Wikimedia 官方 API。保留原文而不自动简繁转换；词性、例句和发音只展示词源实际提供的内容。第三方站点覆盖范围与可用性可能变化。[官方快速入门](https://wiktapi.dev/quickstart)、[数据来源](https://wiktapi.dev/concepts/data-pipeline)。

本地演示词：`serendipity`、`luminous`、`ephemeral`、`curiosity`、`language`、`wander`、`loom`、`bloom`、`resilient`、`connect`、`apple`、`hello`。体验页的“查看无结果状态”是明确的状态演示。

官方密钥保存在本机 `bridge/.env`，不填进网页脚本、不发进聊天、不打进插件 ZIP。插件仅保存本地服务连接口令，且限制为受信任的扩展页面和后台可读取。完整步骤见 **[官方词典接入说明](bridge/README.md)**。

Oxford Sandbox 当前有调用额度且仅支持 a 开头词，测试可用 `apple`；这类试用范围限制不会显示成“单词不存在”。正式分发前需按相应词典许可确认使用范围。默认不持久缓存或离线保存官方词条。[Oxford FAQ](https://developer.oxforddictionaries.com/faq)、[Cambridge 开发条款](https://dev.eim-ciip-cambridge.org/api/terms-and-conditions)。

## 同类插件调研

已先核实官方商店 / 产品页：**[Google Dictionary](https://chromewebstore.google.com/detail/google-dictionary-by-goog/mgijmajocgfcbeboacabfgobmjgjcoja)** 已有双击释义气泡；**[沙拉查词](https://chromewebstore.google.com/detail/cdonnmffkdaoajfknoeeecmchibpmkmg)** 已有划词和聚合词典；**[Mate Translate](https://matetranslate.com/en/chrome)** 与 **[TransOver](https://chromewebstore.google.com/detail/transover/aggiiclaiamajehmlfpkjmlbadmkledi)** 也覆盖相近的选择翻译交互。

本项目重点实现你的“**多词相连，每卡独立渐进展开**”需求。仅核实了上述官方介绍，没有安装每一个竞品逐项测试，不宣称该交互市场唯一。更多比较和接口资料见 [调研记录](docs/RESEARCH.md)。

## 开发与验证

开发工具和本地词典服务要求 **Node.js 22+**；扩展、服务和打包没有第三方运行依赖，浏览器 QA 使用锁定的开发依赖。

```sh
npm test          # 51 项：词源与回退、认证、并发、英文词卡投影、跨平台 ZIP 和启动脚本等
npm run check    # JS 语法、Manifest、资源引用、版本一致性、CSP
npm run preview  # 仅本机 http://127.0.0.1:4173，使用本地双语演示
npm run package  # 生成 dist/ 下可加载目录和 ZIP
```

浏览器验证安装锁定的开发依赖；Linux 的安装命令加上 `--with-deps`：

```sh
npm ci
npx --no-install playwright-core install chromium
npm run test:browser
```

默认浏览器流程使用确定性的合成词典样本；额外联网验收可在 macOS/Linux 执行 `LEXILOOM_LIVE_TESTS=1 npm run test:browser`，PowerShell 使用 `$env:LEXILOOM_LIVE_TESTS='1'; npm run test:browser`。

2026-10-31 在 macOS 的隔离 **Chrome for Testing 156.0.8078.4** 中实际加载未打包扩展，**23 项浏览器检查通过**，其中含中文词源、回退、署名与真实在线查询。WiktApi 查询 `apple` 返回“蘋果（水果）”，Free Dictionary 也成功。Windows / Linux / macOS 三平台 CI 已配置，会在你推送后实际执行；**当前没有 Windows/Linux 主机的真实验收结果**。没有修改日常 Chrome 的个人资料或向商店发布。

已验证和未验证项目分开记录在 [验收记录](docs/VALIDATION.md)，浏览器原始结果见 [JSON](docs/browser-validation.json)。

## 文件结构与后续扩展

```text
extension/           可直接加载的 Chrome 扩展
  content.js         选区、触发、封闭 Shadow DOM 词卡及交互
  background/        受控消息与网络请求，不向网页暴露服务口令
  shared/            选词规则、统一词条模型、词典适配、界面语言投影与演示数据
  _locales/          中文与英文界面文案
  ui/                浮层样式、工具栏弹窗、设置与体验页
bridge/              可选的本机官方词典代理
tests/               自动化测试和合成词典样本
tools/               检查、预览、打包、图标生成及浏览器验证脚本
scripts/             Windows .cmd、Linux .sh、macOS .command 启动器
.github/workflows/   三平台 Node / Chromium 检查及通用包字节一致性校验
docs/                调研、验收和真实浏览器截图
dist/                生成的插件安装包，不包含官方密钥
```

后续可沿统一词条模型新增语言适配器，再扩展分词、句子翻译与生词本；首版没有提前加入这些功能。当前只对主文档工作，不覆盖 iframe、输入框、编辑器、Chrome 内部页、商店页或内置 PDF 阅读器。网页框架的局部布局、网页自身 CSP / 音频策略也可能影响播放，系统朗读可作替代。

隐私说明见 [PRIVACY.md](PRIVACY.md)。代码许可见下方；词典正文不在该许可之内，见 [THIRD_PARTY.md](THIRD_PARTY.md)。

## 许可证

本仓库原创代码、样式、原创演示词条和文档采用 [MIT 许可证](LICENSE)，版权人 lightporta，2026。维基词典正文、音频，以及 Oxford / Cambridge 的授权内容仍按其各自许可使用，MIT 不重新授权这些材料。

## 本地 Git 与手动推送

本项目是独立 Git 仓库，分支为 `main`，提交身份沿用本机已有的 `lightporta` 配置。此次只创建本地提交，不创建远程仓库、不执行推送。`.env`、依赖、打包产物和临时结果均被忽略，锁定依赖文件和验证记录保留在源码中。

你创建空仓库后，在本项目目录自行运行（替换示例地址）：

```sh
git remote add origin https://github.com/YOUR_ACCOUNT/LexiLoom.git
git push -u origin main
```

推送后查看 GitHub Actions 的 Windows、Linux、macOS 实际结果。版本变更见 [CHANGELOG.md](CHANGELOG.md)。
