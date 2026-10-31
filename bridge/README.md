# 官方词典本地桥接

[English](README.en.md)

这个可选服务让 Chrome 扩展通过本机访问 Oxford Dictionaries API 或 Cambridge Dictionary API。官方密钥只写入 `bridge/.env`，不写进扩展，不下发给网页。

需要 Node.js 24。没有官方 API 授权时，可先使用扩展的示例词库或 Free Dictionary API 模式。英文界面默认即使用 Free Dictionary，不请求中文维基接口。

## 启动

在项目根目录执行：

```sh
cp bridge/.env.example bridge/.env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

把生成的随机字符串写入 `bridge/.env` 的 `BRIDGE_TOKEN`，在扩展配置页填写相同令牌。按你拥有的授权填写牛津或剑桥凭据，再运行：

```sh
node --env-file=bridge/.env bridge/server.js
```

服务固定监听 `127.0.0.1:47821`。关闭终端或按 Ctrl+C 停止。修改 `.env` 后需要重启。

## 牛津

- 配置 `OXFORD_APP_ID`、`OXFORD_APP_KEY`，`OXFORD_LANGUAGE` 选择 `en-gb` 或 `en-us`。
- 试用凭据使用 `OXFORD_SANDBOX=true`；正式凭据设为 `false`。
- 试用环境仅接受 a 开头的词，官方说明试用额度为 500 次；额度、计划以账户和官方页面为准。
- 使用官方推荐的 Words endpoint，可以查询词头和屈折变化形式。
- 这个服务接的是 **Oxford Dictionaries API**，不等同于 OED 或 Oxford Learner’s Dictionaries，也不保证提供中文释义。

官方文档：[凭据与认证](https://developer.oxforddictionaries.com/documentation/getting_started)、[Words endpoint](https://developer.oxforddictionaries.com/endpoints)、[Sandbox](https://developer.oxforddictionaries.com/documentation/getting_started/sandbox)、[API FAQ 与缓存许可](https://developer.oxforddictionaries.com/faq)。

## 剑桥

配置 `CAMBRIDGE_ACCESS_KEY`。词典代码必须来自账户实际授权列表，不能从网站网址推测。配置页的“读取剑桥词典列表”会调用本地服务 `/v1/dictionaries`，列出该密钥能够访问的代码。将选定代码写入 `CAMBRIDGE_DICTIONARY_CODE`，再重启服务。

请求流程为 `GET /dictionaries/{dictionaryCode}/search/first?q={word}&format=html`，头部为 `accessKey`。返回的 `entryContent` 是 HTML 字符串；适配器只提取已知结构的纯文本释义、翻译、音标和例句。它不会执行或在网页中插入该 HTML。遇到未知布局会显示格式错误，并提供原词典链接。

如果授权的是英汉词典，接口包含的中文翻译会保留；单语词典不会凭空补出中文。Cambridge 需要批准申请及对应使用授权，面向外部分发前请确认你的账户许可。

官方文档：[API specification](https://dev.eim-ciip-cambridge.org/api/specification)、[开发资源](https://dev.eim-ciip-cambridge.org/api/resources)、[使用条款](https://dev.eim-ciip-cambridge.org/api/terms-and-conditions)。

## 本地接口

所有接口都需要 `Authorization: Bearer <BRIDGE_TOKEN>`。

| GET 路径 | 作用 |
| --- | --- |
| `/v1/health` | 返回服务与凭据配置状态，不返回凭据 |
| `/v1/lookup?provider=oxford&word=apple` | 查牛津词典 |
| `/v1/lookup?provider=cambridge&word=apple` | 查已授权剑桥词典 |
| `/v1/dictionaries` | 列出剑桥密钥的授权词典代码 |

查词返回统一视图模型，`status` 为 `ok`、`not-found` 或 `error`。网络断开、授权失败、额度超限、未配置和未知响应格式不会被误报为“无法找到该单词”。剑桥的 HTTP 404 还可能表示词典代码或接口路径错误；只有响应中确认出现官方 `NoResults` 错误代码，查词才返回 `not-found`。[剑桥官方错误说明](https://dev.eim-ciip-cambridge.org/api/faq)

服务只接收本机回环 Host，拒绝普通网页 Origin，不开放网页 CORS。令牌不是官方密钥，但仍应保密。单实例最多处理 4 个并发请求，上游请求有超时及 1 MB 响应上限。服务不记录查询词，不保存或持久缓存官方词条；响应包含 `Cache-Control: no-store`。

自动化测试使用原创合成响应，不需要也不使用真实官方凭据。没有真实 API 授权时，这只能验证解析和调用契约，不能声称已经完成真实授权词典的联调。
