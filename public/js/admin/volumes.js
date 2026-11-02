// 后台卷面板：新增/改名/排序/删除都在原地刷新，章节表的「卷」列一起更新
import { initBulk } from './bulk.js';

const box = document.querySelector('#volumes');

if (box) {
  const bookId = box.dataset.bookId;
  const bulk = initBulk(box, { unit: '卷' });
  // 章节表翻页会改 URL，提交时再读，避免把表格拉回旧页
  const chapterPage = () => new URLSearchParams(location.search).get('chapterPage') || '1';

  // 写操作直接把卷面板（必要时连章节表）的 HTML 一起回过来，省掉二次 GET
  const apply = (data) => {
    box.innerHTML = data.html;
    bulk.sync();
    // 卷变了章节的所属卷和卷内章序也会变，交给 chapters.js 换表
    if (data.chapters) {
      window.dispatchEvent(new CustomEvent('admin:chapters', { detail: data.chapters }));
    }
  };

  // 卷相关表单改走 fetch；确认弹窗在这里弹，并把事件挡住，免得 confirm.js 再问一次
  box.addEventListener('submit', async (e) => {
    const form = e.target.closest('form');
    if (!form) return;
    e.preventDefault();
    e.stopPropagation();
    if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) return;

    // 提交期间禁用按钮，避免连点重复加卷
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(`${form.action}?chapterPage=${chapterPage()}`, {
        method: 'POST',
        headers: { 'x-admin-ajax': '1' },
        body: new FormData(form),
      });
      if (!res.ok) throw new Error('save failed');
      apply(await res.json());
    } catch {
      location.reload();
    }
  });

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
      const res = await fetch(`/admin/api/books/${bookId}/volumes/batch?chapterPage=${chapterPage()}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids }),
      });
      if (!res.ok) throw new Error('batch failed');
      apply(await res.json());
    } catch {
      location.reload();
    }
  });

  bulk.sync();
}
