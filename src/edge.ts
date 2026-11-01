import type { MiddlewareHandler } from 'hono';
import type { Env, Variables } from './env';

/**
 * 匿名 HTML 边缘缓存：放在站点路由之前，只缓存「没有 Cookie 的 GET 页面」。
 * 登录态、阅读进度、后台和接口都跳过，避免把个性化内容缓存成公共页面。
 *
 * Cache API 不支持 stale-while-revalidate，这里手工实现：
 * - 0 ~ TTL：直接回缓存；
 * - TTL ~ STALE：先返回旧页面，同时用子请求在后台重新渲染并回填；
 * - 超过 STALE：视为彻底失效，同步回源。
 */
const TTL = 60;
const STALE = 300;

/** 回填时写入的时间戳，用来判断缓存新鲜度 */
const STAMP = 'x-edge-time';
/** 后台回源的标记头，带这个头就跳过读缓存，但仍会写缓存 */
const REFRESH = 'x-edge-refresh';

/** 这些前缀下不缓存：后台、接口、R2 封面 */
const SKIP: RegExp[] = [/^\/admin(?:$|\/)/, /^\/api(?:$|\/)/, /^\/cover(?:\/|$)/];

/**
 * 这些前缀除了本站不缓存，还要显式回 no-store：
 * Cloudflare 若开了「缓存所有内容」规则，HTML 会被 CDN 存下来，
 * 后台页面（如 /admin/setup）就会出现「已经建好站长却还看到旧表单」。
 */
const NO_STORE: RegExp[] = [/^\/admin(?:$|\/)/, /^\/api(?:$|\/)/];

/** 后台回源：子请求会重新进入 Worker，渲染完成后照常回填缓存 */
function revalidate(url: string) {
  return fetch(new Request(url, { method: 'GET', headers: { [REFRESH]: '1' } }));
}

export const edgeCache: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (
  c,
  next,
) => {
  if (SKIP.some((re) => re.test(c.req.path))) {
    await next();
    // 本站跳过还不够，得明确告诉 CDN 也不要存，否则后台页面会被缓存成旧状态
    if (NO_STORE.some((re) => re.test(c.req.path))) c.res.headers.set('cache-control', 'no-store');
    return;
  }
  if (c.req.method !== 'GET') return next();
  // 带 Cookie 就是登录 / 口令 / 个性化请求，直接回源
  if (c.req.header('cookie')) return next();

  // DOM lib 的 CacheStorage 没有 default 声明，workers-types 里才有，这里显式收窄
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(c.req.url, { method: 'GET' });
  const refreshing = c.req.header(REFRESH) === '1';

  if (!refreshing) {
    const hit = await cache.match(key);
    if (hit) {
      const at = Number(hit.headers.get(STAMP) ?? 0);
      const age = Math.floor(Date.now() / 1000) - at;
      if (age < TTL) return hit;
      if (age < STALE) {
        c.executionCtx.waitUntil(revalidate(c.req.url));
        return hit;
      }
    }
  }

  await next();

  const res = c.res;
  if (res.status !== 200) return;
  if (!(res.headers.get('content-type') ?? '').includes('text/html')) return;
  // 响应要写 Cookie 时不缓存
  if (res.headers.get('set-cookie')) return;

  const headers = new Headers(res.headers);
  headers.set('cache-control', `public, max-age=${TTL}, stale-while-revalidate=${STALE - TTL}`);
  headers.set(STAMP, String(Math.floor(Date.now() / 1000)));
  const copy = new Response(res.clone().body, { status: 200, headers });
  c.executionCtx.waitUntil(cache.put(key, copy));
};
