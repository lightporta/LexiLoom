# 查词与词卡之间的契约

[English](ARCHITECTURE.en.md)

界面语言、所选词的语言和词典地区分别处理。例如，英文界面仍然可以查“學習”，而中文界面查 `apple` 时也不会把词头改成中文。当前正式支持英文，以及大陆、香港、台湾的中文字词。

## 查询路径

```text
页面选区 → LanguageProfile 分词、识别词种
         → DictionaryEngine 按词种和设置选择 adapter
         → DictionaryEntry 校验、限界
         → CardView 选择展示策略
         → LexiLoomGuidance 可选导向外链（link-only）→ 词卡
```

- `extension/shared/languages.js` 注册语言和地区的识别规则、分词策略、读音体系、词源选择与展示策略。`core.js` 和 `locale.js` 只提供兼容入口。
- `dictionary.js` 注册具体 adapter，并统一管理请求。英文来源选择与中文地区不互相覆盖。
- `entry.js` 把词源响应约束为同一种展示数据。不会把任意 API 响应字段转发给页面。
- `present.js` 生成 `CardView`。词卡读取其摘要、例句上限、显示开关和读音地区，不自行决定走哪个语言词典。

## DictionaryEntry

| 字段 | 含义 |
| --- | --- |
| `word` | 经过校验的查询词 |
| `displayWord` | 在词卡中显示的字形 |
| `lemma` | 词源提供的规范词头；没有时回退为查询词，不表示已完成词形还原 |
| `language` / `profileId` / `region` | 词头语言、语言配置和词典地区 |
| `status` | `ok`、`not-found` 或 `error` |
| `pronunciations` | 读音、可选音频、明确的朗读 locale，以及音频归属 |
| `meanings` | 释义、原始词性、用法、例句；不同语料的中英解释可以独立成节 |
| `source` | 主来源、组合来源、署名和各自许可 |
| `notice` / `error` | 缺项、回退或错误说明 |

`queryWord` / `queryWords` 保留简繁检索使用的词头。像“干／幹”这样的查询会说明范围，不代表穷尽了“干／乾／幹”的所有义项。

词源、释义和例句都是文本；链接只接受不含账号密码的 HTTPS URL。台湾教育部辞典的正文保留原文，不能为了套用地区字形而改写。例句出处、文字许可和音频许可分别保留。

## 请求与设置

所有 adapter 共用最多 4 个外部请求槽。组合词条产生的子请求也占用这些槽，下载完受限的 JSON 响应体后才释放。请求有超时和大小上限，不持久缓存官方词典正文。

设置保存采用串行的局部更新：只写请求中明确提供的字段。设置页和弹窗同时保存时，不会用旧快照覆盖另一个窗口的新选择，也不会因修改地区而自动取消暂停。

## 扩展语言

新增语言需要注册 profile 和 adapter，提供读音 locale、词条来源与展示策略。词卡的展开、追加、移除和退出逻辑可以复用。契约测试用一个独立的测试语言验证这条路径；它只用于验证架构，不是已经上线的额外语种。

同属拉丁字母的语言不能仅靠字符形状准确区分。将来增加这类语言时，还需要明确的学习语言选择或可靠的识别策略，不能把当前英文规则直接宣传成多语识别。

## 导向库（链接，不抓取）

`extension/shared/guidance.js` 是网址导向库：它只生成词典站的外链，不请求、不解析也不转存目标页面，因此不算词源 adapter。worker、内容脚本和选项页加载同一份模块；模块本身不发起任何网络请求。

### 契约

```js
globalThis.LexiLoomGuidance.resolve(entry, { uiLanguage, uiRegion, settings })
```

返回最多 3 个冻结的链接对象，按 `priority` 升序挑选，重复 URL 去重：

| 字段 | 含义 |
| --- | --- |
| `id` | 内置站点 id（如 `zh-wiktionary`、`en-oxford-learner`）或 `custom-<序号>` |
| `name` / `nameTraditional` | 站点名称；繁体界面用 `nameTraditional`，没有时回退 `name` |
| `url` | 填入并编码 `{word}` 后的 HTTPS 地址 |
| `host` | 该地址的 hostname |
| `custom` | 是否来自用户模板 |
| `mode` | 恒为 `"link-only"` |
| `license` | 站点许可；没有标注时为空字符串（如 `CC BY-SA 4.0`、`CC BY-ND 3.0 TW`） |

匹配规则：`entry.language`（`zh` / `en`）先筛语言；`entry.region` 过滤带 `regions` 的站点，词条没有地区时用 `options.uiRegion`；`options.uiLanguage` 按 `en` / `zh` 过滤带 `uiLanguages` 的站点。自定义模板不限语言，`priority` 为 0，排在内置站点前面。

### 自定义模板

格式为 `名称 | https://…/{word}`，一行一条，`#` 开头的行忽略，最多 6 条。`sanitize` 在保存前重新校验：必须以 `https://` 开头、必须包含 `{word}`、占位符之外不能出现其他花括号，名称最长 60 字符，模板最长 300 字符；不合格的条目直接丢弃，不写入存储。

### 设置与刷新

`guidanceDisabled`（关闭的内置站点 id 数组）和 `guidanceCustom`（`{ name, template }` 数组）存在 `chrome.storage.local` 的 `settings` 里。worker 的 `sanitize` 清理后再写，`GET_SETTINGS` 只把 `publicSettings` 的结果发给内容脚本。

内容脚本监听 `chrome.storage.onChanged`（`settings` 键）：设置变化时重新解析并渲染已打开词卡的导向外链；`provider`、`englishProvider` 或 `chineseRegion` 变化时重新查词。这样已打开的卡片不用等下一次选词，换源后也不会继续显示旧词源的正文。
