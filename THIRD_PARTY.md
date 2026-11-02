# 数据来源与署名

[English](THIRD_PARTY.en.md)

## 中文维基词典 / WiktApi

中文释义由 [WiktApi](https://wiktapi.dev/quickstart) 提供结构化访问，数据来源为 [中文维基词典](https://zh.wiktionary.org/) 经 [Kaikki / Wiktextract](https://kaikki.org/) 等流程提取。WiktApi 是独立第三方服务，不是 Wikimedia、Oxford 或 Cambridge 官方服务。

词卡链接到原始词条，并展示“中文维基词典，经 WiktApi 抽取并节选”及 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 许可链接。释义与例句按显示长度节选，保留原始文本；引用注明响应给出的出处。不同材料可能另有来源要求，完整信息以原词条和 [Wikimedia 使用条款 §7](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use#7._Licensing_of_Content) 为准。

英文维基词典里的中文词条也经 WiktApi 读取，用来给中文字词配英文解释，许可同样是 CC BY-SA 4.0。

日、韩、法、德、西语词卡读取中文维基词典中对应语言的词条，使用相同的许可与原词条署名。中文释义和例句的中文译文会用 OpenCC 转为简体，转换在卡片的来源说明中标明；原语词头、例句不转换。缺失或无法可靠识别的例句不会补写。

Wikimedia Commons 音频的许可与文字许可分开。词卡提供相应 File 描述页链接以查阅作者、来源和许可；不推定所有音频共享 CC BY-SA 4.0。

## 教育部《重編國語辭典修訂本》 / 萌典

台湾界面的中文释义和注音优先来自 [萌典](https://www.moedict.tw/) 提供的教育部辞典 JSON。正文按原文显示，不做繁简转换，也不改写例句。许可是 [CC BY-ND 3.0 TW](https://creativecommons.org/licenses/by-nd/3.0/tw/)。词卡链接到萌典上的原条目。

香港和大陆的查询不请求萌典。香港读音取自维基词典里标明粤语、香港的记录，不是把台湾或大陆词条转成繁体后再换个名字。

## OpenCC

扩展内置 [opencc-js 1.4.2](https://github.com/nk2028/opencc-js)，许可为 MIT AND Apache-2.0。它只转换维基词典正文的显示用字，以及查词前的检索字形。教育部辞典的原文不经过它。字体数据和许可证副本在 `extension/shared/chinese-data/`。

## Free Dictionary API

[Free Dictionary API](https://dictionaryapi.dev/) 的释义、词条来源与音频可能具有各自许可。适配器保留响应给出的词条来源、文字许可和独立音频来源；词卡提供相应链接。

## Oxford / Cambridge

使用个人获授权的 API 及数据集。扩展不分发或内置官方词典内容，不持久保存查询结果。当前尚无真实凭据联调证据。具体许可见官方账户和授权协议。

## 词典导航（外部链接）

词典导航的 23 条内置站点记录（各语言维基词典、萌典、汉典、Larousse、Duden、RAE 等）只保存站点名称与 HTTPS URL 模板，用于点击时打开外站。扩展不抓取、不转存这些站点的页面正文；各站点的使用条款与隐私政策适用于你在外站的访问。导航列出可用站点，不表示这些站点一定收录了查询词。

## 本地演示与测试

内置 12 个双语示例和测试 fixture 为项目原创示例，不冒称任何官方词典内容。真实在线验收与合成样本测试分别记录。

## 开发工具

Playwright Core 仅用于开发和测试，其 [Apache-2.0 许可](https://github.com/microsoft/playwright/blob/main/LICENSE) 由依赖包保留；不会打入扩展安装包。
