// 本地阅读进度相关：目录已读态、续读卡片、页脚统计。
// 只有页面里存在对应元素时才被 base.js 动态加载。
import { $, $$, fmtNum, readJSON } from './core.js';
import { markTocRows } from './toc.js';

/* ---------- 目录已读态 ---------- */
markTocRows();

/* ---------- 续读卡片 ---------- */
const resume = $('#resume');
if (resume) {
  const progress = readJSON('read.progress', null);
  if (progress) {
    $('#resume-link').setAttribute('href', `/b/${progress.slug}/${progress.idx}`);
    $('#resume-book').textContent = progress.bookTitle || progress.slug;
    $('#resume-chapter').textContent = `第 ${progress.idx} 章 · ${progress.chapterTitle || ''}`;
    resume.hidden = false;
  }
}

/* ---------- 页脚统计 ---------- */
const doneKeys = readJSON('read.done', []);
const readTotalEls = $$('.js-read-total');
const readWordEls = $$('.js-read-words');

readTotalEls.forEach((el) => {
  el.textContent = String(doneKeys.length);
});

// 字数按书按需拉：只请求读过的书，不把整站章节表拖下来
if (doneKeys.length && readWordEls.length) {
  const slugs = [...new Set(doneKeys.map((key) => String(key).split(':')[0]))];
  fetch(`/api/words?slugs=${encodeURIComponent(slugs.join(','))}`)
    .then((res) => (res.ok ? res.json() : {}))
    .then((wordsByChapter) => {
      const readWords = doneKeys.reduce((n, key) => {
        const [slug, idx] = String(key).split(':');
        const chapterMap = wordsByChapter[slug];
        return n + (chapterMap && chapterMap[idx] ? chapterMap[idx] : 0);
      }, 0);
      readWordEls.forEach((el) => {
        el.textContent = fmtNum(readWords);
      });
    })
    .catch(() => {});
}
