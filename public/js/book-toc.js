// 书页目录：首屏只渲染第一卷（长书还会截断），其余卷点开或点「加载全部」时再拉目录
import { $, $$ } from './core.js';
import { loadToc, markTocRows, tocBookRow } from './toc.js';

const toc = $('.toc');
const slug = toc && toc.dataset.book;
const sections = toc ? $$('.toc-volume[data-lazy]', toc) : [];
const moreButtons = toc ? $$('.toc-more button', toc) : [];

if (slug && (sections.length || moreButtons.length)) {
  /** 把某一卷（key）或整本（不给 key）的目录行填进列表 */
  const fill = async (list, key) => {
    const data = await loadToc(slug, key);
    const rows = (data ? data.chapters : []).map((ch) => tocBookRow(slug, ch));
    list.replaceChildren(...rows);
    markTocRows(list);
  };

  // 首屏被截断的部分：点一下补全本卷（或不带 key 的整本目录）
  moreButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = btn.closest('.toc-more');
      const list = item?.parentElement;
      if (!list) return;
      btn.disabled = true;
      btn.textContent = '加载中…';
      await fill(list, item.dataset.key);
    });
  });

  // 未渲染的卷：展开时再补目录
  sections.forEach((section) => {
    const btn = $('.toc-volume-toggle', section);
    const list = $('.toc-list', section);
    const key = section.dataset.lazy;
    if (!btn || !list) return;

    btn.addEventListener('click', async () => {
      const open = list.hidden;
      list.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      section.classList.toggle('is-open', open);
      if (!open || list.childElementCount) return;
      await fill(list, key);
    });
  });
}
