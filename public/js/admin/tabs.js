// 设置页选项卡：切换只替换当前面板；保存由各 tab 自己的表单提交
const nav = document.querySelector('[data-tabs]');

if (nav) {
  const panel = document.querySelector('#settings-panel');
  const key = 'admin-tabs:' + nav.dataset.tabs;
  const active = () => nav.dataset.active || '';

  const mark = (name) => {
    nav.dataset.active = name;
    nav.querySelectorAll('[data-tab]').forEach((el) => {
      const on = el.dataset.tab === name;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    try {
      localStorage.setItem(key, name);
    } catch {
      /* 隐私模式下写不了，忽略 */
    }
  };

  let busy = false;

  const load = async (name, mode) => {
    if (!panel || busy || !name || name === active()) return;
    busy = true;
    panel.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch(`/admin/api/settings/panel?tab=${encodeURIComponent(name)}`, {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('panel');
      const data = await res.json();
      panel.innerHTML = data.html;
      mark(data.tab);

      const url = `/admin/settings?tab=${data.tab}`;
      if (mode === 'push') history.pushState({ tab: data.tab }, '', url);
      else if (mode === 'replace') history.replaceState({ tab: data.tab }, '', url);

      const { initMarkdownEditors } = await import('../markdown-editor.js');
      initMarkdownEditors(panel);
    } catch {
      // 拉不到面板就整页跳过去，没有脚本时走的也是这条路径
      location.href = `/admin/settings?tab=${encodeURIComponent(name)}`;
    } finally {
      busy = false;
      panel.removeAttribute('aria-busy');
    }
  };

  nav.addEventListener('click', (event) => {
    const link = event.target.closest('[data-tab]');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    load(link.dataset.tab, 'push');
  });

  const params = new URLSearchParams(location.search);
  history.replaceState({ tab: active() }, '', location.href);

  // 从侧栏进设置页（没带 tab）时，回到上次看的那一页
  let saved = '';
  try {
    saved = localStorage.getItem(key) || '';
  } catch {
    saved = '';
  }
  if (!params.get('tab') && saved && saved !== active()) load(saved, 'replace');

  window.addEventListener('popstate', (event) => {
    const name = event.state?.tab || new URLSearchParams(location.search).get('tab');
    if (name) load(name, null);
  });
}
