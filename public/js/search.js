// 搜索页输入联想：防抖 220ms，只回前 6 条
import { $, mk } from './core.js';

const input = $('#search-input');
const box = $('#search-suggest');

if (input && box) {
  let timer = 0;
  let seq = 0;

  const hide = () => {
    box.hidden = true;
    box.replaceChildren();
  };

  const render = (hits) => {
    if (!hits.length) return hide();
    box.replaceChildren(
      ...hits.map((hit) => {
        const a = document.createElement('a');
        a.href = `/b/${hit.slug}/${hit.idx}`;
        const book = document.createElement('b');
        book.textContent = hit.book;
        const title = document.createElement('span');
        title.textContent = hit.title;
        a.append(book, title);
        return a;
      }),
    );
    box.hidden = false;
  };

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (!q) return hide();

    timer = setTimeout(async () => {
      const mine = ++seq;
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`);
        if (!res.ok || mine !== seq) return;
        const data = await res.json();
        if (mine === seq && input.value.trim() === q) render(data.hits || []);
      } catch {}
    }, 220);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  document.addEventListener('click', (e) => {
    if (box.hidden) return;
    if (box.contains(e.target) || e.target === input) return;
    hide();
  });
}

/* ---------- 加载更多：每页 30 条，最多 3 页 ---------- */
// 结果区可能被换关键词整块替换，这里用事件委托，翻页状态存在按钮自己的 dataset 上
const more = $('#search-more');
if (more) more.hidden = false;

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('#search-more button');
  if (!btn || btn.disabled) return;

  const box = btn.closest('#search-more');
  const list = $('.search-list');
  const count = $('#search-count');
  if (!box || !list) return;

  const page = Number(box.dataset.page || 1) + 1;
  btn.disabled = true;
  try {
    const params = new URLSearchParams({ q: box.dataset.q, page: String(page) });
    if (box.dataset.mode) params.set('mode', box.dataset.mode);
    const res = await fetch(`/api/search?${params}`);
    if (!res.ok) return;

    const data = await res.json();
    const hits = data?.hits || [];
    box.dataset.page = String(page);
    box.dataset.mode = data?.mode || box.dataset.mode || '';

    const frag = document.createDocumentFragment();
    for (const hit of hits) {
      const a = mk('a', 'search-hit');
      a.href = `/b/${hit.slug}/${hit.idx}`;
      a.append(
        mk('span', 'search-hit-book', `${hit.book} · 第 ${hit.idx} 章`),
        mk('span', 'search-hit-title', hit.title),
        mk('span', 'search-hit-snippet', hit.snippet),
      );
      const li = mk('li');
      li.append(a);
      frag.append(li);
    }
    list.append(frag);

    if (count && hits.length) {
      count.textContent = String(Number(count.textContent || 0) + hits.length);
    }
    // 不满一页说明到头了；第 3 页之后也不再翻
    if (hits.length < 30 || page >= 3) box.hidden = true;
  } catch {
  } finally {
    btn.disabled = false;
  }
});
