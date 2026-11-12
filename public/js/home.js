// 首页：最近更新延后补，书卡翻页只换列表
import { $ } from './core.js';

const recent = $('#home-recent');

if (recent) {
  fetch('/api/recent')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data?.html) recent.innerHTML = data.html;
    })
    .catch(() => {
      recent.innerHTML = '<p class="empty-note">最近更新暂时加载不出来。</p>';
    });
}

// 书卡翻页：只替换 #home-books，地址栏照常变成 ?page=N
const list = $('#home-books');

if (list) {
  let busy = false;

  document.addEventListener('click', async (e) => {
    const link = e.target.closest('#home-books .pager a[href]');
    if (!link || busy) return;

    const url = new URL(link.href, location.origin);
    if (url.pathname !== '/') return;

    e.preventDefault();
    busy = true;
    try {
      const page = url.searchParams.get('page') || '1';
      const res = await fetch(`/api/home?page=${page}`);
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      if (!data.html) throw new Error('empty');

      list.innerHTML = data.html;
      history.pushState({}, '', url.pathname + url.search);
      list.scrollIntoView({ block: 'start' });
    } catch {
      // 接口不行就退回整页跳转
      location.href = link.href;
    } finally {
      busy = false;
    }
  });

  // 后退时列表已被换成别的页，直接重载拿回对应页
  window.addEventListener('popstate', () => location.reload());
}
