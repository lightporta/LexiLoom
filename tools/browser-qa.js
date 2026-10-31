// Uses a real isolated browser and deterministic dictionary fixtures.
// LEXILOOM_LIVE_TESTS=1 additionally checks the public dictionary services.
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = fileURLToPath(new URL('../', import.meta.url));
const extension = join(root, 'extension');
const profile = await mkdtemp(join(tmpdir(), 'lexiloom-qa-'));
const docs = join(root, 'docs'); await mkdir(docs, { recursive: true });
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const context = await chromium.launchPersistentContext(profile, {
  headless: true, viewport: { width: 1280, height: 960 },
  channel: 'chromium',
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
});
const report = { version: pkg.version, platform: process.platform, node: process.version, browser: context.browser()?.version(), checks: [], liveFree: null, liveWiktionary: null };
const check = (name, value) => { assert.ok(value, name); report.checks.push(name); console.log(`PASS ${name}`); };
try {
  console.log('Browser started:', context.browser()?.version());
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 });
  console.log('Extension worker registered:', worker.url());
  const extensionId = new URL(worker.url()).host;
  await worker.evaluate(async () => { await chrome.storage.local.set({ settings: { enabled: true, provider: 'demo', bridgeToken: '' } }); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const html = await readFile(join(root, 'tests/fixtures/reading.html'), 'utf8');
  await context.route('http://reading.lexiloom.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('http://reading.lexiloom.test/');
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
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
    for(let n=0;n<40;n++){ if(await panelValue(selector,'return true')) return; await pause(50); }
    throw new Error(`Missing ${selector}`);
  }
  async function ready() {
    for(let n=0;n<40;n++){ if(await panelValue('.cards','return this.querySelectorAll("[aria-busy=true]").length === 0')) return; await pause(50); }
    throw new Error('Lookup did not finish');
  }
  await page.locator('#serendipity').dblclick(); await waitPanel(); await ready();
  console.log('First card:', await panelValue('.summary-text','return this.textContent'));
  check('unpacked MV3 extension loads and double-click returns bilingual demo card', (await panelValue('.summary-text','return this.textContent')).includes('意外'));
  const widths = await panelValue('.panel', 'return new Promise(resolve=>{const samples=[this.getBoundingClientRect().width],start=performance.now();this.querySelector(".summary").click();const sample=()=>{samples.push(this.getBoundingClientRect().width);if(performance.now()-start<380)requestAnimationFrame(sample);else resolve(samples);};requestAnimationFrame(sample);})');
  const collapsed = widths[0], expanded = widths.at(-1);
  check('280ms expansion has an intermediate width and completes', widths.some(width=>width>collapsed+.5&&width<expanded-.5) && expanded >= 420);
  check('expanded card exposes example, translation, usage and pronunciation', await panelValue('.details','return !!this.querySelector(".example") && !!this.querySelector(".translation") && !!this.querySelector(".usage") && !!this.querySelector(".pronunciation")'));
  await page.screenshot({ path: join(docs,'browser-single.png') });
  await page.keyboard.press('Escape');
  check('Escape closes panel', !await panelValue('.panel','return true'));
  await page.locator('#input').dblclick(); await pause(300);
  check('editable input does not trigger lookup', !await panelValue('.panel','return true'));
  // Select a range as a user drag would, then send a trusted mouse release.
  await page.locator('#multi').evaluate(node => { const range=document.createRange();range.selectNodeContents(node);const selection=getSelection();selection.removeAllRanges();selection.addRange(range); });
  const multiBox = await page.locator('#multi').boundingBox();
  await page.mouse.move(multiBox.x+multiBox.width-1,multiBox.y+15); await page.mouse.up();
  await waitPanel('.launcher');
  await panelValue('.launcher','this.click()'); await waitPanel(); await ready();
  check('multi-selection creates three connected cards', await panelValue('.cards','return this.children.length === 3'));
  await panelValue('.card:nth-child(1) .summary','this.click()');
  await panelValue('.card:nth-child(3) .summary','this.click()'); await pause(330);
  check('cards expand independently', await panelValue('.cards','return this.querySelectorAll("[aria-expanded=true]").length === 2 && this.querySelectorAll("[aria-expanded=false]").length === 1'));
  await page.screenshot({ path: join(docs,'browser-multi.png') });
  await panelValue('.card:nth-child(2) .remove','this.click()');
  check('individual card removal keeps chain open', await panelValue('.cards','return this.children.length === 2'));
  await page.locator('#append').dblclick({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  for(let n=0;n<30;n++){if(await panelValue('.cards','return this.children.length === 3'))break;await pause(50);}
  await ready();
  check('Ctrl / Command + double-click appends a word', await panelValue('.cards','return this.children.length === 3 && this.textContent.includes("curiosity")'));
  await page.mouse.click(20,20); check('outside click closes cards', !await panelValue('.panel','return true'));
  await page.locator('#bottom').dblclick(); await ready(); await panelValue('.summary','this.click()'); await pause(340);
  check('expanded card stays inside viewport at bottom-right selection', await panelValue('.panel','const r=this.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight'));
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#curiosity').dblclick(); await ready(); await panelValue('.summary','this.click()'); await pause(340);
  check('expanded card fits a 390px viewport', await panelValue('.panel','const r=this.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth'));
  await page.screenshot({ path: join(docs,'browser-narrow.png') });
  await page.keyboard.press('Escape');
  const options = await context.newPage(); await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.locator('#provider').selectOption('demo'); await options.getByRole('button',{name:'保存设置'}).click();
  check('extension options persist provider', (await options.locator('#save-status').textContent()).includes('已保存'));
  const demo = await context.newPage(); await demo.goto(`chrome-extension://${extensionId}/try.html`);
  await demo.getByRole('button',{name:'体验一个词'}).click(); await pause(400);
  const demoCdp = await context.newCDPSession(demo);
  const demoDoc = await demoCdp.send('DOM.getDocument',{depth:-1,pierce:true});
  check('packaged demo page initializes its own local card UI', !!find(demoDoc.root,node=>node.localName==='lexiloom-reader'));
  await demo.screenshot({path:join(docs,'reading-room.png')});
  await worker.evaluate(() => { globalThis.__LEXILOOM_QA_FETCH__ = globalThis.fetch; });
  const wikiFixture = JSON.parse(await readFile(join(root, 'tests/fixtures/browser-wiki.json'), 'utf8'));
  await worker.evaluate(payload => { globalThis.fetch=async()=>Response.json(payload); }, wikiFixture);
  await options.evaluate(()=>chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:{enabled:true,provider:'smart'}}));
  await page.setViewportSize({width:1280,height:960}); await page.bringToFront();
  await page.locator('#serendipity').dblclick(); await waitPanel(); await ready();
  check('Chinese-first mode renders Chinese definitions through the background provider', (await panelValue('.summary-text','return this.textContent')).includes('原创测试'));
  await panelValue('.summary','this.click()'); await pause(340);
  check('open dictionary result retains source, license and quotation reference', await panelValue('.details','return !!this.querySelector(".source-license") && !!this.querySelector(".example-reference") && this.textContent.includes("WiktApi")'));
  await page.screenshot({path:join(docs,'browser-wiktionary.png')});
  await page.keyboard.press('Escape');
  const freeFixture = [{meanings:[{partOfSpeech:'noun',definitions:[{definition:'An original fallback dictionary definition.'}]}]}];
  await worker.evaluate(payload => { globalThis.fetch=async url=>String(url).includes('wiktapi.dev')?new Response('{}',{status:404}):Response.json(payload); }, freeFixture);
  await page.locator('#serendipity').dblclick(); await waitPanel(); await ready();
  check('English fallback is labelled with its actual source and visible reason', await panelValue('.card','return this.textContent.includes("Free Dictionary") && !this.querySelector(".lookup-notice").hidden'));
  await page.keyboard.press('Escape');
  await options.evaluate(()=>chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:{enabled:true,provider:'free'}}));
  // Verify missing-state text with a deterministic HTTP 404, not an invented dictionary entry.
  await worker.evaluate(() => { globalThis.fetch = async () => { await new Promise(resolve=>setTimeout(resolve,250)); return new Response('{}',{status:404,headers:{'Content-Type':'application/json'}}); }; });
  await page.setViewportSize({width:1280,height:960});
  await page.bringToFront();
  await page.locator('#missing').dblclick({position:{x:20,y:20}}); await waitPanel(); await ready();
  const missingText = await panelValue('.summary-text','return this.textContent');
  check('a confirmed HTTP 404 shows the requested no-word text', missingText === '无法找到该单词');
  await page.keyboard.press('Escape');
  await page.locator('#missing').dblclick({position:{x:20,y:20}}); await waitPanel(); await page.mouse.click(20,20); await pause(500);
  check('late lookup response does not reopen a dismissed panel', !await panelValue('.panel','return true'));
  await worker.evaluate(() => { globalThis.fetch=globalThis.__LEXILOOM_QA_FETCH__;delete globalThis.__LEXILOOM_QA_FETCH__; });
  if(process.env.LEXILOOM_LIVE_TESTS === '1') {
    for(const [provider,key] of [['free','liveFree'],['wiktionary','liveWiktionary']]) {
      const online=await options.evaluate(async provider=>{
        await chrome.runtime.sendMessage({type:'SAVE_SETTINGS',settings:{enabled:true,provider}});
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
  for(const page of context.pages().filter(page=>page.url().startsWith('http://reading.')))await page.screenshot({path:join(docs,'qa-failure.png')});
  throw error;
} finally { await context.close(); await rm(profile,{recursive:true,force:true}); }
