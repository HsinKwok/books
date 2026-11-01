import { $, debounce, mk } from './core.js';

// 页码数量跟着容器宽度走：窄屏只留「首/当前/尾」，宽屏多铺几格
const nav = $('.pager');
if (nav) {
  const page = Number(nav.dataset.page) || 1;
  const pages = Number(nav.dataset.pages) || 1;
  const base = nav.dataset.base || '/';

  const MAX_NUMS = 15; // 一屏最多铺 15 个页码，再宽也不铺满
  const GAP = 6; // 与 .pager 的 gap 一致（px）

  const href = (n) => (n === 1 ? base : `${base}?page=${n}`);

  /** 一行能放几格：页码、省略号、上一页/下一页都按同一格宽估算 */
  const budgetOf = () => {
    const num = nav.querySelector('.pager-num');
    const step = nav.querySelector('.pager-step');
    const itemW = num ? num.getBoundingClientRect().width : 0;
    if (!itemW) return MAX_NUMS; // 还没排版出来，先按最大铺
    const width = nav.clientWidth;
    if (!width) return MAX_NUMS; // 容器不可见时不缩水
    const perRow = Math.floor((width + GAP) / (itemW + GAP));
    const stepW = step ? step.getBoundingClientRect().width : itemW;
    const reserved = Math.ceil((stepW + GAP) / (itemW + GAP)) * 2; // 上一页 + 下一页
    return Math.min(MAX_NUMS, Math.max(3, perRow - reserved));
  };

  /** 从当前页向两边铺，铺满预算为止；首尾页始终保留 */
  const pick = (budget) => {
    const set = new Set([1, pages, page]);
    const fits = (candidate) => {
      const sorted = [...candidate].sort((a, b) => a - b);
      let count = sorted.length;
      for (let i = 1; i < sorted.length; i += 1) {
        if (sorted[i] - sorted[i - 1] > 1) count += 1; // 中间断开要占一个省略号
      }
      return count <= budget;
    };

    for (let offset = 1; offset < pages; offset += 1) {
      let added = false;
      for (const n of [page - offset, page + offset]) {
        if (n <= 1 || n >= pages || set.has(n)) continue;
        const trial = new Set(set);
        trial.add(n);
        if (fits(trial)) {
          set.add(n);
          added = true;
        }
      }
      if (!added) break;
    }
    return [...set].sort((a, b) => a - b);
  };

  const stepNode = (target, text, rel) => {
    if (target < 1 || target > pages) return mk('span', 'pager-step is-off', text);
    const link = mk('a', 'pager-step', text);
    link.href = href(target);
    link.rel = rel;
    return link;
  };

  let currentBudget = 0;
  const render = () => {
    const budget = budgetOf();
    if (budget === currentBudget) return;
    currentBudget = budget;

    const nums = pick(budget);
    const frag = document.createDocumentFragment();
    frag.appendChild(stepNode(page - 1, '上一页', 'prev'));

    nums.forEach((n, i) => {
      if (i > 0 && n - nums[i - 1] > 1) frag.appendChild(mk('span', 'pager-gap', '…'));
      if (n === page) {
        const cur = mk('span', 'pager-num is-active', String(n));
        cur.setAttribute('aria-current', 'page');
        frag.appendChild(cur);
      } else {
        const link = mk('a', 'pager-num', String(n));
        link.href = href(n);
        frag.appendChild(link);
      }
    });

    frag.appendChild(stepNode(page + 1, '下一页', 'next'));
    nav.textContent = '';
    nav.appendChild(frag);
  };

  render();
  window.addEventListener('resize', debounce(render, 150));
  // 字体加载完宽度会变，重新量一次
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
}
