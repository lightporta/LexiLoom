// Uses a real isolated browser and deterministic dictionary fixtures.
// --lang does not change chrome.i18n.getUILanguage() on macOS or Linux, so the
// Chinese checks below run against a copy whose getUILanguage is zh-CN.
// LEXILOOM_LIVE_TESTS=1 additionally checks the public dictionary services.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { openLocaleHarness } from './browser-test-harness.js';
import { probeExpansion, hasLinearExpansion } from './browser-animation-probe.js';
import { waitForLookupState } from './browser-lookup-wait.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = fileURLToPath(new URL('../', import.meta.url));
const docs = join(root, 'docs'); await mkdir(docs, { recursive: true });
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const catalog = JSON.parse(await readFile(join(root, 'extension/_locales/zh_CN/messages.json'), 'utf8'));
const savedText = catalog.saved.message;
const notFoundText = catalog.notFound.message;
const report = { version: pkg.version, platform: process.platform, node: process.version, browser: '', checks: [], liveFree: null, liveWiktionary: null, uiLanguage: 'zh-CN', localeMode: 'shimmed chrome.i18n.getUILanguage' };
const check = (name, value, detail = '') => {
  assert.ok(value, detail ? `${name}: ${detail}` : name);
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
let harness;
try {
  harness = await openLocaleHarness(chromium, 'zh-CN', { blockNetwork: false });
  const { context, worker, page, errors } = harness;
  report.browser = context.browser()?.version();
  console.log('Browser started:', report.browser);
  console.log('Extension worker registered:', worker.url());
  const extensionId = harness.extensionId;
  const language = await worker.evaluate(() => chrome.i18n.getUILanguage());
  check('service worker UI language is isolated as zh-CN', language === 'zh-CN');
  await worker.evaluate(async () => {
    globalThis.__LEXILOOM_QA_FETCH__ = globalThis.__LEXILOOM_QA_ORIGINAL_FETCH__ || globalThis.fetch;
    // A deterministic browser test must never fall through to public services.
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith('chrome-extension://')) return globalThis.__LEXILOOM_QA_FETCH__(url, init);
      throw new Error('Unexpected network request in offline browser QA');
    };
    await chrome.storage.local.set({ settings: { enabled: true, provider: 'demo', englishProvider: 'demo', chineseRegion: 'auto', bridgeToken: '' } });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }]
  });
  function find(node, predicate) {
    if (predicate(node)) return node;
    for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) { const value = find(child, predicate); if (value) return value; }
  }
  async function shadowId() {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const host = find(root, node => node.localName === 'lexiloom-reader');
    return host?.shadowRoots?.[0]?.nodeId;
  }
  async function panelValue(selector, expression) {
    const rootId = await shadowId(); if (!rootId) return null;
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: rootId, selector });
    if (!nodeId) return null;
    const { object } = await cdp.send('DOM.resolveNode', { nodeId });
    const { result, exceptionDetails } = await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: `function(){${expression}}`, returnByValue: true, awaitPromise: true });
    if (exceptionDetails) throw new Error(exceptionDetails.text);
    return result.value;
  }
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitPanel(selector = '.panel') {
    for (let n = 0; n < 80; n++) { if (await panelValue(selector, 'return true')) return; await pause(50); }
    throw new Error(`Missing ${selector}`);
  }
  async function readLookupState() {
    return panelValue('.panel', `return (() => {
      const cards = [...this.querySelectorAll('.card')].map(card => ({
        word: card.querySelector('.word')?.textContent || '',
        busy: card.getAttribute('aria-busy') === 'true',
        loading: !!card.querySelector('.summary-text.loading')
      }));
      return { cards };
    })()`);
  }
  async function ready(words) {
    return waitForLookupState(readLookupState, words, { timeoutMs: 15000, pollIntervalMs: 50 });
  }
  async function forceMotion(preference) {
    await page.emulateMedia({ reducedMotion: preference });
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: preference === 'reduce' ? 'reduce' : 'no-preference' }]
    });
  }
  await page.locator('#serendipity').dblclick(); await waitPanel(); await ready(['serendipity']);
  console.log('First card:', await panelValue('.summary-text','return this.textContent'));
  check('unpacked MV3 extension loads and double-click returns a Chinese demo card', (await panelValue('.summary-text','return this.textContent')).includes('意外'));
  report.motionPreference = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  check('animation suite starts with reduced-motion disabled', report.motionPreference === false, JSON.stringify(report.motionPreference));
  report.animation = await panelValue('.panel', `return (${probeExpansion.toString()}).call(this)`);
  console.log('Expansion timeline:', JSON.stringify(report.animation));
  check('280ms linear expansion interpolates at 25%, 50% and 75% and completes', hasLinearExpansion(report.animation), JSON.stringify(report.animation));
  await panelValue('.summary', 'this.click()');
  await harness.waitForPanel('.panel', 'return Math.abs(this.getBoundingClientRect().width - 312) < .5');
  report.stalledAnimation = await panelValue('.panel', `return (${probeExpansion.toString()}).call(this, {stallMs: 500})`);
  check('expansion timeline remains testable after a 500ms renderer stall', hasLinearExpansion(report.stalledAnimation), JSON.stringify(report.stalledAnimation));
  check('expanded card exposes example and pronunciation', await panelValue('.details','return !!this.querySelector(".example") && !!this.querySelector(".pronunciation")'));
  check('Chinese card retains translation and usage', await panelValue('.details', 'return !!this.querySelector(".translation") && !!this.querySelector(".usage")'));
  await page.screenshot({ path: join(docs,'browser-single.png') });
  await forceMotion('reduce');
  await panelValue('.summary', 'this.click()');
  report.reducedMotion = await panelValue('.panel', `return (${probeExpansion.toString()}).call(this)`);
  check('reduced-motion preference expands immediately without a width transition', report.reducedMotion.reducedMotion && report.reducedMotion.duration === null && Math.abs(report.reducedMotion.expanded - 424) < .5, JSON.stringify(report.reducedMotion));
  await forceMotion('no-preference');
  await page.keyboard.press('Escape');
  check('Escape closes panel', !await panelValue('.panel','return true'));
  await page.locator('#input').dblclick(); await pause(300);
  check('editable input does not trigger lookup', !await panelValue('.panel','return true'));
  // Select a range as a user drag would, then send a trusted mouse release.
  await page.locator('#multi').evaluate(node => { const range=document.createRange();range.selectNodeContents(node);const selection=getSelection();selection.removeAllRanges();selection.addRange(range); });
  const multiBox = await page.locator('#multi').boundingBox();
  await page.mouse.move(multiBox.x+multiBox.width-1,multiBox.y+15); await page.mouse.up();
  await waitPanel('.launcher');
  await panelValue('.launcher','this.click()'); await waitPanel(); await ready(['luminous', 'ephemeral', 'serendipity']);
  check('multi-selection creates three connected cards', await panelValue('.cards','return this.children.length === 3'));
  await panelValue('.card:nth-child(1) .summary','this.click()');
  await panelValue('.card:nth-child(3) .summary','this.click()'); await pause(330);
  check('cards expand independently', await panelValue('.cards','return this.querySelectorAll("[aria-expanded=true]").length === 2 && this.querySelectorAll("[aria-expanded=false]").length === 1'));
  await page.screenshot({ path: join(docs,'browser-multi.png') });
  await panelValue('.card:nth-child(2) .remove','this.click()');
  check('individual card removal keeps chain open', await panelValue('.cards','return this.children.length === 2'));
  await page.locator('#append').dblclick({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  await ready(['luminous', 'serendipity', 'curiosity']);
  check('Ctrl / Command + double-click appends a word', await panelValue('.cards','return this.children.length === 3 && this.textContent.includes("curiosity")'));
  await page.mouse.click(20,20); check('outside click closes cards', !await panelValue('.panel','return true'));
  await page.locator('#bottom').dblclick(); await ready(['luminous']); await panelValue('.summary','this.click()'); await pause(340);
  check('expanded card stays inside viewport at bottom-right selection', await panelValue('.panel','const r=this.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight'));
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#curiosity').dblclick(); await ready(['curiosity']); await panelValue('.summary','this.click()'); await pause(340);
  check('expanded card fits a 390px viewport', await panelValue('.panel','const r=this.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth'));
  await page.screenshot({ path: join(docs,'browser-narrow.png') });
  await page.keyboard.press('Escape');
  const options = await context.newPage(); await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.locator('button[type="submit"]').waitFor();
  await options.locator('#guidance-groups input[data-guidance-id]').first().waitFor();
  const builtinIds = await worker.evaluate(() => globalThis.LexiLoomGuidance.builtinIds());
  const guidanceOptionIds = await options.evaluate(() => [...document.querySelectorAll('#guidance-groups input[data-guidance-id]')].map(input => input.dataset.guidanceId));
  check('options page renders one checkbox per built-in dictionary link', guidanceOptionIds.length === builtinIds.length && builtinIds.every(id => guidanceOptionIds.includes(id)), JSON.stringify({ rendered: guidanceOptionIds.length, builtin: builtinIds.length }));
  check('options page shows the Chinese save button', (await options.locator('button[type="submit"]').innerText()).includes('保存设置'));
  await options.locator('#provider').selectOption('demo'); await options.locator('button[type="submit"]').click();
  await options.locator('#save-status').filter({hasText: savedText}).waitFor();
  check('extension options persist settings in the Chinese interface', (await options.locator('#save-status').textContent()) === savedText);
  const demo = await context.newPage(); await demo.goto(`chrome-extension://${extensionId}/try.html`);
  await demo.locator('#show-single').waitFor();
  check('packaged demo page shows the Chinese trial button', (await demo.locator('#show-single').innerText()).includes('体验一个词'));
  await demo.locator('#show-single').click(); await pause(400);
  const demoCdp = await context.newCDPSession(demo);
  const demoDoc = await demoCdp.send('DOM.getDocument',{depth:-1,pierce:true});
  check('packaged demo page initializes its own local card UI', !!find(demoDoc.root,node=>node.localName==='lexiloom-reader'));
  await demo.screenshot({path:join(docs,'reading-room.png')});
  const wikiFixture = JSON.parse(await readFile(join(root, 'tests/fixtures/browser-wiki.json'), 'utf8'));
  await worker.evaluate(payload => { globalThis.__LEXILOOM_QA_REQUESTS__=[];globalThis.fetch=async (url,init)=>{if(String(url).startsWith('chrome-extension://'))return globalThis.__LEXILOOM_QA_FETCH__(url,init);globalThis.__LEXILOOM_QA_REQUESTS__.push(String(url));return Response.json(payload);}; }, wikiFixture);
  await options.evaluate(()=>chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:{enabled:true,provider:'smart',englishProvider:'free'}}));
  await page.setViewportSize({width:1280,height:960}); await page.bringToFront();
  await page.locator('#serendipity').dblclick(); await waitPanel(); await ready(['serendipity']);
  check('Chinese-first mode renders Chinese definitions through the background', (await panelValue('.summary-text','return this.textContent')).includes('原创测试'));
  await panelValue('.summary','this.click()'); await pause(340);
  check('dictionary card retains its source, license and examples', await panelValue('.details', 'return !!this.querySelector(".source-license") && !!this.querySelector(".example-reference") && this.textContent.includes("WiktApi")'));
  const guidance = await panelValue('.card', 'return (() => { const block = this.querySelector(".guidance"); const links = [...(block ? block.querySelectorAll(".guidance-link") : [])]; return { expanded: !!this.querySelector("[aria-expanded=true]"), present: !!block, count: links.length, names: links.map(link => link.textContent), hrefs: links.map(link => link.getAttribute("href")) }; })()');
  check('expanded card shows one to three credited dictionary guidance links', guidance.expanded && guidance.present && guidance.count >= 1 && guidance.count <= 3, JSON.stringify(guidance));
  check('guidance link hrefs are https URLs with no unencoded whitespace', guidance.hrefs.every(href => typeof href === 'string' && href.startsWith('https://') && !/\s/.test(href)), JSON.stringify(guidance.hrefs));
  check('zh-CN interface lists 有道词典 for the demo English headword', guidance.names.some(name => name.includes('有道词典')), JSON.stringify(guidance.names));
  const requests = await worker.evaluate(()=>globalThis.__LEXILOOM_QA_REQUESTS__);
  check('Chinese UI lookup requests Chinese Wiktionary', requests.length === 1 && requests[0].includes('api.wiktapi.dev/'));
  await page.screenshot({path:join(docs,'browser-wiktionary.png')});
  const openCardCount = await panelValue('.cards', 'return this.children.length');
  const readGuidanceState = () => panelValue('.panel', 'return { cards: this.querySelectorAll(".card").length, links: [...this.querySelectorAll(".card .guidance-link")].map(link => link.textContent) }');
  await options.evaluate(async ids => {
    const response = await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { enabled: true, guidanceDisabled: ids } });
    if (!response.ok) throw new Error('saving disabled guidance failed');
  }, builtinIds);
  let hiddenState;
  for (let attempt = 0; attempt < 120; attempt++) { hiddenState = await readGuidanceState(); if (hiddenState && !hiddenState.links.length) break; await pause(50); }
  check('disabling every site hides open-card guidance without closing the panel', Boolean(hiddenState) && hiddenState.cards === openCardCount && hiddenState.links.length === 0, JSON.stringify(hiddenState));
  await options.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: { guidanceDisabled: [] } });
    if (!response.ok) throw new Error('restoring guidance settings failed');
  });
  let restoredState;
  for (let attempt = 0; attempt < 120; attempt++) { restoredState = await readGuidanceState(); if (restoredState && restoredState.links.length) break; await pause(50); }
  check('restoring guidance settings brings the links back on the same open card', Boolean(restoredState) && restoredState.cards === openCardCount && restoredState.links.length >= 1 && restoredState.links.length <= 3, JSON.stringify(restoredState));
  await page.keyboard.press('Escape');
  const freeFixture = [{meanings:[{partOfSpeech:'noun',definitions:[{definition:'An original fallback dictionary definition.'}]}]}];
  await worker.evaluate(payload => { globalThis.fetch=async (url,init)=>String(url).startsWith('chrome-extension://')?globalThis.__LEXILOOM_QA_FETCH__(url,init):String(url).includes('wiktapi.dev')?new Response('{}',{status:404}):Response.json(payload); }, freeFixture);
  await page.locator('#serendipity').dblclick(); await waitPanel(); await ready(['serendipity']);
  check('English fallback is labelled with its actual source and visible reason', await panelValue('.card', 'return this.textContent.includes("Free Dictionary") && !this.querySelector(".lookup-notice").hidden'));
  await page.keyboard.press('Escape');
  await options.evaluate(()=>chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:{enabled:true,provider:'free'}}));
  // Verify missing-state text with a deterministic HTTP 404, not an invented dictionary entry.
  await worker.evaluate(() => { globalThis.fetch = async (url,init) => { if(String(url).startsWith('chrome-extension://'))return globalThis.__LEXILOOM_QA_FETCH__(url,init);await new Promise(resolve=>setTimeout(resolve,250)); return new Response('{}',{status:404,headers:{'Content-Type':'application/json'}}); }; });
  await page.setViewportSize({width:1280,height:960});
  await page.bringToFront();
  await page.locator('#missing').dblclick({position:{x:20,y:20}}); await waitPanel(); await ready(['qzxqzxqz']);
  const missingText = await panelValue('.summary-text','return this.textContent');
  check('a confirmed HTTP 404 shows the Chinese no-word text', missingText === notFoundText);
  await page.keyboard.press('Escape');
  await page.locator('#missing').dblclick({position:{x:20,y:20}}); await waitPanel(); await page.mouse.click(20,20); await pause(500);
  check('late lookup response does not reopen a dismissed panel', !await panelValue('.panel','return true'));
  await worker.evaluate(() => { globalThis.fetch=globalThis.__LEXILOOM_QA_FETCH__;delete globalThis.__LEXILOOM_QA_FETCH__; });
  if(process.env.LEXILOOM_LIVE_TESTS === '1') {
    for(const [provider,key] of [['free','liveFree'],['wiktionary','liveWiktionary']]) {
      const online=await options.evaluate(async provider=>{
        await chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:{enabled:true,provider,englishProvider:'free'}});
        return chrome.runtime.sendMessage({type:'LOOKUP',word:'apple'});
      },provider);
      report[key]={status:online.status,code:online.error?.code,meaningCount:online.meanings?.length||0,firstDefinition:online.meanings?.[0]?.definitions?.[0]?.definition?.slice(0,100)};
      check(`live ${provider} API returns an actual apple entry`,online.status==='ok');
      if(provider==='wiktionary')check('live Wiktionary response contains a Chinese definition',/\p{Script=Han}/u.test(report[key].firstDefinition||''));
    }
  }
  check('no uncaught content-page JavaScript errors', errors.length === 0);
  await writeFile(join(docs,'browser-validation.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} catch(error) {
  report.error = { name:error.name, message:error.message, stack:error.stack };
  await writeFile(join(docs,'browser-validation.json'),JSON.stringify(report,null,2)+'\n');
  for (const page of harness?.context.pages().filter(page => page.url().startsWith('http://')) || []) await page.screenshot({ path: join(docs, 'qa-failure.png') });
  throw error;
} finally { await harness?.close(); }
