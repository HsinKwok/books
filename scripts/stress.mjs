// 全站压测：按权重轮流打首页 / 分类 / 作者 / 书架 / 详情 / 阅读 / 搜索 / sitemap / rss
// 用法：node scripts/stress.mjs [--base=http://127.0.0.1:8787] [--concurrency=32] [--requests=2000]
import { performance } from 'node:perf_hooks';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BASE = arg('base', 'http://127.0.0.1:8787').replace(/\/$/, '');
const CONCURRENCY = Number(arg('concurrency', 32));
const TOTAL = Number(arg('requests', 2000));
const BOOK_COUNT = Number(arg('books', 1000));
const CHAPTERS = Number(arg('chapters', 10));

const CATEGORIES = ['都市悬疑', '科幻', '乡土', '测试'];
const AUTHORS = Array.from({ length: 25 }, (_, i) => `测试作者 ${String(i + 1).padStart(2, '0')}`);

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const bookSlug = (i) => `stress-${String(i).padStart(4, '0')}`;

// 权重：阅读页 > 详情 > 列表 > 其它
const routes = [
  { label: 'GET /', path: '/', weight: 3 },
  { label: 'GET /shelf', path: '/shelf', weight: 2 },
  ...CATEGORIES.map((cat) => ({
    label: `GET /c/${cat}`,
    path: `/c/${encodeURIComponent(cat)}`,
    weight: 2,
  })),
  ...AUTHORS.slice(0, 8).map((author, i) => ({
    label: `GET /a/:author #${String(i + 1).padStart(2, '0')}`,
    path: `/a/${encodeURIComponent(author)}`,
    weight: 1,
  })),
  { label: 'GET /b/:slug', make: () => `/b/${bookSlug(1 + Math.floor(Math.random() * BOOK_COUNT))}`, weight: 4 },
  {
    label: 'GET /b/:slug/:idx',
    make: () =>
      `/b/${bookSlug(1 + Math.floor(Math.random() * BOOK_COUNT))}/${1 + Math.floor(Math.random() * CHAPTERS)}`,
    weight: 6,
  },
  { label: 'GET /search', path: '/search?q=%E6%B5%8B%E8%AF%95', weight: 2 },
  // 按需加载接口：章节页推荐位、搜索加载更多、分类/作者翻页、章节讨论
  {
    label: 'GET /api/related',
    make: () => `/api/related/${bookSlug(1 + Math.floor(Math.random() * BOOK_COUNT))}/${1 + Math.floor(Math.random() * CHAPTERS)}`,
    weight: 2,
  },
  { label: 'GET /api/search', path: '/api/search?q=%E6%B5%8B%E8%AF%95&page=1', weight: 2 },
  { label: 'GET /api/feed', path: '/api/feed?cat=%E7%A7%91%E5%B9%BB&page=2', weight: 2 },
  {
    label: 'GET /api/talks',
    make: () =>
      `/api/talks/${bookSlug(1 + Math.floor(Math.random() * BOOK_COUNT))}/${1 + Math.floor(Math.random() * CHAPTERS)}`,
    weight: 2,
  },
  { label: 'GET /sitemap.xml', path: '/sitemap.xml', weight: 1 },
  { label: 'GET /rss.xml', path: '/rss.xml', weight: 1 },
  { label: 'GET /api/words', path: '/api/words', weight: 1 },
];

const totalWeight = routes.reduce((sum, route) => sum + route.weight, 0);
const routeOf = () => {
  let ticket = Math.random() * totalWeight;
  for (const route of routes) {
    ticket -= route.weight;
    if (ticket <= 0) return route;
  }
  return routes[routes.length - 1];
};

const stats = new Map();
const bump = (label) => {
  let item = stats.get(label);
  if (!item) {
    item = { times: [], errors: 0, statuses: new Map(), bytes: 0 };
    stats.set(label, item);
  }
  return item;
};

let nextId = 0;
async function worker() {
  while (nextId < TOTAL) {
    nextId += 1;
    const route = routeOf();
    const url = `${BASE}${route.make ? route.make() : route.path}`;
    const item = bump(route.label);
    const started = performance.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      const text = await res.text();
      const cost = performance.now() - started;
      item.times.push(cost);
      item.bytes += text.length;
      item.statuses.set(res.status, (item.statuses.get(res.status) ?? 0) + 1);
      if (!res.ok) item.errors += 1;
    } catch {
      item.errors += 1;
      item.statuses.set('ERR', (item.statuses.get('ERR') ?? 0) + 1);
    }
  }
}

const percentile = (sorted, p) => {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
};

// 预热，避免把冷启动算进结果
for (const route of ['/', '/b/stress-0001/1', '/api/words']) {
  try {
    await fetch(`${BASE}${route}`, { signal: AbortSignal.timeout(20000) });
  } catch {}
}

console.log(`目标 ${BASE} · 并发 ${CONCURRENCY} · 请求 ${TOTAL}`);
const wallStart = performance.now();
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
const wall = (performance.now() - wallStart) / 1000;

let allTimes = [];
let allErrors = 0;
const statusTotals = new Map();
const rows = [];
for (const route of routes) {
  const item = stats.get(route.label);
  if (!item) continue;
  for (const [code, n] of item.statuses) {
    statusTotals.set(code, (statusTotals.get(code) ?? 0) + n);
  }
  const times = item.times.sort((a, b) => a - b);
  allTimes = allTimes.concat(times);
  allErrors += item.errors;
  rows.push({
    route: route.label,
    count: item.times.length + item.errors,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    max: times.length ? times[times.length - 1] : 0,
    errors: item.errors,
    kb: item.bytes / 1024,
  });
}

const fmt = (n) => n.toFixed(1).padStart(8);
console.log('');
console.log('route'.padEnd(24) + 'count'.padStart(7) + 'p50(ms)'.padStart(10) + 'p95(ms)'.padStart(10) + 'p99(ms)'.padStart(10) + 'max(ms)'.padStart(10) + 'err'.padStart(6) + 'KB'.padStart(10));
for (const row of rows) {
  console.log(
    row.route.padEnd(24) +
      String(row.count).padStart(7) +
      fmt(row.p50) +
      fmt(row.p95) +
      fmt(row.p99) +
      fmt(row.max) +
      String(row.errors).padStart(6) +
      row.kb.toFixed(0).padStart(10),
  );
}

allTimes.sort((a, b) => a - b);
console.log('');
console.log(
  '状态码：' +
    [...statusTotals.entries()]
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([code, n]) => `${code}×${n}`)
      .join('  '),
);
console.log(
  `总计 ${TOTAL} 次 · 耗时 ${wall.toFixed(1)}s · RPS ${(TOTAL / wall).toFixed(1)} · ` +
    `P50 ${percentile(allTimes, 50).toFixed(0)}ms · P95 ${percentile(allTimes, 95).toFixed(0)}ms · ` +
    `P99 ${percentile(allTimes, 99).toFixed(0)}ms · 错误 ${allErrors}`,
);
process.exitCode = allErrors / TOTAL > 0.01 ? 1 : 0;
