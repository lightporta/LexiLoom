# 查词与词卡之间的契约

[English](ARCHITECTURE.en.md)

界面语言、所选词的语言和词典地区分别处理。例如，英文界面仍然可以查“學習”，而中文界面查 `apple` 时也不会把词头改成中文。自动模式支持英文及大陆、香港、台湾的中文字词；显式模式新增日、韩、法、德、西语到简体中文的词卡。

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

新增语言需要注册 profile 和 adapter，提供读音 locale、词条来源与展示策略。日、韩、法、德、西语 profile 标记为 `explicitOnly`，通过 `targetLanguage: auto | ja | ko | fr | de | es` 选择，避免自动模式把日语汉字当中文、把所有拉丁字母当英语。日、韩按各自语言分词；法、德、西语保留重音及大小写。原有契约测试中的假想语种仍只用于架构验证。

`normalizeWord(value, targetLanguage)` 和 `parseSelection(text, uiLanguage, targetLanguage)` 贯穿选区与 worker。内容脚本先捕获原选区，再刷新设置并解析；worker 用同一份设置快照验证词头和选择 adapter。换语言会重查已有卡片、清掉旧朗读与例句，版本 guard 阻止旧回复覆盖新结果。

`multilingual.js` 只查中文维基词典版本，使用官方 `/v1/zh/word/{word}?lang={language}`。严格核对返回词头、版本及存在的语言字段；紧凑响应缺少词种字段时，依赖官方 `lang` 过滤。中文释义与中文例句翻译经 OpenCC 转简体，原词和原语例句不转换。`preferredMeaningLanguage: 'zh'` 保证英文界面也先显示简中释义，朗读使用词头语言的 locale。

确认缺词的 404 与有效结构但无中文义项分别归为 `not-found` 和 `translation-unavailable`；通用 404、格式错误和网络错误不冒充缺词。无中文义项仍可通过词典导向看原站。缺例句、缺读音如实显示，不从引用字段反推例句，不用中文句子冒充原语句子。

## 导向库（链接，不抓取）

`extension/shared/guidance.js` 是网址导向库：它只生成词典站的外链，不请求、不解析也不转存目标页面，因此不算词源 adapter。worker、内容脚本和选项页加载同一份模块；模块本身不发起任何网络请求。

### 契约

```js
globalThis.LexiLoomGuidance.resolve(entry, { uiLanguage, uiRegion, settings })
```

返回最多 3 个冻结的链接对象，按 `priority` 升序挑选，重复 URL 去重：

`resolveAll(entry, options)` 返回完整匹配目录，供 `navigation.html` 使用。导航页显式选择 `en / zh / ja / ko / fr / de / es`，不根据拉丁字母或纯汉字猜测新语言，也不改变中英文词卡的识别与正文 adapter。

| 字段 | 含义 |
| --- | --- |
| `id` | 内置站点 id（如 `zh-wiktionary`、`en-oxford-learner`）或 `custom-<序号>` |
| `name` / `nameTraditional` | 站点名称；繁体界面用 `nameTraditional`，没有时回退 `name` |
| `url` | 填入并编码 `{word}` 后的 HTTPS 地址 |
| `host` | 该地址的 hostname |
| `custom` | 是否来自用户模板 |
| `mode` | 恒为 `"link-only"` |
| `license` | 站点许可；没有标注时为空字符串（如 `CC BY-SA 4.0`、`CC BY-ND 3.0 TW`） |

匹配规则：`entry.language` 先筛语言；未知语言不回退英文站。`entry.region` 过滤带 `regions` 的站点，词条没有地区时用 `options.uiRegion`；`options.uiLanguage` 按 `en` / `zh` 过滤带 `uiLanguages` 的站点。自定义模板的可选 `language` 限定词头语言，省略或 `*` 为通用；`priority` 为 0，排在内置站点前面。

### 自定义模板

格式为 `名称 | https://…/{word}`，或 `fr | 名称 | https://…/{word}` 指定语言，一行一条，`#` 开头的行忽略，最多 6 条。名称最多 60 Unicode 字符，模板最多 300 字符。必须使用 HTTPS、包含 `{word}`，不能带凭据、控制字符、反斜线或额外花括号；词头不能改变 URL 的 authority。词头最多 64 Unicode 字符，不通过截断制造另一个查询词。

`validateCustom` 在写入前严格校验整组模板，任一无效则整次设置保存失败，不写入部分结果。`sanitize` 仅用于容错读取旧存储与生成公开状态，不把静默丢条当作保存成功。

### 设置与刷新

`guidanceDisabled`（关闭的内置站点 id 数组）和 `guidanceCustom`（`{ name, template, language? }` 数组）存在 `chrome.storage.local` 的 `settings` 里。设置页只发送用户改过的字段。worker 的 `GET_SETTINGS` 与广播共用公开结构，包含 `englishProvider` 和导向语言范围，不含服务口令。

存储限制为受信上下文，worker 保存后向内容脚本广播 `SETTINGS_CHANGED`；内容脚本据此刷新外链，或在 `provider`、`englishProvider`、`chineseRegion`、`targetLanguage` 改变时重新查词。词卡上的导航按钮通过 `OPEN_NAVIGATION` 让 worker 打开扩展页，词头、语言和地区放在 URL 片段里，不需把导航页设为网页可访问资源。
