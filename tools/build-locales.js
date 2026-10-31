// Traditional UI strings are generated from the maintained Simplified catalog.
// Dictionary text follows each source's own policy; this is UI text only.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Converter } from '../extension/shared/chinese-data/opencc.js';
const root = fileURLToPath(new URL('../extension/_locales/', import.meta.url));
const convert = Converter({ from: 'cn', to: 'tw' });
const simplified = JSON.parse(await readFile(join(root, 'zh_CN/messages.json'), 'utf8'));
const traditional = Object.fromEntries(Object.entries(simplified).map(([key, entry]) => [key, { ...entry, message: convert(entry.message) }]));
const phrases = {
  regionCN: '中國大陸 · 簡體／漢語拼音', regionHK: '香港 · 繁體／粵拼', regionTW: '臺灣 · 繁體／注音',
  regionHelp: '部分瀏覽器只提供「繁體中文」，無法區分香港和臺灣時，可在這裡指定。',
  audioDictionary: '詞典音訊', audioUnavailable: '音訊暫時無法播放，請使用系統朗讀', audioFallback: '音訊',
  source_moedict: '教育部《重編國語辭典修訂本》· 萌典', tryChineseSample: '你好 學習 語言'
};
for (const [key, message] of Object.entries(phrases)) traditional[key] = { ...traditional[key], message };
await mkdir(join(root, 'zh_TW'), { recursive: true });
await writeFile(join(root, 'zh_TW/messages.json'), JSON.stringify(traditional, null, 2) + '\n');
console.log(`Built Traditional Chinese UI catalog (${Object.keys(traditional).length} messages).`);
