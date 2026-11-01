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

  const i18n = globalThis.LexiLoomI18n;
  const present = globalThis.LexiLoomPresent;
  const t = (key, substitutions) => i18n?.t(key, substitutions) || "";
  const englishUi = () => i18n?.locale() === "en";
  const errorText = result => {
    const code = result?.error?.code;
    const localized = code ? t(`error_${String(code).replaceAll("-", "_")}`) : "";
    if (localized) return localized;
    const message = text(result?.error?.message);
    if (englishUi() && present?.hasCjk(message)) return t("error_generic");
    return message || t("error_generic");
  };
  const noticeText = result => {
    if (result?.noticeKey) {
      const localized = t(result.noticeKey);
      if (localized) return localized;
    }
    return text(result?.notice);
  };
  const sourceName = source => t(`source_${String(source?.id || '').replaceAll('-', '_')}`) || text(source?.name) || t("brandFallback");
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
    await i18n?.ready;
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
    const parsed = core.parseSelection(selection.toString(), i18n?.languageTag() || 'zh-CN');
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
    const help = element("span", "", t("footerHelp"));
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
    panel.setAttribute("aria-label", t("cardAria"));
    const toolbar = element("header", "toolbar");
    const brand = element("div", "brand");
    brand.append(element("span", "brand-mark", "L"));
    const brandName = element("span", "brand-name", "LexiLoom");
    if (!englishUi()) brandName.append(element("span", "brand-cn", t("brandCn")));
    brand.append(brandName);
    count = element("span", "count");
    const close = button("icon-button", "×", t("closeLookup"), () => closePanel(true));
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
    card.tapHint.textContent = card.open ? t("tapCollapse") : t("tapExpand");
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
    const wordLabel = element("span", "word", word);
    wordRow.append(wordLabel, expandHint);
    const phonetic = element("span", "phonetic");
    const summaryText = element("span", "summary-text loading", t("loading"));
    const meta = element("span", "summary-meta");
    const sourceLabel = element("span", "source-label", t("querying"));
    const tapHint = element("span", "tap-hint", t("tapExpand"));
    meta.append(sourceLabel, tapHint);
    summary.append(wordRow, phonetic, summaryText, meta);
    const remove = button("icon-button remove", "×", t("removeWord", [word]), () => removeCard(word));
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
    const card = { word, wordLabel, article, summary, phonetic, summaryText, sourceLabel, tapHint, expandHint, lookupNotice, fold, details, open: false, version: 0 };
    cardList.append(article);
    cards.set(word, card);
    updateCount();
    return card;
  }

  function speechLocale(pronunciation, view) {
    try { return Intl.getCanonicalLocales(pronunciation.locale || view.speechFallbackLocale)[0]; }
    catch { return view.speechFallbackLocale || 'en-US'; }
  }

  async function pronounce(word, pronunciation, node, view) {
    stopAudio();
    if (!node.dataset.defaultLabel) node.dataset.defaultLabel = node.textContent;
    node.textContent = node.dataset.defaultLabel;
    const audio = safeURL(pronunciation.audio);
    if (audio) {
      try {
        currentAudio = new Audio(audio);
        await currentAudio.play();
        return;
      } catch { node.textContent = t("audioUnavailable"); return; }
    }
    if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) {
      node.textContent = t("speechUnsupported");
      return;
    }
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      node.textContent = t("speechBusy");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = speechLocale(pronunciation, view);
    utterance.rate = .85;
    currentUtterance = utterance;
    const clearUtterance = () => {
      if (currentUtterance === utterance) currentUtterance = null;
    };
    utterance.onend = clearUtterance;
    utterance.onerror = clearUtterance;
    speechSynthesis.speak(utterance);
  }

  function renderDetails(card, view) {
    const result = view.entry;
    card.details.replaceChildren(element("div", "divider"));
    const pronunciations = Array.isArray(result.pronunciations) ? result.pronunciations.slice(0, 4) : [];
    card.details.append(element("div", "section-label", t("sectionPronunciation")));
    const pronunciationRow = element("div", "pronunciations");
    for (const pronunciation of pronunciations) {
      const hasAudio = Boolean(safeURL(pronunciation.audio));
      const audioLabel = hasAudio ? t("audioDictionary") : t("audioSystem");
      const label = ["▷", text(pronunciation.label), text(pronunciation.phonetic), audioLabel].filter(Boolean).join("  ");
      const node = button("pronunciation", label, `${card.word} · ${audioLabel}`, () => pronounce(result.displayWord || card.word, pronunciation, node, view));
      node.lang = speechLocale(pronunciation, view);
      pronunciationRow.append(node);
    }
    if (!pronunciations.length || pronunciations.every(item => safeURL(item.audio))) {
      const system = { label: t("audioSystem") };
      const node = button("pronunciation", `▷ ${t("audioSystem")}`, t("audioSystem"), () => pronounce(result.displayWord || card.word, system, node, view));
      node.lang = speechLocale(system, view);
      pronunciationRow.append(node);
    }
    card.details.append(pronunciationRow, element("div", "section-label", t("sectionMeaning")));
    let examplesShown = 0;
    let meaningLanguage;
    for (const meaning of (Array.isArray(result.meanings) ? result.meanings : []).slice(0, 12)) {
      if (view.showMeaningHeadings && meaning.language && meaning.language !== meaningLanguage) {
        card.details.append(element('div', 'section-label meaning-heading', t(view.headingKeys[meaning.language]) || text(meaning.heading) || meaning.language));
        meaningLanguage = meaning.language;
      }
      const part = text(meaning.partOfSpeech);
      const gloss = t(`pos_${part.toLowerCase()}`);
      if (part || gloss) card.details.append(element("div", "part-of-speech", [...new Set([part, gloss].filter(Boolean))].join(" · ")));
      const definitions = element("ol", "definitions");
      for (const definition of (Array.isArray(meaning.definitions) ? meaning.definitions : []).slice(0, 8)) {
        const item = element("li");
        item.append(element("p", "definition", text(definition.definition)));
        if (view.showTranslations && definition.translation) item.append(element("p", "translation", text(definition.translation)));
        for (const example of (Array.isArray(definition.examples) ? definition.examples : []).slice(0, 4)) {
          if (examplesShown >= view.maxExamples) break;
          const exampleNode = element("blockquote", "example", text(example.text));
          if (view.showTranslations && example.translation) exampleNode.append(element("div", "example-translation", text(example.translation)));
          if (view.showReferences && example.reference) exampleNode.append(element("cite", "source-note example-reference", text(example.reference)));
          item.append(exampleNode);
          examplesShown++;
        }
        if (view.showUsage && definition.usage) item.append(element("div", "usage", t("usagePrefix", [text(definition.usage)])));
        definitions.append(item);
      }
      card.details.append(definitions);
      const synonyms = view.showSynonyms ? (Array.isArray(meaning.synonyms) ? meaning.synonyms : []).filter(value => typeof value === "string").slice(0, 10) : [];
      if (synonyms.length) card.details.append(element("div", "synonyms", t("synonymsPrefix", [synonyms.join(" · ")])));
    }
    if (result.noticeKey === "noticeNoEnglish") card.details.append(element("p", "definition", t("noticeNoEnglish")));
    if (!(result.meanings || []).some(meaning => (meaning.definitions || []).some(def => def.examples?.length))) {
      card.details.append(element("div", "source-note", t("noExamples")));
    }
    const entryFooter = element("div", "entry-footer");
    const href = safeURL(result.source?.url);
    const name = sourceName(result.source);
    if (href) {
      const link = element("a", "source-link", t("openSource", [name]));
      link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer";
      entryFooter.append(link);
    }
    if (result.source?.id === "demo") entryFooter.append(element("div", "source-note", t("sourceDemoNote")));
    if (result.source?.id === "free") entryFooter.append(element("div", "source-note", t("sourceFreeNote")));
    if (name) entryFooter.append(element("div", "source-note", t("sourceLine", [name])));
    const copyright = text(result.source?.copyright);
    if (copyright) entryFooter.append(element("div", "source-note copyright", copyright));
    const licenseURL = safeURL(result.source?.license?.url);
    if (licenseURL) {
      const license = element("a", "source-link source-license", text(result.source.license.name) || t("sourceLicense"));
      license.href = licenseURL; license.target = "_blank"; license.rel = "noopener noreferrer";
      entryFooter.append(license);
    }
    for (const component of (Array.isArray(result.source?.components) ? result.source.components : []).slice(0, 6)) {
      const href = safeURL(component.url);
      if (!href || href === safeURL(result.source?.url)) continue;
      const link = element('a', 'source-link source-component', text(component.name));
      link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      entryFooter.append(link);
      if (component.copyright) entryFooter.append(element('div', 'source-note', text(component.copyright)));
      const licenseHref = safeURL(component.license?.url);
      if (licenseHref) {
        const license = element('a', 'source-link source-license', text(component.license.name) || t('sourceLicense'));
        license.href = licenseHref; license.target = '_blank'; license.rel = 'noopener noreferrer';
        entryFooter.append(license);
      }
    }
    for (const pronunciation of pronunciations) {
      const href = safeURL(pronunciation.attributionUrl);
      if (!href) continue;
      const link = element("a", "source-link audio-attribution", t("audioLicense", [text(pronunciation.label) || t("audioFallback")]));
      link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer";
      entryFooter.append(link);
    }
    card.details.append(entryFooter);
  }

  function renderResult(card, raw) {
    const view = present.createCardView({ word: card.word, ...raw }, i18n?.languageTag() || 'zh-CN');
    const result = view.entry;
    card.wordLabel.textContent = text(result.displayWord) || card.word;
    card.article.setAttribute("aria-busy", "false");
    const notice = noticeText(result);
    card.lookupNotice.textContent = notice;
    card.lookupNotice.hidden = !notice;
    card.summaryText.classList.remove("loading");
    card.article.querySelector(".state-actions")?.remove();
    card.phonetic.textContent = text(result.phonetic) || text(result.pronunciations?.[0]?.phonetic);
    card.sourceLabel.textContent = sourceName(result.source);
    if (result.status === "ok") {
      const part = text(view.partOfSpeech);
      const summary = view.summary ? [t(`pos_${part.toLowerCase()}`) || part, view.summary].filter(Boolean).join(' · ') : '';
      card.summaryText.textContent = summary || (result.noticeKey === "noticeNoEnglish" ? t("noticeNoEnglish") : t("foundPrompt"));
      renderDetails(card, view);
    } else {
      card.summaryText.textContent = result.status === "not-found" ? t(view.notFoundKey) : errorText(result);
      card.details.replaceChildren(element("div", "divider"), element("p", "definition", result.status === "not-found" ? t("notFoundHint") : t("errorRetryHint")));
      const actions = element("div", "state-actions");
      if (result.status !== "not-found") actions.append(button("text-button", t("retry"), undefined, () => loadCard(card)));
      actions.append(button("text-button", t("openSettings"), undefined, () => { void Promise.resolve(bridge.options()).catch(() => {}); }));
      card.article.insertBefore(actions, card.fold);
    }
    requestAnimationFrame(positionPanel);
  }

  async function loadCard(card) {
    await i18n?.ready;
    const lookupSession = session;
    const version = ++card.version;
    card.article.setAttribute("aria-busy", "true");
    card.summaryText.classList.add("loading");
    card.summaryText.textContent = t("loading");
    card.lookupNotice.hidden = true;
    try {
      const result = await bridge.lookup(card.word);
      if (lookupSession !== session || cards.get(card.word) !== card || version !== card.version) return;
      if (!result || !["ok", "not-found", "error"].includes(result.status)) throw new Error("invalid-result");
      renderResult(card, result);
    } catch {
      if (lookupSession !== session || cards.get(card.word) !== card || version !== card.version) return;
      renderResult(card, { status: "error", error: { code: "connection_failed", message: "词典连接失败；如刚更新插件，请刷新网页后重试。" } });
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
    setFooter(truncated ? t("maxWords", [String(core.MAX_WORDS || 8)]) : undefined);
    positionPanel();
  }

  function showLauncher(selection) {
    ensureHost();
    hideLauncher();
    launcherSnapshot = selection;
    launcher = button("launcher", undefined, t("lookupCount", [String(selection.words.length)]), async () => {
      const selected = launcherSnapshot;
      const selectionSession = session;
      await refreshSettings();
      if (enabled && selectionSession === session) showWords(selected);
    });
    launcher.append(element("span", "launcher-brand", "L"), element("span", "", t("launcherCount", [String(selection.words.length)])), element("span", "", "↗"));
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
