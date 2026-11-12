// 章节页「同书其他章节」：页面先出骨架，这几条等用到时再补
import { $, mk } from './core.js';
import { formatWords } from './toc.js';

const grid = $('.related-grid[data-related]');

if (grid) {
  const slug = grid.dataset.related;
  const current = Number(grid.dataset.current || 0);

  fetch(`/api/related/${encodeURIComponent(slug)}/${current}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const items = data?.items;
      if (!Array.isArray(items) || !items.length) return;

      grid.replaceChildren(
        ...items.map((ch) => {
          const a = mk('a', 'related-item');
          a.href = `/b/${slug}/${ch.i}`;
          a.append(
            mk('span', 'related-no', `№ ${String(ch.i).padStart(2, '0')}`),
            mk('span', 'related-title', ch.t),
            mk('span', 'related-meta', formatWords(ch.w)),
          );
          return a;
        }),
      );
    })
    .catch(() => {});
}
