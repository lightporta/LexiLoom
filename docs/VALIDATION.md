# 0.2.0 验收记录

日期：2026-10-31。项目独立位于 `LexiLoom`，未修改旁边已有项目。

## 已执行

- **45 项 Node 自动化测试通过**：分词与去重、8 词限制、词形与 URL 校验、演示模式错误区分、Free / Wiktionary / Oxford / Cambridge 适配、中英回退错误语义、署名与独立音频许可元信息、Cambridge 多词性和双语关系、HTML 惰性解析、网络 / 鉴权 / 限流 / 404 分类、大小限制、loopback 服务认证与来源检查、并发上限、后台口令隔离、确定性 ZIP 结构 / CRC / 路径与启动器。
- **静态检查通过**：全部扩展 / 服务 / 工具 JS 的语法、Manifest V3、HTML 本地资源引用、CSP、版本一致性与权限。
- **真实加载扩展通过**：macOS，隔离临时资料目录，Chrome for Testing **156.0.8078.4**，headless 完整 Chromium。不是仅渲染静态原型。
- **23 项浏览器检查通过**：原有双击、例句 / 音标 / 用法展示、280ms 动画中间宽度、Esc、输入框排除、多词链、独立展开、移除单卡、⌘ 追加、背景关闭、右下角定位、390px 窄视口、设置持久化、打包体验页、无结果文本、迟到响应及无未捕获异常；另验证中文优先、真实来源 / 许可 / 引文展示、可见的回退说明，以及 3 项真实联网断言。
- **真实在线 API**：Free Dictionary 的 `apple` 返回 `status: ok` 和 2 个词性分组；WiktApi 的 `apple` 返回 `status: ok`，首释义为“蘋果（水果）”。另用实现直接请求 `qzxqzxqz`，WiktApi 按已确认的 JSON 错误格式返回无词条。
- 已人工查看单词展开、多词链、窄屏和阅读体验页截图，布局与标签符合当前实现。
- 已生成插件 ZIP 并检查内容；不包含本地 `.env`、官方密钥、测试依赖或用户数据。

浏览器记录：[browser-validation.json](browser-validation.json)。截图：[单词展开](browser-single.png)、[多词链](browser-multi.png)、[窄视口](browser-narrow.png)、[阅读体验页](reading-room.png)、[中文词源署名测试](browser-wiktionary.png)。最后一张使用明确标注的原创中文测试词条，真实在线中文结果另记于 JSON。

## 测试输入说明

词典 adapter 和 bridge 测试中的词典响应为原创**合成 fixture**。浏览器主交互使用原创演示，中文和回退 UI 使用合成词典响应，无结果 / 迟到响应使用受控 HTTP 404。默认 CI 的 20 项浏览器检查不依赖第三方网站在线状态；本次额外设置 `LEXILOOM_LIVE_TESTS=1`，加入真实在线查询及中文文本断言，共 23 项。模拟和真实联网结果不能相互替代。

## 尚未执行或当前不覆盖

- 没有有效的 Oxford / Cambridge 授权凭据，**没有完成官方 API 的真实连通与授权数据验收**。
- 没有真实授权的 Cambridge 英汉数据样本；实际授权字典布局、词条版权展示、发音链接和完整中文字段需联调。未知格式明确报错。
- Chrome 最低声明为 140，因为 local storage 的 TRUSTED_CONTEXTS 访问限制需要此版本；没有逐个版本实测 140–155。
- macOS ⌘ 追加已实测；Windows / Linux 的 Ctrl 交互由同一逻辑支持，未在真实 Windows / Linux 桌面执行。
- 已配置 Windows、Linux、macOS CI 执行 Node 检查、真实 Chromium 扩展测试和三平台 ZIP 原始字节比较。**尚未推送，远程 CI 尚未执行**，不能将此配置当作 Windows/Linux 已通过。
- 原生 ZIP 已在 macOS 用独立 ZIP 工具检查可读性和 CRC；相同输入的固定元数据 / 字节一致性已测试，真正跨 OS 的字节一致性仍待 CI。
- 发音按钮和系统朗读的代码路径与标签已检查；没有逐一听审操作系统所有语音和官方音频，音频播放也受页面 CSP / 浏览器策略影响。
- 未逐站点验收复杂网页、未覆盖 iframe / 编辑器 / 内置 PDF / 浏览器受限页面，未向 Chrome 商店提交或发布。

开启 / 暂停和词源切换在**下一次选词**时刷新；不承诺已经打开的词卡会即时关闭或更换数据。
