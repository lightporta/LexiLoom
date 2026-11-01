# 验收记录

## 0.4.0 · 2026-11-01

在 0.3.1 基线上按仓库外 `LexiLoom-roadmap.md` 的 **G1（网址导向库，层 1 link-only）** 开发，并修复路线图缺陷“设置变更不刷新已打开词卡”（含其根因：内容脚本收不到受信存储的变更事件）。版本 0.3.1 → 0.4.0。

### 本地检查

环境为 macOS（Node.js 24.16.0，Chrome for Testing 156）。本轮所有检查在最终工作树重跑：

| 命令或检查 | 结果 | 覆盖范围 |
| --- | --- | --- |
| `npm test` | 100 项通过 | 原有 87 项 + 导向库 11 项 + worker 导向保存与广播 2 项 |
| `npm run check` | 通过（34 个扩展文件） | 语法、Manifest V3、资源引用、三语言目录键/占位符一致、版本、CSP、权限 |
| `node tools/browser-qa.js` | 34 项通过 | 真实 Chromium：原有用例 + 导向外链结构与编码、选项页 15 个开关、关闭全部导向后已开卡片不关闭且外链消失、恢复后外链回来 |
| `node tools/browser-ui-qa.js` | 10 项通过 | 英文界面英文词卡出现 Wiktionary/Oxford Learner's；繁体界面中文词卡出现萌典/中文維基詞典/漢典；另一窗口暂停查词会通过设置广播关闭已开卡片 |
| `node tools/browser-locale-qa.js` | 4 组通过 | zh-CN、zh-HK、zh-TW、en-US 回归 |
| `npm run package` | 两种 ZIP 通过 | `dist/LexiLoom-0.4.0-chrome.zip`（34 文件）与 `dist/LexiLoom-0.4.0-store.zip`；商店布局 manifest 在根目录 |

### 本轮验证要点

- 导向库按词头语言 + 词典地区 + 界面语言选择，最多 3 条外链；简体中文→汉典 hans、台湾→萌典、香港→粤典、繁体/香港→汉典 hant；英文界面只出英文站，中文界面查英文词才出有道/必应/剑桥英汉。外链 URL 中 `{word}` 一律 percent-encode。
- 设置页可逐个关闭内置站（15 条）并添加自定义模板；`http://`、缺少 `{word}`、带账号密码、`javascript:` 模板均被拒绝；保存前 worker 二次清洗后再写入存储。
- 实时刷新：worker 保存后向标签页广播 `SETTINGS_CHANGED`，内容脚本复用同一处理函数——仅导向变化只重建外链块，`provider`/`englishProvider`/`chineseRegion` 变化重新查词，`enabled:false` 关闭面板。真实 Chromium 已验证面板不关闭/关闭两条路径。原因：`chrome.storage.local.setAccessLevel('TRUSTED_CONTEXTS')` 让内容脚本既不能读存储、也收不到 `storage.onChanged`，旧的 storage 监听实际是死代码；广播不新增 `tabs` 权限。
- 词卡正文来源不变；导向库只生成链接，不抓取、不转存第三方页面，`manifest` 仍只有 `storage` 与原有 4 个查词 host。
- 未收录词条（`not-found`）的卡片也显示导向外链，作为“打开原站”兜底；`error` 卡片不显示。

### 证据

- [browser-validation.json](browser-validation.json)（34 项检查名）
- `test-results/browser-ui/report.json`（10 项）、`test-results/browser-locales/report.json`（4 组）；这些目录不纳入版本控制，CI 会上传。
- `dist/LexiLoom-0.4.0-chrome.zip`、`dist/LexiLoom-0.4.0-store.zip`（`dist/` 不纳入版本控制）。

### 保留的限制

- 导向库 URL 只做结构校验和少量 `curl` 抽查；抽查中部分站点对脚本请求返回 403/520（反爬），**未逐一在真实浏览器打开所有内置链接**。站点改版时应只改 `extension/shared/guidance.js` 一处。
- 没有真实 Oxford/Cambridge 授权凭据联调；fixture 通过不代表官方 API 已连接。
- 远程三平台 CI 已随分支推送触发，最终结果以 GitHub Actions 为准；本地 macOS 的 Node 检查、真实 Chromium 检查与本机构建均通过。
- 远程 `origin/main` 已通过 PR #1 合并 macOS CI 加固（`c00f2a2`，run 41309664616 成功）；本轮功能分支基于 `a03a66c`，已推送 `origin/feat/guidance-directory`，是否合并由用户决定。

## 0.3.1 验收记录

日期：2026-11-01。基于用户提交 `c5301dd`，按仓库外的 `LexiLoom-roadmap.md` 做阶段 A 的查词底座整理和缺陷修正。该意见文件没有复制进仓库。

## 本地检查

环境为 macOS、Chrome for Testing 156.0.8078.4。阶段 A 原验收使用 Node.js 24.16.0；本次 CI 修复在与 CI 相同的 Node.js 22.23.4 下重跑了下表全部检查，主浏览器报告记录该版本。

