// 后台分类列表：勾选后批量删除，成功后原地替换表格和计数
import { initBulk } from './bulk.js';

const box = document.querySelector('#categories-table');

if (box) {
  const bulk = initBulk(box, { unit: '个分类' });

  // 选中的分类一共影响多少本书，确认框里要说清楚
  const pickedBooks = () =>
    bulk
      .items()
      .filter((el) => el.checked && !el.disabled)
      .reduce((sum, el) => sum + Number(el.closest('tr')?.dataset.booksCount ?? 0), 0);

  box.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-bulk-action]');
    if (!btn) return;
    const ids = bulk.picked();
    if (!ids.length) return;
    const books = pickedBooks();
    const tip = books
      ? `确定删除选中的 ${ids.length} 个分类？影响 ${books} 本书，书会回落到「未分类」，不会删书。`
      : `确定删除选中的 ${ids.length} 个分类？当前没有书在用。`;
    if (!window.confirm(tip)) return;

    btn.disabled = true;
    try {
      const res = await fetch('/admin/api/categories/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids }),
      });
      if (!res.ok) throw new Error('batch failed');
      const data = await res.json();
      box.innerHTML = data.html;
      const countNode = document.querySelector('[data-categories-count]');
      if (countNode && typeof data.total === 'number') countNode.textContent = String(data.total);
      bulk.sync();
    } catch {
      location.reload();
    }
  });

  bulk.sync();
}
