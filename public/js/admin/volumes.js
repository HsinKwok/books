// 后台卷面板：勾选后批量删除卷（章节退回其他卷或未分卷，章节本身不删）
import { initBulk } from './bulk.js';

const box = document.querySelector('#volumes');

if (box) {
  const bookId = box.dataset.bookId;
  const bulk = initBulk(box, { unit: '卷' });

  box.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-bulk-action]');
    if (!btn) return;
    const ids = bulk.picked();
    if (!ids.length) return;
    if (
      !window.confirm(
        `确定删除选中的 ${ids.length} 卷？卷里的章节会归到其他卷或「未分卷」，章节本身不会删除。`,
      )
    ) {
      return;
    }

    btn.disabled = true;
    try {
      const res = await fetch(`/admin/api/books/${bookId}/volumes/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids }),
      });
      if (!res.ok) throw new Error('batch failed');
      location.reload();
    } catch {
      location.reload();
    }
  });

  bulk.sync();
}
