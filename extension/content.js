(() => {
  "use strict";
  if (globalThis.__lexiloomContentLoaded) return;
  globalThis.__lexiloomContentLoaded = true;

  const core = globalThis.LexiLoomCore;
  if (!core || !globalThis.LexiLoomTheme) return;
  const runtime = globalThis.chrome?.runtime;
  // Only our dedicated extension demo page may override the extension runtime.
  // A normal web page never controls the installed content script's dictionary adapter.
  const ownDemoPage = runtime?.id && location.protocol === "chrome-extension:"
    && location.hostname === runtime.id && location.pathname === "/try.html";
  const preview = (!runtime?.id || ownDemoPage) ? globalThis.__LEXILOOM_PREVIEW__ : null;
  if (!runtime?.id && !preview) return;
  const bridge = preview ? {
    lookup: word => preview.lookup(word),
    settings: () => preview.getSettings(),
    options: () => preview.openOptions(),
  } : {
    lookup: word => runtime.sendMessage({ type: "LOOKUP", word }),
    settings: () => runtime.sendMessage({ type: "GET_SETTINGS" }),
    options: () => runtime.sendMessage({ type: "OPEN_OPTIONS" }),
  };

  const POS = { noun: "名词", verb: "动词", adjective: "形容词", adverb: "副词", pronoun: "代词", preposition: "介词", conjunction: "连词", interjection: "感叹词", determiner: "限定词", exclamation: "感叹词", phrase: "短语" };
  let enabled = true;
  let host, shadow, panel, cardList, footer, count, panelObserver;
  let launcher, launcherSnapshot, selectionTimer;
  let anchor = null, anchorRange = null, anchorSide = null, previousFocus = null;
  let session = 0, serial = 0;
  let cards = new Map();
  let currentAudio = null;
  let currentUtterance = null;
  let settingsVersion = 0;

  async function refreshSettings() {
    const version = ++settingsVersion;
    try {
      const settings = await bridge.settings();
      if (version === settingsVersion) {
        enabled = settings?.enabled !== false;
        if (!enabled) closePanel();
      }
    } catch { /* LOOKUP reports an invalidated extension context with an actionable error. */ }
    return enabled;
  }

  const text = value => typeof value === "string" ? value.slice(0, 8000) : "";
  const element = (tag, className, label) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (label !== undefined) node.textContent = label;
    return node;
  };
  const button = (className, label, title, action) => {
    const node = element("button", className, label);
    node.type = "button";
    if (title) { node.title = title; node.setAttribute("aria-label", title); }
    node.addEventListener("click", action);
    return node;
  };
  const safeURL = value => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  };
  const isInternal = event => host && event.composedPath().includes(host);
  const isEditable = event => event.composedPath().some(node => node instanceof Element && (
    node.matches("input, textarea, select, [role='textbox']") || node.isContentEditable
  ));
  const bounds = () => ({ width: window.innerWidth, height: window.innerHeight });
  const clamp = (n, min, max) => Math.min(Math.max(n, min), Math.max(min, max));

  function ensureHost() {
    if (host?.isConnected) return;
    host = document.createElement("lexiloom-reader");
    host.style.cssText = "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;";
    shadow = host.attachShadow({ mode: "closed" });
    const style = element("style");
    style.textContent = globalThis.LexiLoomTheme;
    shadow.append(style);
    document.documentElement.append(host);
  }

  function stopAudio() {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    // speechSynthesis is shared with the page. Only cancel speech we started.
    if (currentUtterance && globalThis.speechSynthesis) {
      currentUtterance.onend = currentUtterance.onerror = null;
      currentUtterance = null;
      speechSynthesis.cancel();
    }
  }

  function closePanel(restore = false) {
    session += 1;
    panelObserver?.disconnect();
    panelObserver = null;
    panel?.remove();
    panel = cardList = footer = count = null;
    cards.clear();
    anchor = anchorRange = anchorSide = null;
    stopAudio();
    hideLauncher();
    if (restore && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  function hideLauncher() {
    launcher?.remove();
    launcher = launcherSnapshot = null;
    clearTimeout(selectionTimer);
  }

  function snapshot() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const parsed = core.parseSelection(selection.toString());
    if (!parsed.words.length) return null;
    const range = selection.getRangeAt(0).cloneRange();
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    return { ...parsed, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, range };
  }

  function positionPanel() {
    if (!panel || !anchor) return;
    if (anchorRange) {
      try {
        if (anchorRange.commonAncestorContainer.isConnected) {
          const next = anchorRange.getBoundingClientRect();
          if (next.width || next.height) anchor = next;
        }
      } catch { /* A page may replace the selected nodes while a lookup is open. */ }
    }
    const viewport = bounds();
    const expanded = [...cards.values()].some(card => card.open);
    const desiredWidth = expanded ? 424 : 312;
    const width = Math.min(desiredWidth, viewport.width - 24);
    panel.style.setProperty("--ll-width", `${desiredWidth}px`);
    const height = Math.min(panel.getBoundingClientRect().height || 170, viewport.height - 24);
    const below = anchor.bottom + 9;
    const above = anchor.top - height - 9;
    // Choose the side once per selection. Resizing an expanding card must not
    // suddenly flip the whole chain across the selected word.
    if (!anchorSide) {
      if (below + height <= viewport.height - 12) anchorSide = "below";
      else if (above >= 12) anchorSide = "above";
      else anchorSide = viewport.height - anchor.bottom >= anchor.top ? "below" : "above";
    }
    const top = anchorSide === "above" ? above : below;
    panel.style.left = `${clamp(anchor.left, 12, viewport.width - width - 12)}px`;
    panel.style.top = `${clamp(top, 12, viewport.height - height - 12)}px`;
  }

  function setFooter(message) {
    if (!footer) return;
    footer.replaceChildren();
    const help = element("span", "", "双击新词替换 · Ctrl / ⌘ + 双击追加");
    footer.append(help);
    if (message) footer.append(element("span", "notice", message));
  }

  function updateCount() {
    if (count) count.textContent = `${cards.size} / ${core.MAX_WORDS || 8}`;
  }

  function makePanel() {
    ensureHost();
    previousFocus = document.activeElement;
    panel = element("section", "panel");
    panel.tabIndex = -1;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "语织单词释义");
    const toolbar = element("header", "toolbar");
    const brand = element("div", "brand");
    brand.append(element("span", "brand-mark", "L"));
    const brandName = element("span", "brand-name", "LexiLoom");
    brandName.append(element("span", "brand-cn", "语织"));
    brand.append(brandName);
    count = element("span", "count");
    const close = button("icon-button", "×", "退出查词（Esc）", () => closePanel(true));
    toolbar.append(brand, count, close);
    cardList = element("div", "cards");
    footer = element("footer", "footer");
    panel.append(toolbar, cardList, footer);
    shadow.append(panel);
    if (globalThis.ResizeObserver) {
      panelObserver = new ResizeObserver(() => positionPanel());
      panelObserver.observe(panel);
    }
    setFooter();
    panel.focus({ preventScroll: true });
  }

  function removeCard(word) {
    const card = cards.get(word);
    if (!card) return;
    const next = card.article.nextElementSibling || card.article.previousElementSibling;
    cards.delete(word);
    card.article.remove();
    if (!cards.size) { closePanel(true); return; }
    updateCount();
    positionPanel();
    next?.querySelector("button.summary")?.focus();
  }

  function toggleCard(card) {
    card.open = !card.open;
    card.summary.setAttribute("aria-expanded", String(card.open));
    card.fold.dataset.open = String(card.open);
    card.fold.setAttribute("aria-hidden", String(!card.open));
    card.fold.inert = !card.open;
    card.expandHint.textContent = card.open ? "−" : "+";
    card.tapHint.textContent = card.open ? "点击收起" : "点击展开";
    positionPanel();
  }

  function makeCard(word) {
    const id = `ll-entry-${++serial}`;
    const article = element("article", "card");
    article.setAttribute("aria-busy", "true");
    const summary = button("summary", undefined, undefined, () => toggleCard(card));
    summary.id = `${id}-summary`;
    summary.setAttribute("aria-expanded", "false");
    summary.setAttribute("aria-controls", id);
    const wordRow = element("span", "word-row");
    const expandHint = element("span", "expand-hint", "+");
    expandHint.setAttribute("aria-hidden", "true");
    wordRow.append(element("span", "word", word), expandHint);
    const phonetic = element("span", "phonetic");
    const summaryText = element("span", "summary-text loading", "正在翻开词典");
    const meta = element("span", "summary-meta");
    const sourceLabel = element("span", "source-label", "查询中");
    const tapHint = element("span", "tap-hint", "点击展开");
    meta.append(sourceLabel, tapHint);
    summary.append(wordRow, phonetic, summaryText, meta);
    const remove = button("icon-button remove", "×", `移除 ${word}`, () => removeCard(word));
    const lookupNotice = element("div", "lookup-notice");
    lookupNotice.hidden = true;
    const fold = element("div", "fold");
    fold.id = id;
    fold.dataset.open = "false";
    fold.setAttribute("role", "region");
    fold.setAttribute("aria-labelledby", summary.id);
    fold.setAttribute("aria-hidden", "true");
    fold.inert = true;
    const clip = element("div", "fold-clip");
    const details = element("div", "details");
    clip.append(details); fold.append(clip);
    article.append(summary, lookupNotice, remove, fold);
    const card = { word, article, summary, phonetic, summaryText, sourceLabel, tapHint, expandHint, lookupNotice, fold, details, open: false, version: 0 };
    cardList.append(article);
    cards.set(word, card);
    updateCount();
    return card;
  }

  async function pronounce(word, pronunciation, node) {
    stopAudio();
    if (!node.dataset.defaultLabel) node.dataset.defaultLabel = node.textContent;
    node.textContent = node.dataset.defaultLabel;
    const audio = safeURL(pronunciation.audio);
    if (audio) {
      try {
        currentAudio = new Audio(audio);
        await currentAudio.play();
        return;
      } catch { node.textContent = "音频暂不可用，请使用系统朗读"; return; }
    }
    if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) {
      node.textContent = "此浏览器暂不支持系统朗读";
      return;
    }
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      node.textContent = "网页正在朗读，请稍后重试";
      return;
    }
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = /UK|British|英/i.test(pronunciation.label || "") ? "en-GB" : "en-US";
    utterance.rate = .85;
    currentUtterance = utterance;
    const clearUtterance = () => {
      if (currentUtterance === utterance) currentUtterance = null;
    };
    utterance.onend = clearUtterance;
    utterance.onerror = clearUtterance;
    speechSynthesis.speak(utterance);
  }

  function renderDetails(card, result) {
    card.details.replaceChildren(element("div", "divider"));
    const pronunciations = Array.isArray(result.pronunciations) ? result.pronunciations.slice(0, 4) : [];
    card.details.append(element("div", "section-label", "PRONUNCIATION · 发音"));
    const pronunciationRow = element("div", "pronunciations");
    for (const pronunciation of pronunciations) {
      const hasAudio = Boolean(safeURL(pronunciation.audio));
      const label = ["▷", text(pronunciation.label), text(pronunciation.phonetic), hasAudio ? "词典音频" : "系统朗读"].filter(Boolean).join("  ");
      const node = button("pronunciation", label, `${card.word} · ${hasAudio ? "词典音频" : "系统朗读"}`, () => pronounce(card.word, pronunciation, node));
      pronunciationRow.append(node);
    }
    if (!pronunciations.length || pronunciations.every(item => safeURL(item.audio))) {
      const system = { label: "系统朗读" };
      const node = button("pronunciation", "▷ 系统朗读", `使用系统语音朗读 ${card.word}`, () => pronounce(card.word, system, node));
      pronunciationRow.append(node);
    }
    card.details.append(pronunciationRow, element("div", "section-label", "MEANING & USAGE · 释义与用法"));
    for (const meaning of (Array.isArray(result.meanings) ? result.meanings : []).slice(0, 12)) {
      const part = text(meaning.partOfSpeech);
      card.details.append(element("div", "part-of-speech", [part, POS[part.toLowerCase()]].filter(Boolean).join(" · ")));
      const definitions = element("ol", "definitions");
      for (const definition of (Array.isArray(meaning.definitions) ? meaning.definitions : []).slice(0, 8)) {
        const item = element("li");
        item.append(element("p", "definition", text(definition.definition)));
        if (definition.translation) item.append(element("p", "translation", text(definition.translation)));
        for (const example of (Array.isArray(definition.examples) ? definition.examples : []).slice(0, 4)) {
          const exampleNode = element("blockquote", "example", text(example.text));
          if (example.translation) exampleNode.append(element("div", "example-translation", text(example.translation)));
          if (example.reference) exampleNode.append(element("cite", "source-note example-reference", text(example.reference)));
          item.append(exampleNode);
        }
        if (definition.usage) item.append(element("div", "usage", `用法 · ${text(definition.usage)}`));
        definitions.append(item);
      }
      card.details.append(definitions);
      const synonyms = (Array.isArray(meaning.synonyms) ? meaning.synonyms : []).filter(value => typeof value === "string").slice(0, 10);
      if (synonyms.length) card.details.append(element("div", "synonyms", `近义词 · ${synonyms.join(" · ")}`));
    }
    if (!(result.meanings || []).some(meaning => (meaning.definitions || []).some(def => def.examples?.length))) {
      card.details.append(element("div", "source-note", "当前词源未提供例句。"));
    }
    const entryFooter = element("div", "entry-footer");
    const href = safeURL(result.source?.url);
    if (href) {
      const link = element("a", "source-link", `${text(result.source?.name) || "词典"} · 打开来源 ↗`);
      link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer";
      entryFooter.append(link);
    }
    if (result.source?.id === "demo") entryFooter.append(element("div", "source-note", "本地示例内容，用于体验交互；非牛津或剑桥词典数据。"));
    if (result.source?.id === "free") entryFooter.append(element("div", "source-note", "Free Dictionary API · 英英释义；中文释义可选择“中文优先”或中文维基词典。"));
    if (result.source?.name) entryFooter.append(element("div", "source-note", `词条来源：${text(result.source.name)}`));
    if (result.source?.copyright) entryFooter.append(element("div", "source-note", text(result.source.copyright)));
    const licenseURL = safeURL(result.source?.license?.url);
    if (licenseURL) {
      const license = element("a", "source-link source-license", text(result.source.license.name) || "来源许可");
      license.href = licenseURL; license.target = "_blank"; license.rel = "noopener noreferrer";
      entryFooter.append(license);
    }
    for (const pronunciation of pronunciations) {
      const href = safeURL(pronunciation.attributionUrl);
      if (!href) continue;
      const link = element("a", "source-link audio-attribution", `${text(pronunciation.label) || "音频"} · 文件与许可 ↗`);
      link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer";
      entryFooter.append(link);
    }
    card.details.append(entryFooter);
  }

  function renderResult(card, result) {
    card.article.setAttribute("aria-busy", "false");
    card.lookupNotice.textContent = text(result.notice);
    card.lookupNotice.hidden = !result.notice;
    card.summaryText.classList.remove("loading");
    card.article.querySelector(".state-actions")?.remove();
    card.phonetic.textContent = text(result.phonetic) || text(result.pronunciations?.[0]?.phonetic);
    card.sourceLabel.textContent = text(result.source?.name) || "语织";
    if (result.status === "ok") {
      const first = result.meanings?.find(meaning => meaning.definitions?.length);
      const definition = first?.definitions?.[0];
      card.summaryText.textContent = [POS[text(first?.partOfSpeech).toLowerCase()] || text(first?.partOfSpeech), text(definition?.translation) || text(definition?.definition)].filter(Boolean).join(" · ") || "词条已找到，点击查看详情";
      renderDetails(card, result);
    } else {
      card.summaryText.textContent = result.status === "not-found" ? "无法找到该单词" : text(result.error?.message) || "词典暂时无法连接，请重试";
      card.details.replaceChildren(element("div", "divider"), element("p", "definition", result.status === "not-found" ? "请检查拼写，或在词典设置中切换其他来源。" : "请检查网络连接与词典设置后重试。"));
      const actions = element("div", "state-actions");
      if (result.status !== "not-found") actions.append(button("text-button", "重试", undefined, () => loadCard(card)));
      actions.append(button("text-button", "词典设置 ↗", undefined, () => { void Promise.resolve(bridge.options()).catch(() => {}); }));
      card.article.insertBefore(actions, card.fold);
    }
    requestAnimationFrame(positionPanel);
  }

  async function loadCard(card) {
    const lookupSession = session;
    const version = ++card.version;
    card.article.setAttribute("aria-busy", "true");
    card.summaryText.classList.add("loading");
    card.summaryText.textContent = "正在翻开词典";
    card.lookupNotice.hidden = true;
    try {
      const result = await bridge.lookup(card.word);
      if (lookupSession !== session || cards.get(card.word) !== card || version !== card.version) return;
      if (!result || !["ok", "not-found", "error"].includes(result.status)) throw new Error("invalid-result");
      renderResult(card, result);
    } catch {
      if (lookupSession !== session || cards.get(card.word) !== card || version !== card.version) return;
      renderResult(card, { status: "error", error: { message: "词典连接失败；如刚更新插件，请刷新网页后重试。" } });
    }
  }

  function showWords(selection, append = false) {
    if (!selection || !enabled) return;
    hideLauncher();
    if (!append || !panel) { closePanel(); makePanel(); }
    anchor = selection.rect;
    anchorRange = selection.range;
    anchorSide = null;
    let truncated = Boolean(selection.truncated);
    for (const word of selection.words) {
      if (cards.has(word)) continue;
      if (cards.size >= (core.MAX_WORDS || 8)) { truncated = true; break; }
      const card = makeCard(word);
      void loadCard(card);
    }
    setFooter(truncated ? `一次最多查看 ${core.MAX_WORDS || 8} 个不同单词。` : undefined);
    positionPanel();
  }

  function showLauncher(selection) {
    ensureHost();
    hideLauncher();
    launcherSnapshot = selection;
    launcher = button("launcher", undefined, `查找选中的 ${selection.words.length} 个单词`, async () => {
      const selected = launcherSnapshot;
      const selectionSession = session;
      await refreshSettings();
      if (enabled && selectionSession === session) showWords(selected);
    });
    launcher.append(element("span", "launcher-brand", "L"), element("span", "", `查 ${selection.words.length} 词`), element("span", "", "↗"));
    launcher.addEventListener("pointerdown", event => { event.preventDefault(); event.stopPropagation(); });
    shadow.append(launcher);
    const size = launcher.getBoundingClientRect();
    const viewport = bounds();
    launcher.style.left = `${clamp(selection.rect.right - size.width, 12, viewport.width - size.width - 12)}px`;
    const top = selection.rect.bottom + 7;
    launcher.style.top = `${clamp(top + size.height > viewport.height - 12 ? selection.rect.top - size.height - 7 : top, 12, viewport.height - size.height - 12)}px`;
  }

  document.addEventListener("dblclick", async event => {
    if (!event.isTrusted && !preview) return;
    if (isInternal(event) || isEditable(event)) return;
    clearTimeout(selectionTimer);
    hideLauncher();
    const selection = snapshot();
    const selectionSession = session;
    await refreshSettings();
    if (!selection || !enabled || selectionSession !== session) return;
    showWords(selection, event.ctrlKey || event.metaKey);
  }, true);

  document.addEventListener("mouseup", event => {
    if ((!event.isTrusted && !preview) || isInternal(event) || isEditable(event) || event.button !== 0) return;
    clearTimeout(selectionTimer);
    const selection = snapshot();
    if (!selection) { hideLauncher(); return; }
    const selectionSession = session;
    selectionTimer = setTimeout(async () => {
      await refreshSettings();
      if (enabled && selectionSession === session && !window.getSelection()?.isCollapsed) showLauncher(selection);
    }, 220);
  }, true);

  document.addEventListener("pointerdown", event => {
    if (isInternal(event)) return;
    hideLauncher();
    // Keeping the current chain here lets Ctrl/Command + double-click append a new word.
    if (!(event.ctrlKey || event.metaKey)) closePanel();
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && (panel || launcher)) { closePanel(true); event.preventDefault(); }
  }, true);
  window.addEventListener("resize", () => { hideLauncher(); positionPanel(); }, { passive: true });
  window.addEventListener("scroll", () => { hideLauncher(); positionPanel(); }, { passive: true, capture: true });
  if (runtime?.id && chrome.storage?.onChanged) chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) {
      settingsVersion += 1;
      enabled = changes.settings.newValue?.enabled !== false;
      if (!enabled) closePanel();
    }
  });
})();
