// TXT 导入：读文件时自动识别编码，预览与入库走 AJAX，避免整本书在页面里来回传
import { $, api, fmtNum, mk } from '../core.js';

const form = $('#import-form');
const fileInput = $('#import-file');
const rawInput = $('#import-raw');
const encodingSelect = $('#import-encoding');
const encodingHint = $('#import-encoding-hint');

const LABELS = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
  gb18030: 'GBK / GB2312（ANSI）',
  big5: 'Big5',
  shift_jis: 'Shift_JIS',
  'windows-1252': 'Windows-1252',
};

let loadedBytes = null;

function decode(bytes, encoding, fatal = false) {
  return new TextDecoder(encoding, { fatal }).decode(bytes);
}

function supports(encoding) {
  try {
    new TextDecoder(encoding);
    return true;
  } catch {
    return false;
  }
}

function detectEncoding(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';

  // 无 BOM：能按 UTF-8 严格解码就认为是 UTF-8，否则按中文最常见的 GB18030（兼容 GBK/GB2312）处理
  try {
    decode(bytes, 'utf-8', true);
    return 'utf-8';
  } catch {
    return supports('gb18030') ? 'gb18030' : 'utf-8';
  }
}

function apply(bytes) {
  if (!bytes) return;
  const choice = encodingSelect ? encodingSelect.value : 'auto';
  let encoding = choice === 'auto' ? detectEncoding(bytes) : choice;

  let text = '';
  try {
    text = decode(bytes, encoding);
  } catch {
    // 指定的编码解不了，退回自动识别
    const fallback = detectEncoding(bytes);
    try {
      text = decode(bytes, fallback);
      encoding = fallback;
    } catch {
      text = decode(bytes, 'utf-8');
    }
  }

  rawInput.value = text.replace(/^\uFEFF/, '');
  rawInput.focus();

  if (encodingHint) {
    const garbled = rawInput.value.includes('\uFFFD');
    encodingHint.textContent = garbled
      ? '无法自动识别编码，建议把文件另存为 UTF-8 后重新选择'
      : `已按 ${LABELS[encoding] || encoding} 解码`;
    encodingHint.hidden = false;
  }
}

if (fileInput && rawInput) {
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    loadedBytes = new Uint8Array(await file.arrayBuffer());
    apply(loadedBytes);
  });
}

if (encodingSelect && rawInput) {
  encodingSelect.addEventListener('change', () => apply(loadedBytes));
}

/* ---------- AJAX 预览与入库 ---------- */

function showError(message) {
  let el = $('#import-error');
  if (!el) {
    el = mk('p', 'form-error');
    el.id = 'import-error';
    form.before(el);
  }
  el.textContent = message;
  el.hidden = false;
}

function clearError() {
  const el = $('#import-error');
  if (el) el.hidden = true;
}

function chapterRow(no, chapter) {
  const tr = mk('tr');
  tr.append(
    mk('td', 'admin-num', String(no)),
    mk('td', 'admin-cell-title', chapter.title),
    mk('td', 'admin-num', fmtNum(chapter.words)),
    mk('td', 'admin-cell-sub', `${chapter.head}…`),
  );
  return tr;
}

function volumeRow(text) {
  const tr = mk('tr', 'admin-volume-row');
  const td = mk('td', '', text);
  td.colSpan = 4;
  tr.append(td);
  return tr;
}

function renderPreview(data) {
  $('#import-preview')?.remove();

  const section = mk('section', 'admin-panel');
  section.id = 'import-preview';

  const head = mk('div', 'admin-panel-head');
  head.append(
    mk('h2', '', `章节预览 · ${data.totalChapters} 章 / ${fmtNum(data.totalWords)} 字`),
  );
  section.append(head);

  if (data.note) section.append(mk('p', 'admin-hint', data.note));

  const table = mk('table', 'admin-table');
  const thead = mk('thead');
  const headRow = mk('tr');
  ['#', '章节标题', '字数', '开头'].forEach((label) => headRow.append(mk('th', '', label)));
  thead.append(headRow);
  table.append(thead);

  const tbody = mk('tbody');
  let cursor = Number(new FormData(form).get('startIdx')) || 1;

  data.volumes.forEach((volume) => {
    tbody.append(volumeRow(`${volume.title || '未命名卷'} · ${volume.chapters.length} 章`));
    volume.chapters.forEach((chapter) => tbody.append(chapterRow(cursor++, chapter)));
  });
  if (data.chapters.length) {
    if (data.volumes.length) {
      tbody.append(volumeRow(`未分卷 · ${data.chapters.length} 章`));
    }
    data.chapters.forEach((chapter) => tbody.append(chapterRow(cursor++, chapter)));
  }
  table.append(tbody);
  section.append(table);

  const foot = mk('div', 'admin-form-foot');
  const commit = mk('button', 'btn', `确认导入 ${data.totalChapters} 章`);
  commit.type = 'button';
  commit.addEventListener('click', () => commitImport(commit, data.totalChapters));
  const back = mk('a', 'admin-mini', '重新选择');
  back.href = '#import-form';
  back.addEventListener('click', () => {
    section.remove();
    rawInput.focus();
  });
  foot.append(commit, ' ', back);
  section.append(foot);

  form.closest('.admin-panel').after(section);
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function post(path) {
  return api(`${form.action}${path}`, { method: 'POST', body: new FormData(form) });
}

async function commitImport(button, totalChapters) {
  clearError();
  // 替换模式会先清空已有章节和卷，属于不可恢复的删除，必须先确认
  if (String(new FormData(form).get('mode')) === 'replace') {
    const tip = `确定清空本书已有的全部章节和卷，再导入 ${totalChapters} 章？旧章节的讨论和阅读进度会一并清除，无法恢复。`;
    if (!window.confirm(tip)) return;
  }
  button.disabled = true;
  const label = button.textContent;
  button.textContent = '正在导入…';
  try {
    const data = await post('/commit');
    location.href = data.redirect;
  } catch (error) {
    button.disabled = false;
    button.textContent = label;
    showError(error.message);
  }
}

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    const button = form.querySelector('button[type="submit"]');
    const label = button.textContent;
    button.disabled = true;
    button.textContent = '正在解析…';
    try {
      renderPreview(await post('/preview'));
    } catch (error) {
      showError(error.message);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  });
}