| 命令或检查 | 结果 | 覆盖范围 |
| --- | --- | --- |
| `npm test` | 85 项通过 | 词源、字形歧义、地区读音、设置并发、语言契约、响应体限流、打包和本机服务 |
| `npm run check` | 通过 | JavaScript 语法、Manifest、资源引用、语言目录、版本和权限 |
| `npm run test:browser` | 27 项通过 | 真实 Chromium 中加载扩展，检查多卡片、动画时轴、500ms 主线程阻塞、减少动态效果、关闭、迟到响应、窄视口和设置 |
| `npm run test:browser:locales` | 4 组通过 | 大陆、香港、台湾、英文界面的选词、读音、释义和请求路由 |
| `npm run test:browser:ui` | 7 项通过 | 键盘展开、英文界面中的中文署名、朗读 locale、组合词源许可、歧义提示、并行设置和繁体词性标签 |
| `npm run package` | 两种 ZIP 通过校验 | 加载包保留外层目录；商店布局包的 manifest 位于根目录；CRC、文件列表和字节稳定性 |

主浏览器结果保存在 [browser-validation.json](browser-validation.json)。地区与 UI 回归的报告、截图生成在 `test-results/browser-locales/` 和 `test-results/browser-ui/`，不纳入版本控制；CI 会上传对应报告。

浏览器确实运行，但 `chrome.i18n.getUILanguage()` 的输入在扩展临时副本中受控，因为 `--lang` 在部分系统上不能切换该 API 的值。以上语言检查不能称作实际更换了操作系统界面语言。词条响应使用合成样本，产品文件没有注入这些测试替身。

## 真实在线词源

另通过本次统一查词引擎发起实际请求，结果见 [online-validation.json](online-validation.json)：

- 大陆“学习”：汉语拼音、中英释义、2 条例句。
- 香港“你好”：香港粤拼、普通话补充、中英释义、1 条例句。
- 台湾“學習”：教育部原文注音、中英释义、2 条例句。
- 英文界面查询“學習”：保留台湾注音和中文内容，同时提供英文解释。
- 简体单字“干”：保留原字与“幹”的查询，提示字形歧义和查询范围；不是所有字义的完整集合。
- 英文 `apple`：Free Dictionary 查询成功。该来源未给此词例句，未另行编造。

网络样本与合成测试分开记录。这里只抽查了少量词，不能据此保证整个词库都具有相同字段。

## 远程 CI

[run 41215903948](https://github.com/lightporta/LexiLoom/actions/runs/41215903948) 对应用户提交 `c5301dd`，Windows、Linux、macOS 的 Node 测试、静态检查、打包、Chromium 词卡及界面语言检查全部成功，原有通用 ZIP 字节比较也成功。

[run 41306403787](https://github.com/lightporta/LexiLoom/actions/runs/41306403787) 对应 `f9bd6ae`。Linux、Windows 的所有检查通过；macOS 的 85 项 Node 测试、静态检查和打包通过，主浏览器测试在“380ms 内采到动画中间帧”断言失败，后续地区、UI 检查和三平台 ZIP 比较未执行。

本次针对该失败修正测试：在同一个浏览器任务内捕获真实 CSS 过渡，暂停后分别检查 25%、50%、75% 的宽度，再恢复播放并等待完成，仍要求 280ms、linear 和最终 424px。显式指定无减少动态效果的测试前提，并另测减少动态效果时直接展开。真实浏览器中人为阻塞主线程 500ms，可让旧采样断言失败而最终词卡正常展开；新时轴检查在同一阻塞场景通过。报告保留动画宽度、时长和媒体偏好，便于排查后续失败。

**以上修复已完成本机验证，修复提交的远程三平台 CI 需要在用户推送后另行确认。** 不能把旧提交的通过记录当作本次修复的远程验收。

后续观察：`2ecc536` 在 Ubuntu / Windows 通过后，macOS 仍在「Run actual Chromium extension checks」失败。本机 macOS 连跑浏览器 QA 可通过。继续加固：强制关闭 runner 继承的 Reduce Motion、按词卡状态等待查词完成，并在断言失败时输出动画探测 JSON。仍须以推送后的三平台 Actions 结果为准。

## 保留的限制

- Oxford / Cambridge 没有真实授权凭据联调证据；fixture 通过不代表官方 API 已连接。
- 没有逐一听审各系统的语音与录音，也没有穷尽网页 CSP、编辑器、iframe 或 PDF 场景。
- 中文词库覆盖与例句质量受词源影响；缺项、补充来源和字形歧义在词卡中说明。
- 当前仍是查词工具，没有生词本、复习或导向词库。契约测试里的假想语言不代表新增了对外支持的语种。

设置更新在下一次选词时生效；本版没有承诺已经打开的卡片即时换源或关闭。
