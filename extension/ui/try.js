'use strict';
if (globalThis.LexiLoomI18n?.locale() === 'en') document.querySelector('.brand-cn')?.remove();
function selectAndLookup(node) {
  const range = document.createRange(); range.selectNodeContents(node);
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  const rect = node.getBoundingClientRect();
  node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: rect.left + 8, clientY: rect.bottom - 3, detail: 2 }));
}
document.querySelector('#show-single').addEventListener('click', () => selectAndLookup(document.querySelector('#sample-serendipity')));
document.querySelector('#show-multi').addEventListener('click', () => selectAndLookup(document.querySelector('#multi-sample')));
document.querySelector('#show-chinese').addEventListener('click', () => selectAndLookup(document.querySelector('#chinese-sample')));
document.querySelector('#show-missing').addEventListener('click', () => {
  const node = document.querySelector('#demo-hint');
  node.textContent = 'qzxqzxqz'; selectAndLookup(node);
});
