// 后台章节表：翻页只替换表格；勾选后批量删除，删完留在当前页（服务端会夹到有效页）
import { initBulk } from './bulk.js';

const box = document.querySelector('#chapters-table');

if (box) {
  const bookId = box.dataset.bookId;
  let currentPage = Math.max(1, Math.trunc(Number(new URLSearchParams(location.search).get('chapterPage'))) || 1);
  const bulk = initBulk(box, { unit: '章' });

  const load = async (page, push = true) => {
    const res = await fetch(`/admin/api/books/${bookId}/chapters?page=${page}`);
    if (!res.ok) throw new Error('load failed');
    const data = await res.json();
    box.innerHTML = data.html;
    currentPage = data.page || page;
    bulk.sync();

    if (push) {
      const href = `/admin/books/${bookId}${currentPage > 1 ? `?chapterPage=${currentPage}` : ''}`;
      if (href !== `${location.pathname}${location.search}`) history.pushState({}, '', href);
    }
  };

  box.addEventListener('click', async (e) => {
    const pager = e.target.closest('.admin-pager a');
    if (pager) {
      e.preventDefault();
      const page = Math.trunc(Number(new URL(pager.href).searchParams.get('chapterPage'))) || 1;
      load(page).catch(() => {
        location.href = pager.href;
      });
      return;
    }

    const btn = e.target.closest('[data-bulk-action]');
    if (!btn) return;
    const idxs = bulk.picked();
    if (!idxs.length) return;
    if (!window.confirm(`确定删除选中的 ${idxs.length} 章？这些章的讨论和阅读进度会一并清除，删掉就找不回来了。`)) return;

    btn.disabled = true;
    try {
      const res = await fetch(`/admin/api/books/${bookId}/chapters/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', idxs }),
      });
      if (!res.ok) throw new Error('batch failed');
      // 删除可能把当前页清空，页码交给服务端夹到有效范围
      await load(currentPage);
    } catch {
      location.reload();
    }
  });

  // 浏览器前进/后退时按地址栏还原页码
  window.addEventListener('popstate', () => {
    const page = Math.max(1, Math.trunc(Number(new URLSearchParams(location.search).get('chapterPage'))) || 1);
    load(page, false).catch(() => location.reload());
  });

  bulk.sync();
}
