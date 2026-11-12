import { $, $$ } from './core.js';
import { applySettings } from './settings.js';

// Markdown 工具条只有带编辑框的页面才需要
if ($('textarea[data-markdown]')) import('./markdown-editor.js');

// 列表翻页按容器宽度决定铺几个页码
if ($('.pager')) import('./pager.js');

/* ---------- rail category group ---------- */
const railGroup = $('.rail-group');
if (railGroup) {
  const railToggle = $('.rail-toggle', railGroup);
  const railSub = $('#rail-sub');
  const setRail = (open) => {
    railGroup.classList.toggle('is-open', open);
    if (railSub) railSub.hidden = !open;
    railToggle.setAttribute('aria-expanded', String(open));
  };
  let railOpen = true;
  try {
    railOpen = localStorage.getItem('read.rail') !== 'closed';
  } catch {}
  setRail(railOpen);
  railToggle.addEventListener('click', () => {
    const open = !railGroup.classList.contains('is-open');
    setRail(open);
    try {
      localStorage.setItem('read.rail', open ? 'open' : 'closed');
    } catch {}
  });
}

/* ---------- reader account ---------- */
// 登录态由服务端写入 body[data-user]，仅用于控制本地阅读统计的展示
const online = document.body.dataset.user === '1';
if (online) {
  $$('.js-read-block').forEach((el) => {
    el.hidden = false;
  });
}

/* ---------- toc states / resume card / footer counter ---------- */
// 阅读进度相关的脚本只在页面有对应元素时才拉
if ($('.toc-row') || $('#resume') || $('.js-read-total')) import('./read-stats.js');

applySettings();
