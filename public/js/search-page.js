// 搜索页：换个关键词只替换结果区，页面其余部分不动
import { $ } from './core.js';

const form = $('.search-form');
const results = $('#search-results');
const note = $('#search-note');
const input = $('#search-input');

if (form && results && input) {
  let seq = 0;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    // 空关键词交回服务端，保持「索引覆盖多少章」的默认提示
    if (!q) {
      form.submit();
      return;
    }

    const mine = ++seq;
    try {
      const res = await fetch(`/api/search/html?q=${encodeURIComponent(q)}`);
      if (!res.ok || mine !== seq) return;
      const data = await res.json();
      if (mine !== seq) return;

      results.innerHTML = data.html;
      if (note && data.note) note.innerHTML = data.note;
      // 片段里的「加载更多」默认隐藏，替换后要重新放出来
      const more = $('#search-more', results);
      if (more) more.hidden = false;

      // 地址栏跟上，刷新和分享都能回到同一份结果
      history.replaceState({}, '', `/search?q=${encodeURIComponent(q)}`);
    } catch {
      // 接口不行就退回整页提交，功能不受影响
      form.submit();
    }
  });
}
