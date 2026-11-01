/**
 * 请求之间复用的小缓存：同一个 Worker 实例内 30 秒有效，写操作后主动清掉。
 * 只放全站聚合这类「算一次、所有请求共用」的结果，不放和用户相关的数据。
 */
const TTL = 30_000;
/** 变化慢、但不宜长期陈旧的聚合（卷列表） */
export const TTL_MED = 60_000;
/** 全站统计、分类这类几乎不变的聚合，写操作会主动 forget */
export const TTL_LONG = 300_000;
/** 搜索这类键空间无上限的缓存，靠条数上限兜底，避免被爬虫翻词撑爆内存 */
const LIMIT = 300;
const stores = new WeakMap<D1Database, Map<string, { at: number; data: unknown }>>();

function store(db: D1Database) {
  let map = stores.get(db);
  if (!map) {
    map = new Map();
    stores.set(db, map);
  }
  return map;
}

/** 超限时先丢过期项，再按时序丢最久没被用到的 */
function trim(map: Map<string, { at: number; data: unknown }>) {
  if (map.size <= LIMIT) return;
  const now = Date.now();
  // 按最长的 TTL 判过期，避免把长缓存条目提前清掉
  for (const [key, item] of map) {
    if (now - item.at >= TTL_LONG) map.delete(key);
  }
  while (map.size > LIMIT) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/** ttl 按数据变化频率传：默认 30 秒，聚合类可以传 TTL_MED / TTL_LONG */
export async function memo<T>(
  db: D1Database,
  key: string,
  load: () => Promise<T>,
  ttl = TTL,
): Promise<T> {
  const map = store(db);
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < ttl) {
    // 命中后挪到队尾，让淘汰顺序接近 LRU
    map.delete(key);
    map.set(key, hit);
    return hit.data as T;
  }
  const data = await load();
  map.set(key, { at: Date.now(), data });
  trim(map);
  return data;
}

/** 写完书 / 章节 / 分类后调用，让下一次请求重新算 */
export function forget(db: D1Database, ...keys: string[]) {
  if (!keys.length) {
    stores.delete(db);
    return;
  }
  const map = stores.get(db);
  if (!map) return;
  for (const key of keys) map.delete(key);
}

/* ---------- 正文渲染缓存 ---------- */

/**
 * 章节正文的 Markdown 转 HTML 是纯函数，同一个章节反复被读时没必要重算。
 * 只留最近 80 章的渲染结果，key 里带上内容摘要，正文一改自然失效。
 */
const MD_LIMIT = 80;
const mdCache = new Map<string, string>();

/** 内容摘要：长度 + 短哈希，比直接拿正文当 key 省内存 */
export function contentKey(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

export function memoHtml(key: string, render: () => string): string {
  const hit = mdCache.get(key);
  if (hit !== undefined) return hit;
  const html = render();
  mdCache.set(key, html);
  if (mdCache.size > MD_LIMIT) {
    const oldest = mdCache.keys().next().value;
    if (oldest !== undefined) mdCache.delete(oldest);
  }
  return html;
}
