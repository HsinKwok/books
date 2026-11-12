// 给 textarea[data-markdown] 加一条轻量工具条（不做实时预览）
const ACTIONS = [
  { label: 'B', title: '粗体', className: 'md-btn md-btn-bold', run: (el) => surround(el, '**', '**', '粗体') },
  { label: 'I', title: '斜体', className: 'md-btn md-btn-italic', run: (el) => surround(el, '*', '*', '斜体') },
  { label: '‹›', title: '行内代码', className: 'md-btn', run: (el) => surround(el, '`', '`', '代码') },
  { label: '链接', title: '链接', className: 'md-btn', run: link },
  { label: '引用', title: '引用', className: 'md-btn', run: (el) => prefixLines(el, '> ') },
  { label: '列表', title: '无序列表', className: 'md-btn', run: (el) => prefixLines(el, '- ') },
  { label: '1.', title: '有序列表', className: 'md-btn', run: (el) => prefixLines(el, '1. ') },
];

function emit(el) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function surround(el, before, after, placeholder) {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const text = el.value.slice(start, end) || placeholder;
  el.setRangeText(before + text + after, start, end, 'end');
  el.selectionStart = start + before.length;
  el.selectionEnd = start + before.length + text.length;
  el.focus();
  emit(el);
}

function prefixLines(el, prefix) {
  const start = el.value.lastIndexOf('\n', el.selectionStart - 1) + 1;
  let end = el.value.indexOf('\n', el.selectionEnd);
  if (end === -1) end = el.value.length;
  const block = el.value.slice(start, end);
  const next = (block || '')
    .split('\n')
    .map((line, i) => (prefix === '1. ' ? `${i + 1}. ` : prefix) + line)
    .join('\n');
  el.setRangeText(next, start, end, 'select');
  el.focus();
  emit(el);
}

function link(el) {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const text = el.value.slice(start, end) || '链接文字';
  el.setRangeText(`[${text}](https://)`, start, end, 'end');
  const urlStart = start + text.length + 3;
  el.selectionStart = urlStart;
  el.selectionEnd = urlStart + 8;
  el.focus();
  emit(el);
}

function build(el) {
  const bar = document.createElement('div');
  bar.className = 'md-toolbar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Markdown 工具条');

  ACTIONS.forEach((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = action.className;
    button.textContent = action.label;
    button.title = action.title;
    button.setAttribute('aria-label', action.title);
    button.tabIndex = -1;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => action.run(el));
    bar.appendChild(button);
  });

  el.parentNode.insertBefore(bar, el);
}

export function initMarkdownEditors(root) {
  (root || document).querySelectorAll('textarea[data-markdown]').forEach((el) => {
    if (el.dataset.mdReady === '1') return;
    el.dataset.mdReady = '1';
    build(el);
  });
}

initMarkdownEditors(document);
