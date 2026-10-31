# LexiLoom · 语织

[English](README.en.md)

在网页里查单词。英文双击一下，中文划一下再点旁边的查词。意思先出现在旁边的小卡片上，点开才是读音、用法和例句。一次可以留好几张卡，各自展开，互不打扰。

![英文词卡](docs/browser-single.png)

## 安装

Chrome 140 或更新版本。Windows、macOS、Linux 用同一份扩展，不用编译。

1. 下载源码，或把 `dist/LexiLoom-<版本>-chrome.zip` 解开。
2. 打开 `chrome://extensions`，打开右上角的开发者模式。
3. 选“加载已解压的扩展程序”。源码就选 `extension` 这个文件夹，里面要有 `manifest.json`。
4. 已经打开的网页刷新一次。

装好后点工具栏图标，可以进设置，也可以打开体验页先试试词卡。

## 使用

点词头展开，再点一次收起。按住 Ctrl（Mac 上是 ⌘）再双击另一个词，会加进同一组，最多 8 个。卡片右上角的 × 只拿掉这一个词。整组关掉用顶部的 ×、Esc，或点页面空白处。

有词典录音就播录音。没有的话，用浏览器自己的朗读。

中文和英文走同一张卡片。界面跟着 Chrome 的语言。查中文时，卡片上有这个地区的读音、一两句例句，还有英文解释。词源没给的项目会写明，不会临时编一条。

- 简体，中国大陆：简体释义，汉语拼音。
- 繁体，台湾：台湾词条和注音。正文用教育部辞典的原文。
- 繁体，香港：繁体释义，优先用词源里标明香港的粤拼。普通话读音如果有，会另外标成补充。

繁简转换只用于维基词典的显示和检索。它不会把一份大陆词条改个字形，就算成台湾或香港的语料。浏览器如果只有一个“繁体中文”、分不清香港和台湾，可以在设置里指定地区。

英文界面查英文单词时，卡片上只留英文释义、音标和例句。查中文时，中文的词形和读音还在。

Chrome 自己的页面、扩展商店、内置 PDF、输入框、编辑器，以及网页里的 iframe，目前查不了。

## 词从哪来

默认不用填密钥。

中文界面查英文，先试中文维基词典，没有再落到 Free Dictionary 的英英释义。词卡会写回退的原因和实际来源。英文界面查英文，默认就是 Free Dictionary。

中文这边按地区拿语料：

- 大陆的释义、以及各地维基词典里的读音，来自 [WiktApi](https://wiktapi.dev/)。
- 台湾的释义和注音优先用萌典上的教育部《重編國語辭典修訂本》。
- 香港优先用维基词典里标明粤语、香港的读音。
- 英文解释来自英文维基词典里的中文词条。
- [Free Dictionary](https://dictionaryapi.dev/) 负责英文单词的英英释义和音频。
- Oxford 和 Cambridge 可以自己接，需要官方授权和本地词典服务，见 [bridge/README.md](bridge/README.md)。
- 设置里的本地演示是项目里写的例句，用来试手感，不是在线词典。

出处、例句参考和许可链接留在卡片底部。各词典覆盖不一样，署名在 [THIRD_PARTY.md](THIRD_PARTY.md)。查词只发送选中的词，不上传整页，也不记历史。隐私说明在 [PRIVACY.md](PRIVACY.md)。

## 开发

Node.js 22 以上。扩展运行时没有第三方依赖。Playwright 只在跑浏览器测试时用。

```sh
npm ci
npm test
npm run check
npm run preview   # http://127.0.0.1:4173
npm run package   # 输出到 dist/
```

浏览器测试：

```sh
npx --no-install playwright-core install chromium
npm run test:browser
npm run test:browser:locales
```

Linux 上安装 Chromium 用 `install --with-deps chromium`。默认走固定样本。要连真实词源，设 `LEXILOOM_LIVE_TESTS=1`。

启动脚本和 CI 见 [跨平台说明](docs/CROSS_PLATFORM.md)，验收记录见 [docs/VALIDATION.md](docs/VALIDATION.md)，更新见 [CHANGELOG.md](CHANGELOG.md)。

## 许可

代码、样式、演示词条和文档是 [MIT](LICENSE)，版权人 lightporta。词典正文、引文和音频仍归各自的许可，见 [THIRD_PARTY.md](THIRD_PARTY.md)。
