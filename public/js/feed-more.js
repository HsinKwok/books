// 分类页 / 作者页翻页：有 JS 时只追加列表，地址栏照常变成 ?page=N
import { $ } from './core.js';

const feed = $('.feed');

/** 从翻页条的 data-base 反推筛选条件，避免再把参数塞进每个链接 */
const filterOf = () => {
  const base = $('.pager')?.dataset.base || '';
  const hit = base.match(/^\/(c|a)\/(.+)$/);
  if (!hit) return '';
  return hit[1] === 'c' ? `cat=${hit[2]}` : `author=${hit[2]}`;
};

if (feed && filterOf()) {
  let busy = false;

  document.addEventListener('click', async (e) => {
    const link = e.target.closest('.pager a[rel="next"]');
    if (!link || busy) return;
    const pager = link.closest('.pager');
    const filter = filterOf();
    if (!pager || !filter) return;

    e.preventDefault();
    const href = link.href;
    const page = Number(pager.dataset.page || 1) + 1;
    busy = true;
    try {
      const res = await fetch(`/api/feed?${filter}&page=${page}`);
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();

      const tpl = document.createElement('template');
      tpl.innerHTML = data.feed;
      feed.append(...[...tpl.content.children]);

      tpl.innerHTML = data.pager;
      const next = tpl.content.firstElementChild;
      if (next) pager.replaceWith(next);

      history.pushState({}, '', href);
    } catch {
      // 接口不行就退回整页跳转，功能不受影响
      location.href = href;
    } finally {
      busy = false;
    }
  });
}
