/* Shared as a classic script so the content script works without a build step. */
globalThis.LexiLoomTheme = `
  :host {
    all: initial;
    color-scheme: light;
    --ll-ink: #243c35;
    --ll-green: #244d43;
    --ll-muted: #77817a;
    --ll-paper: #faf8f3;
    --ll-line: #e6e8de;
    --ll-orange: #b97045;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: var(--ll-ink);
  }
  *, *::before, *::after { box-sizing: border-box; }
  button, a { -webkit-tap-highlight-color: transparent; }
  button { font: inherit; color: inherit; cursor: pointer; }
  button:focus-visible, a:focus-visible, [tabindex]:focus-visible {
    outline: 2px solid var(--ll-orange); outline-offset: 3px;
  }
  button:disabled { cursor: wait; opacity: .6; }
  .panel {
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: var(--ll-ink);
    color-scheme: light;
    position: fixed;
    display: flex; flex-direction: column;
    width: min(var(--ll-width, 312px), calc(100vw - 24px));
    max-height: calc(100vh - 24px);
    border: 1px solid rgba(36, 77, 67, .16);
    border-radius: 18px;
    background: var(--ll-paper);
    box-shadow: 0 14px 52px rgba(24, 43, 34, .17), 0 3px 10px rgba(24, 43, 34, .06);
    pointer-events: auto;
    transition: width 280ms linear;
    overflow: hidden;
    animation: ll-appear 140ms ease-out;
    text-align: left;
    -webkit-font-smoothing: antialiased;
  }
  .panel:focus { outline: none; }
  .toolbar {
    display: flex; align-items: center; gap: 8px;
    padding: 13px 14px 11px 16px;
    border-bottom: 1px solid var(--ll-line);
    flex-shrink: 0;
  }
  .brand { display: flex; gap: 8px; align-items: center; min-width: 0; flex: 1; }
  .brand-mark {
    width: 22px; height: 25px; display: grid; place-items: center;
    background: var(--ll-green); color: #fff; border-radius: 7px 7px 9px 3px;
    font: italic 19px/1 Georgia, "Times New Roman", serif;
  }
  .brand-name { font: 600 15px/1.2 Georgia, "Times New Roman", serif; letter-spacing: -.25px; }
  .brand-cn { color: var(--ll-muted); font-size: 10px; margin-left: 6px; letter-spacing: 1px; }
  .count { color: var(--ll-muted); font-size: 11px; white-space: nowrap; }
  .icon-button {
    display: grid; place-items: center; width: 27px; height: 27px;
    border: 0; border-radius: 50%; background: transparent; color: #76847a;
    line-height: 1; font-size: 20px; padding: 0; flex-shrink: 0;
  }
  .icon-button:hover { background: #e9eee5; color: var(--ll-green); }
  .cards { padding: 12px; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; }
  .card { position: relative; border: 1px solid #e5e7dc; border-radius: 11px; background: #fffefa; }
  .card + .card { margin-top: 13px; }
  .card + .card::before {
    content: ""; position: absolute; height: 15px; width: 1px; background: #b6c7b7; top: -15px; left: 21px;
  }
  .summary {
    display: block; padding: 15px 16px 14px; width: 100%; background: transparent; border: 0;
    border-radius: 10px; text-align: left; position: relative;
  }
  .summary:hover { background: #f3f5ee; }
  .word-row { display: flex; align-items: baseline; gap: 10px; padding-right: 25px; }
  .word { display: block; font: 500 27px/1.15 Georgia, "Times New Roman", serif; letter-spacing: -.6px; overflow-wrap: anywhere; }
  .expand-hint { color: #849286; font-size: 18px; line-height: 1; margin-left: auto; }
  .phonetic { display: block; margin-top: 5px; color: #586f61; font-size: 13px; }
  .summary-text {
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; font-size: 13px; line-height: 1.65; margin-top: 9px; color: #526258;
  }
  .summary-meta { display: flex; gap: 7px; align-items: center; margin-top: 10px; font-size: 10px; color: #889186; }
  .source-label { padding: 2px 6px; background: #edf1e8; color: #62715e; border-radius: 4px; }
  .tap-hint { margin-left: auto; color: var(--ll-orange); }
  .remove { position: absolute; right: 9px; top: 9px; z-index: 1; width: 22px; height: 22px; font-size: 16px; }
  .fold { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 280ms linear; }
  .fold[data-open="true"] { grid-template-rows: 1fr; }
  .fold-clip { overflow: hidden; min-height: 0; }
  .details { padding: 2px 16px 16px; }
  .divider { height: 1px; background: var(--ll-line); margin-bottom: 15px; }
  .section-label { font-size: 10px; letter-spacing: 1.4px; color: #8a9388; margin-bottom: 8px; }
  .pronunciations { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 18px; }
  .pronunciation {
    border: 1px solid #dce4d7; background: #f3f6ee; padding: 5px 9px; border-radius: 6px;
    font-size: 11px; color: var(--ll-green); line-height: 1.6; text-align: left;
  }
  .pronunciation:hover { background: #e8efdf; }
  .part-of-speech { font-size: 11px; font-style: italic; color: var(--ll-orange); margin: 14px 0 8px; }
  .definitions { margin: 0; padding-left: 19px; }
  .definitions > li { padding-left: 3px; margin: 0 0 14px; color: #526258; }
  .definitions > li::marker { font-size: 11px; color: #98a18e; }
  .definition { font-size: 13px; line-height: 1.7; margin: 0; overflow-wrap: anywhere; }
  .translation { color: var(--ll-ink); font-size: 13px; margin: 3px 0 0; line-height: 1.7; }
  .example {
    border-left: 2px solid #d6dfcb; padding: 5px 0 5px 10px;
    color: #6b786d; font: italic 14px/1.7 Georgia, "Times New Roman", serif; margin: 9px 0 0;
  }
  .example-translation { font: normal 12px/1.7 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; color: #8a9386; margin-top: 3px; }
  .usage { font-size: 12px; color: #75826f; margin-top: 8px; line-height: 1.7; }
  .synonyms { color: #75826f; font-size: 11px; line-height: 1.7; margin-top: 10px; }
  .entry-footer { border-top: 1px dashed var(--ll-line); padding-top: 11px; margin-top: 14px; }
  .source-link { color: var(--ll-green); font-size: 11px; text-decoration: none; }
  .source-link:hover { text-decoration: underline; }
  .source-note { color: #657460; font-size: 11px; line-height: 1.6; margin-top: 5px; }
  .lookup-notice { padding: 0 16px 12px; color: #9b693d; font-size: 11px; line-height: 1.7; }
  .example-reference { display: block; font-style: normal; }
  .source-license, .audio-attribution { display: block; margin-top: 6px; }
  .source-component { display: block; margin-top: 9px; }
  .meaning-heading { margin-top: 16px; }
  .state-actions { display: flex; padding: 0 16px 13px; gap: 9px; }
  .text-button { border: 0; padding: 0; background: transparent; font-size: 12px; color: var(--ll-green); text-decoration: underline; text-underline-offset: 3px; }
  .footer { padding: 9px 15px 11px; border-top: 1px solid var(--ll-line); color: #687568; font-size: 11px; line-height: 1.6; flex-shrink: 0; }
  .footer span { display: block; }
  .notice { color: var(--ll-orange); }
  .launcher {
    position: fixed; pointer-events: auto; display: flex; align-items: center; gap: 8px;
    white-space: nowrap; background: var(--ll-green); color: #fffdf5; border: 1px solid #42665a;
    border-radius: 9px; padding: 7px 12px; box-shadow: 0 4px 15px rgba(28, 56, 40, .2);
    font: 12px/1.4 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    animation: ll-appear 100ms ease-out;
  }
  .launcher:hover { background: #1c4036; }
  .launcher-brand { font: italic 17px/1 Georgia, "Times New Roman", serif; opacity: .75; }
  .loading::after { content: ""; display: inline-block; width: 5px; height: 5px; margin-left: 8px; border-radius: 50%; background: #b6c3a8; animation: ll-breathe 800ms alternate infinite; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @keyframes ll-appear { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes ll-breathe { from { opacity: .3; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition: none !important; animation: none !important; }
  }
`;
