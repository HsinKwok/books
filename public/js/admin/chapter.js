// 章节编辑：实时预览与字数
import { debounce, fmtNum } from '../core.js';
import { renderMarkdown } from '../markdown.js';

const editor = document.querySelector('#chapter-body');
const preview = document.querySelector('#chapter-preview');
const counter = document.querySelector('#chapter-counter');

if (editor && preview && counter) {
  const render = () => {
    const raw = editor.value;
    preview.innerHTML = renderMarkdown(raw);
    counter.textContent = `${fmtNum(raw.replace(/\s/g, '').length)} 字`;
  };

  editor.addEventListener('input', debounce(render, 120));
  render();
}
