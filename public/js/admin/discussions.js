// 后台讨论审核：切换栏目 / 翻页只替换列表；勾选后可批量审核或删除
import { initBulk } from './bulk.js';

const panel = document.querySelector('#discuss-panel');
const tabs = document.querySelector('.admin-tabs');

if (panel && tabs) {
  const state = { status: 'pending', page: 1 };
  const bulk = initBulk(panel, { unit: '条' });

  const BULK_LABELS = { approved: '通过', pending: '转待审', spam: '屏蔽', delete: '删除' };

  const readUrl = () => {
    const params = new URLSearchParams(location.search);
    const status = params.get('status');
    state.status = status === 'approved' || status === 'spam' ? status : 'pending';
    state.page = Math.max(1, Math.trunc(Number(params.get('page'))) || 1);
  };

  const urlFor = () =>
    `/admin/discussions?status=${state.status}${state.page > 1 ? `&page=${state.page}` : ''}`;

  const load = async (status = state.status, page = state.page, push = true) => {
    const qs = new URLSearchParams({ status, page: String(page) });
    const res = await fetch(`/admin/api/discussions?${qs}`);
    if (!res.ok) throw new Error('load failed');
    const data = await res.json();

    state.status = status;
    state.page = data.page || page;
    panel.innerHTML = data.html;

    // 栏目高亮和三个计数一起更新
    tabs.querySelectorAll('.admin-tab').forEach((tab) => {
      const key = new URL(tab.href).searchParams.get('status') || 'pending';
      tab.classList.toggle('is-active', key === state.status);
      const num = tab.querySelector('em');
      if (num && data.counts[key] !== undefined) num.textContent = String(data.counts[key]);
    });

    bulk.sync();

    // 地址栏跟着变，刷新和分享都能回到同一栏同一页
    if (push) {
      const href = urlFor();
      if (href !== `${location.pathname}${location.search}`) history.pushState({}, '', href);
    }
  };

  const fail = (href) => {
    // 接口挂了就退回整页跳转，功能不丢
    location.href = href;
  };

  tabs.addEventListener('click', (e) => {
    const link = e.target.closest('.admin-tab');
    if (!link) return;
    e.preventDefault();
    const status = new URL(link.href).searchParams.get('status') || 'pending';
    // 切栏目回到第一页
    load(status, 1).catch(() => fail(link.href));
  });

  panel.addEventListener('click', async (e) => {
    const pager = e.target.closest('.admin-pager a');
    if (pager) {
      e.preventDefault();
      const url = new URL(pager.href);
      const page = Math.trunc(Number(url.searchParams.get('page'))) || 1;
      const status = url.searchParams.get('status') || state.status;
      load(status, page).catch(() => fail(pager.href));
      return;
    }

    const btn = e.target.closest('[data-bulk-action]');
    if (!btn) return;
    const action = btn.dataset.bulkAction;
    const ids = bulk.picked();
    if (!ids.length) return;

    const label = BULK_LABELS[action] || '处理';
    if (!window.confirm(`确定${label}选中的 ${ids.length} 条讨论？`)) return;

    btn.disabled = true;
    try {
      const res = await fetch('/admin/api/discussions/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ids }),
      });
      if (!res.ok) throw new Error('batch failed');
      // 删除可能把当前页清空，页码交给服务端夹到有效范围
      await load();
    } catch {
      location.reload();
    }
  });

  // 浏览器前进/后退时按地址栏还原
  window.addEventListener('popstate', () => {
    readUrl();
    load(state.status, state.page, false).catch(() => location.reload());
  });
}
