# 同类插件与官方词典 API 调研

日期：2026-10-31。以下依据官方产品介绍、商店条目和 API 文档，不代表已逐一安装竞品。

| 产品 | 官方描述中的相近功能 | 对本项目的启发 |
| --- | --- | --- |
| [Google Dictionary](https://chromewebstore.google.com/detail/google-dictionary-by-goog/mgijmajocgfcbeboacabfgobmjgjcoja) | 双击词语，出现释义气泡；工具栏查看完整释义 | 紧凑态先给答案，阅读不中断 |
| [沙拉查词](https://chromewebstore.google.com/detail/cdonnmffkdaoajfknoeeecmchibpmkmg) | 划词、聚合词典、生词等功能 | 多数据源是一条成熟路线，首版先收窄范围 |
| [Mate Translate](https://matetranslate.com/en/chrome) | 双击词语即时弹出翻译、多语言 | 词卡视觉要轻量、定位贴近选区 |
| [TransOver](https://chromewebstore.google.com/detail/transover/aggiiclaiamajehmlfpkjmlbadmkledi) | 悬停、点击、选择翻译和朗读 | 保留触发选择，避免侵入输入框 |

已有类似基础功能。LexiLoom 针对本次需求设计：多词分卡、细线相连、每卡独立展开、逐词移除、线性展开动画。本次调研不足以证明市场没有相同设计。

## Oxford

- [官方请求说明](https://developer.oxforddictionaries.com/documentation/making-requests-to-the-api)：生产 API 为 `https://od-api.oxforddictionaries.com/api/v2`，请求头为 `app_id` 和 `app_key`。
- 使用 `/words/en-gb?q=...` 或 `/words/en-us?q=...`，让屈折形式也能查询；Entries 通常要求原形。见 [官方 FAQ](https://developer.oxforddictionaries.com/faq)。
- [Sandbox](https://developer.oxforddictionaries.com/documentation/getting_started/sandbox) 是有限试用，500 次请求且英语仅支持 a 开头。非 a 词的失败不能解释成单词不存在。
- API 名称是 **Oxford Dictionaries API**，不等同 OED，也不声称接入 Oxford Advanced Learner's Dictionary。
- 默认不持久缓存官方内容；FAQ 说明缓存 / 离线保存需要 Enterprise 许可。正式使用按所购许可执行。

## Cambridge

- [开发入口](https://dictionary.cambridge.org/develop) 介绍官方 Dictionary API。
- [官方 specification](https://dev.eim-ciip-cambridge.org/api/specification)：base `https://dictionary.cambridge.org/api/v1`，请求头 `accessKey`，Accept 为 `application/json`。
- 先 `GET /dictionaries` 读取账号实际授权的 `dictionaryCode`。网站上的英汉路径不能直接当作已经核实的 API code。
- 查询 `/dictionaries/{dictionaryCode}/search/first?q=word&format=html` 返回 JSON，其中 `entryContent` 仍为词典 HTML。实现先提取安全文本，不把远端 HTML 注入页面。
- [官方 FAQ](https://dev.eim-ciip-cambridge.org/api/faq) 和 specification 区分 404 的 `NoResults` 与 `InvalidDictionary`，实现仅将前者作为查无词条。
- [资源页](https://dev.eim-ciip-cambridge.org/api/resources) 建议将密钥保存在服务器；本项目采用本机服务。
- [开发条款](https://dev.eim-ciip-cambridge.org/api/terms-and-conditions) 涉及申请审批和 evaluation 范围。拿到密钥后仍应确认实际使用 / 分发许可。

## 0.2.0 新增：可直接在线查询中文

选择 [WiktApi](https://wiktapi.dev/quickstart) 的中文维基词典 edition：`GET https://api.wiktapi.dev/v1/zh/word/{word}?lang=en`。官方说明无需 API key；[数据流程](https://wiktapi.dev/concepts/data-pipeline) 说明来源为 Wiktionary / Kaikki。真实请求已确认 `apple`、`serendipity` 返回中文释义、IPA 或音频，未知字符串按已知 JSON 错误格式返回 404。

真实数据未必包含文档示例里的 pos/lang_code，适配器兼容缺字段，不编造词性。中文可能简繁混合，保留原词典文本。WiktApi 为独立第三方服务，没有在公开介绍中承诺固定免费配额或 SLA；实现限制并发、处理 429 与超时，故障时有清楚标注的英英回退。

中文维基词典文字保留原词条、CC BY-SA 4.0 和例句引用；Commons 音频链接各自 File 描述页查阅许可。[Wikimedia 许可规定](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content)。

另核实了 [中文维基词典官方 Action API](https://www.mediawiki.org/wiki/API:Parsing_wikitext)，可匿名取页面 HTML，但返回更大且混有不同语言章节，本版优先结构化入口。也验证了 [MyMemory](https://mymemory.translated.net/doc/spec.php) 可无密钥取中译，但它是翻译记忆库，缺少完整词典义项和词性，且匿名有 [每日 5,000 字符限额](https://mymemory.translated.net/doc/usagelimits.php)，故未作为默认词典。

用户主动选词后，扩展后台检索词源 API 并呈现，不依赖隐藏标签页、搜索引擎结果 HTML 或翻译网站页面结构；不绕过登录、验证码或网页访问限制。

## 可体验与正式接入的界线

[Free Dictionary API](https://dictionaryapi.dev/) 和 WiktApi 是无需密钥查询的独立服务，都不是 Oxford / Cambridge。真实中文 / 英英在线成功已单独验收；本地中英示例为项目自编内容，不伪装成在线词条。

正式账号、英汉数据集权限及 Cambridge 实际词条结构都待用户获得授权后确认；测试样本仅证明接口适配和错误处理逻辑，不证明官方服务已成功联通。
