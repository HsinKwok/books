// 目录按需加载：书页按卷展开、章节页抽屉共用同一份 /api/toc 结果
import { $, $$, readJSON } from './core.js';

const cache = new Map();

/** 与服务端 formatWords 保持一致的字数文案 */
export function formatWords(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万字`;
  return `${n.toLocaleString('en-US')} 字`;
}

/** 按 slug 取目录索引（不含正文）；带卷号时只取该卷，同一页面内按 slug+卷复用请求 */
export function loadToc(slug, volume) {
  if (!slug) return Promise.resolve(null);
  const key = volume ? `${slug}:${volume}` : slug;
  if (!cache.has(key)) {
    const url = volume
      ? `/api/toc/${encodeURIComponent(slug)}?v=${encodeURIComponent(volume)}`
      : `/api/toc/${encodeURIComponent(slug)}`;
    cache.set(
      key,
      fetch(url)
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    );
  }
  return cache.get(key);
}

/** 章节页抽屉里的一行 */
export function tocPanelItem(slug, ch, current) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = `/b/${slug}/${ch.i}`;
  a.dataset.book = slug;
  a.dataset.idx = String(ch.i);
  if (ch.i === current) a.className = 'is-current';

  const no = document.createElement('i');
  no.textContent = String(ch.n).padStart(2, '0');
  const title = document.createElement('span');
  title.textContent = ch.t;
  const meta = document.createElement('em');
  meta.className = 'toc-panel-state';
  meta.textContent = `${ch.w} 字`;

  a.append(no, title, meta);
  li.append(a);
  return li;
}

/** 书页目录里的一行，与服务端 renderRow 的结构保持一致 */
export function tocBookRow(slug, ch) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.className = 'toc-row';
  a.href = `/b/${slug}/${ch.i}`;
  a.dataset.book = slug;
  a.dataset.idx = String(ch.i);

  const no = document.createElement('span');
  no.className = 'row-num';
  no.textContent = String(ch.n).padStart(2, '0');
  const title = document.createElement('span');
  title.className = 'toc-title';
  title.textContent = ch.t;
  const meta = document.createElement('span');
  meta.className = 'toc-meta';
  meta.textContent = formatWords(ch.w);
  const state = document.createElement('em');
  state.className = 'toc-state js-toc-state';
  state.textContent = '未读';
  meta.append(state);

  a.append(no, title, meta);
  li.append(a);
  return li;
}

/** 按本地阅读记录给目录行标「已读 / 读到此处」 */
export function markTocRows(root = document) {
  const rows = $$('.toc-row', root);
  if (!rows.length) return;

  const done = readJSON('read.done', []);
  const progress = readJSON('read.progress', null);
  rows.forEach((row) => {
    const key = `${row.dataset.book}:${row.dataset.idx}`;
    const state = $('.js-toc-state', row);
    if (!state) return;
    if (done.includes(key)) {
      state.textContent = '已读';
      state.classList.add('is-read');
    } else if (progress && key === `${progress.slug}:${progress.idx}`) {
      state.textContent = '读到此处';
      state.classList.add('is-current');
    }
  });
}
