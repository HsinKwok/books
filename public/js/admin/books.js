// 后台书籍列表：筛选和翻页只替换表格，不整页重渲染；勾选后可批量删除
import { initBulk } from './bulk.js';

const box = document.querySelector('#books-table');
const form = document.querySelector('#books-filter');

if (box && form) {
  const input = form.querySelector('[name="q"]');
  const status = form.querySelector('[name="status"]');
  const category = form.querySelector('[name="category"]');

  let currentPage = 1;
  const bulk = initBulk(box, { unit: '本' });

  /** 当前表单里的筛选条件 */
  const filter = () => ({
    q: (input?.value ?? '').trim(),
    status: status?.value ?? '',
    category: category?.value ?? '',
  });

  const load = async (page) => {
    const { q, status: st, category: cat } = filter();
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (st) params.set('status', st);
    if (cat) params.set('category', cat);
    if (page > 1) params.set('page', String(page));

    const res = await fetch(`/admin/api/books?${params}`);
    if (!res.ok) throw new Error('load failed');
    const data = await res.json();
    box.innerHTML = data.html;
    currentPage = data.page || page || 1;
    bulk.sync();

    // 地址栏跟着变，刷新和分享都能回到同一份筛选结果
    const href = `/admin/books${params.size ? `?${params}` : ''}`;
    if (href !== `${location.pathname}${location.search}`) {
      history.pushState({}, '', href);
    }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // 接口挂了就退回整页提交，功能不丢
    load(1).catch(() => form.submit());
  });

  box.addEventListener('click', async (e) => {
    const link = e.target.closest('.admin-pager a');
    if (link) {
      const page = Number(new URL(link.href).searchParams.get('page') || 1);
      e.preventDefault();
      load(page).catch(() => {
        location.href = link.href;
      });
      return;
    }

    const btn = e.target.closest('[data-bulk-action]');
    if (!btn) return;
    const ids = bulk.picked();
    if (!ids.length) return;
    if (!window.confirm(`确定删除选中的 ${ids.length} 本书？章节和讨论会一并删除。`)) return;

    btn.disabled = true;
    try {
      const res = await fetch('/admin/api/books/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids }),
      });
      if (!res.ok) throw new Error('batch failed');
      // 删除可能把当前页清空，页码交给服务端夹到有效范围
      await load(currentPage);
    } catch {
      location.reload();
    }
  });
}
