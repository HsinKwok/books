import { $, $$ } from './core.js';

/* 讨论表单为真实 POST，提交后跳回本章；这里只处理「回复」与排序 */

const form = $('#discuss-form');
const discussList = $('#discuss-list');

if (form && discussList) {
  const body = $('textarea[name="body"]', form);
  const parent = $('input[name="parent"]', form);
  const note = $('#discuss-note');
  const noteText = note?.textContent || '';

  const resetParent = () => {
    if (parent) parent.value = '';
    if (note) note.textContent = noteText;
    if (body) {
      body.placeholder = '说说这一章…… 友善一点。';
      body.focus();
    }
  };

  discussList.addEventListener('click', async (e) => {
    const btn = e.target.closest('.discuss-actions button');
    if (!btn) return;

    if (btn.dataset.act === 'like') {
      const item = btn.closest('.discuss-item');
      if (!item || btn.disabled) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/talks/${item.dataset.id}/like`, { method: 'POST' });
        if (res.status === 401) {
          location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
          return;
        }
        const json = await res.json();
        if (!json.ok) return;
        btn.classList.toggle('is-liked', json.liked);
        btn.setAttribute('aria-pressed', String(json.liked));
        const count = $('.like-n', btn);
        if (count) count.textContent = String(json.likes);
      } catch {
        // 网络抖动时保持原样
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (btn.dataset.act !== 'reply' || !body) return;
    const item = btn.closest('.discuss-item');
    if (!item) return;
    const target = $('.discuss-meta b', item)?.textContent || '';
    if (parent) parent.value = item.dataset.i || '';
    if (note) note.textContent = `回复 ${target}，提交后需审核`;
    body.placeholder = `回复 ${target}…`;
    body.focus();
    body.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  form.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && parent?.value) {
      e.preventDefault();
      resetParent();
    }
  });
}

const sortBtns = $$('.discuss-sort button');
if (discussList && sortBtns.length) {
  sortBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      sortBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
      const items = $$('.discuss-item', discussList).sort(
        (a, b) => Number(a.dataset.i) - Number(b.dataset.i),
      );
      if (btn.dataset.sort === 'oldest') items.reverse();
      items.forEach((item) => discussList.appendChild(item));
    });
  });
}
