// 后台读者列表：筛选只替换表格，不整页刷新；勾选后可批量封禁 / 解封
import { initBulk } from './bulk.js';

const box = document.querySelector('#users-table');
const form = document.querySelector('#users-filter');

if (box && form) {
  const input = form.querySelector('[name="q"]');
  const bulk = initBulk(box, { unit: '个账号' });

  const load = async () => {
    const q = (input?.value ?? '').trim();
    const params = new URLSearchParams();
    if (q) params.set('q', q);

    const res = await fetch(`/admin/api/users?${params}`);
    if (!res.ok) throw new Error('load failed');
    const data = await res.json();
    box.innerHTML = data.html;
    bulk.sync();

    // 面板右上角的账号数跟着结果变
    const count = form.closest('.admin-panel')?.querySelector('.admin-panel-count');
    if (count) count.textContent = String(data.count);

    // 地址栏跟着变，刷新和分享都能回到同一份筛选结果
    const href = `/admin/users${params.size ? `?${params}` : ''}`;
    if (href !== `${location.pathname}${location.search}`) {
      history.pushState({}, '', href);
    }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // 接口挂了就退回整页提交，功能不丢
    load().catch(() => form.submit());
  });

  box.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-bulk-action]');
    if (!btn) return;
    const action = btn.dataset.bulkAction;
    const ids = bulk.picked();
    if (!ids.length) return;

    const tip =
      action === 'ban'
        ? `确定封禁选中的 ${ids.length} 个账号？封禁后对方会立即退出登录。`
        : `确定解封选中的 ${ids.length} 个账号？`;
    if (!window.confirm(tip)) return;

    btn.disabled = true;
    try {
      const res = await fetch('/admin/api/users/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ids }),
      });
      if (!res.ok) throw new Error('batch failed');
      const data = await res.json().catch(() => ({}));
      await load();
      // 站长会被服务端跳过，明确告诉用户，避免以为没生效
      if (data.skipped > 0) {
        window.alert(`已跳过 ${data.skipped} 位站长。批量操作不封站长，确需封禁请在行内单独操作。`);
      }
    } catch {
      location.reload();
    }
  });

  // 改角色会立即销毁对方会话，只有真的改了才确认一次
  box.addEventListener('submit', (e) => {
    const roleForm = e.target.closest('.admin-role-form');
    if (!roleForm) return;
    const select = roleForm.querySelector('select[name="role"]');
    if (!select || select.value === select.dataset.initial) return;
    const label = select.selectedOptions[0]?.textContent ?? select.value;
    const tip = `确定把「${roleForm.dataset.name}」的角色改为「${label}」？保存后对方会立即退出登录。`;
    if (!window.confirm(tip)) e.preventDefault();
  });
}
