import type { Context, MiddlewareHandler } from 'hono';
import { SESSION_COOKIE } from './auth';
import { BUILD } from './assets.generated';
import { memo } from './cache';
import type { Env, Variables } from './env';

/**
 * 匿名页面边缘缓存：放在站点路由之前，只缓存「没有登录 Cookie 的 GET 页面」。
 * 登录态、阅读进度、后台和接口都跳过，避免把个性化内容缓存成公共页面。
 *
 * Cache API 不支持 stale-while-revalidate，这里手工实现：
 * - 0 ~ TTL：直接回缓存；
 * - TTL ~ STALE：先返回旧页面，同时用子请求在后台重新渲染并回填；
 * - 超过 STALE：视为彻底失效，同步回源。
 */
const TTL = 60;
const STALE = 300;

/**
 * 能算出内容版本的页面，把版本拼进缓存键：页面一变 key 就变，旧条目自然不再命中，
 * 所以不用靠短 TTL 兜底，可以放心缓存很久。
 */
/** 章节页：正文、书籍信息、站点设置都没变时，就是一份不可变内容 */
const CHAPTER_TTL = 86_400;
const CHAPTER_STALE = 90_000;
/** 书页：和章节页同理，版本里多算一个本书讨论数 */
const BOOK_TTL = 86_400;
const BOOK_STALE = 90_000;
/** 列表页：书库整体变化不频繁，十分钟足够，版本变化会立刻换 key */
const LIST_TTL = 600;
const LIST_STALE = 1_200;

/** 目录接口：内容只随章节变化，和章节页共用版本键，缓存一天 */
const TOC_TTL = 86_400;
const TOC_STALE = 90_000;

/** 站点地图 / 图标：变化很慢，靠版本键失效即可 */
const FEED_TTL = 3_600;
const FEED_STALE = 7_200;
const ICON_TTL = 86_400;
const ICON_STALE = 90_000;

/** 公开接口：命中后连 Worker 后面的 D1 都不用跑 */
const API_TTL = 60;
const API_STALE = 300;

/** /b/:slug/:idx */
const CHAPTER_PATH = /^\/b\/([^/]+)\/(\d+)$/;
/** /b/:slug */
const BOOK_PATH = /^\/b\/([^/]+)$/;
/** 首页、分类页、作者页 */
const LIST_PATHS = [/^\/$/, /^\/c\/[^/]+$/, /^\/a\/[^/]+$/];
/** /api/toc/:slug */
const TOC_PATH = /^\/api\/toc\/([^/]+)$/;
/** sitemap 索引与分片 */
const SITEMAP_PATH = /^\/sitemap(?:-\d+)?\.xml$/;
const RSS_PATH = '/rss.xml';
const FAVICON_PATH = '/favicon.ico';

/**
 * 接口白名单：只缓存匿名可见、内容与用户无关的 JSON。
 * 带 session cookie 的请求在下面统一跳过，所以不会串号。
 */
const API_CACHE = [
  /^\/api\/books$/,
  /^\/api\/talks\/[^/]+\/\d+$/,
  /^\/api\/book-talks\/[^/]+$/,
  /^\/api\/toc\/[^/]+$/,
];

/** 回填时写入的时间戳，用来判断缓存新鲜度 */
const STAMP = 'x-edge-time';
/** 后台回源的标记头，带这个头就跳过读缓存，但仍会写缓存 */
const REFRESH = 'x-edge-refresh';

/** 这些前缀下不缓存：后台、R2 封面（封面在路由里自己缓存） */
const SKIP: RegExp[] = [/^\/admin(?:$|\/)/, /^\/cover(?:\/|$)/];

/**
 * 这些前缀除了本站不缓存，还要显式回 no-store：
 * Cloudflare 若开了「缓存所有内容」规则，HTML 会被 CDN 存下来，
 * 后台页面（如 /admin/setup）就会出现「已经建好站长却还看到旧表单」。
 */
const NO_STORE: RegExp[] = [/^\/admin(?:$|\/)/, /^\/api(?:\/|$)/];

function skipped(path: string) {
  if (SKIP.some((re) => re.test(path))) return true;
  // 接口默认直连，只有白名单里的公开接口才走缓存
  return path.startsWith('/api') && !API_CACHE.some((re) => re.test(path));
}

function apiCacheable(path: string) {
  return path.startsWith('/api') && API_CACHE.some((re) => re.test(path));
}

/** 后台回源：子请求会重新进入 Worker，渲染完成后照常回填缓存 */
function revalidate(url: string) {
  return fetch(new Request(url, { method: 'GET', headers: { [REFRESH]: '1' } }));
}

/**
 * 章节页的缓存版本：书籍最后更新时间 + 站点设置最后更新时间。
 *
 * 章节增删改都会 touch books.updated_at，后台改设置会写 settings.updated_at。
 * Workers 的 Cache API 没有 purge，所以不靠「更新时清缓存」，而是让版本进 key：
 * 任一变化都会换一个 key，旧 HTML 自然不再命中，靠 TTL/LRU 回收。
 */
/**
 * 版本号统一走这个包装：30 秒内存缓存 + 失败降级为 null。
 * 同一实例内不必每个请求都打一次库，改动最多滞后 30 秒生效；
 * 取不到版本就退回短缓存，别让缓存层把页面一起拖垮。
 */
function versionMemo(db: D1Database, key: string, load: () => Promise<string | null>) {
  return memo<string | null>(
    db,
    key,
    async () => {
      try {
        return await load();
      } catch {
        return null;
      }
    },
    30_000,
  );
}

function chapterVersion(db: D1Database, slug: string) {
  return versionMemo(db, `edge-version:${slug}`, async () => {
    const row = await db
      .prepare(
        `SELECT b.updated_at AS book_at,
                (SELECT COALESCE(MAX(updated_at), 0) FROM settings) AS settings_at
           FROM books b WHERE b.slug = ?`,
      )
      .bind(slug)
      .first<{ book_at: number; settings_at: number }>();
    return row ? `${row.book_at}.${row.settings_at}.${BUILD}` : null;
  });
}

/** 书页还要渲染讨论数，所以版本里多算这本书已通过的讨论条数 */
function bookVersion(db: D1Database, slug: string) {
  return versionMemo(db, `edge-book-version:${slug}`, async () => {
    const row = await db
      .prepare(
        `SELECT b.updated_at AS book_at,
                (SELECT COALESCE(MAX(updated_at), 0) FROM settings) AS settings_at,
                (SELECT COUNT(*) FROM discussions d
                  WHERE d.book_id = b.id AND d.status = 'approved') AS talks
           FROM books b WHERE b.slug = ?`,
      )
      .bind(slug)
      .first<{ book_at: number; settings_at: number; talks: number }>();
    return row ? `${row.book_at}.${row.settings_at}.${row.talks}.${BUILD}` : null;
  });
}

/**
 * 列表页的版本：全站书籍/设置的最近更新时间，加上已通过讨论的总数。
 *
 * 列表页展示的讨论数由 discussions 派生，而 discussions 没有 updated_at，
 * 所以用「已通过条数 + 最大 id」近似代表它的变化：新增、删除、审核通过都会变。
 * 同一时刻一增一删导致计数不变属于极端情况，最多滞后到下一轮 30 秒刷新。
 */
function libraryVersion(db: D1Database) {
  return versionMemo(db, 'edge-library-version', async () => {
    const row = await db
      .prepare(
        `SELECT (SELECT COALESCE(MAX(updated_at), 0) FROM books) AS books_at,
                (SELECT COALESCE(MAX(updated_at), 0) FROM settings) AS settings_at,
                (SELECT COUNT(*) FROM discussions WHERE status = 'approved') AS talks,
                (SELECT COALESCE(MAX(id), 0) FROM discussions) AS talks_id`,
      )
      .first<{ books_at: number; settings_at: number; talks: number; talks_id: number }>();
    return row
      ? `${row.books_at}.${row.settings_at}.${row.talks}.${row.talks_id}.${BUILD}`
      : null;
  });
}

/** 站点设置版本：站点名等变化会影响图标等静态输出 */
function settingsVersion(db: D1Database) {
  return versionMemo(db, 'edge-settings-version', async () => {
    const row = await db
      .prepare('SELECT COALESCE(MAX(updated_at), 0) AS at FROM settings')
      .first<{ at: number }>();
    return row ? `${row.at}.${BUILD}` : null;
  });
}

type Plan = { version: string; ttl: number; stale: number };

/** 给请求路径挑一套缓存参数；返回 null 表示走默认短缓存 */
async function cachePlan(db: D1Database, path: string): Promise<Plan | null> {
  const chapter = CHAPTER_PATH.exec(path);
  if (chapter) {
    const version = await chapterVersion(db, decodeURIComponent(chapter[1]));
    return version ? { version, ttl: CHAPTER_TTL, stale: CHAPTER_STALE } : null;
  }

  const book = BOOK_PATH.exec(path);
  if (book) {
    const version = await bookVersion(db, decodeURIComponent(book[1]));
    return version ? { version, ttl: BOOK_TTL, stale: BOOK_STALE } : null;
  }

  if (LIST_PATHS.some((re) => re.test(path))) {
    const version = await libraryVersion(db);
    return version ? { version, ttl: LIST_TTL, stale: LIST_STALE } : null;
  }

  const toc = TOC_PATH.exec(path);
  if (toc) {
    const version = await chapterVersion(db, decodeURIComponent(toc[1]));
    return version ? { version, ttl: TOC_TTL, stale: TOC_STALE } : null;
  }

  if (path === RSS_PATH || SITEMAP_PATH.test(path)) {
    const version = await libraryVersion(db);
    return version ? { version, ttl: FEED_TTL, stale: FEED_STALE } : null;
  }

  if (path === FAVICON_PATH) {
    const version = await settingsVersion(db);
    return version ? { version, ttl: ICON_TTL, stale: ICON_STALE } : null;
  }

  return null;
}

/**
 * 同一缓存键的并发回源合并：过期瞬间只渲染一次，其余请求等它把结果写进缓存后直接读缓存。
 * 只记录有版本键的页面（这些才是回源贵、命中率高的页面）。
 */
const inflight = new Map<string, Promise<void>>();

/** 版本号本身就是稳定 ETag；无版本页面用回填时间兜底 */
function etagFor(plan: Plan | null, stamp: number) {
  return `W/"${plan ? plan.version : stamp}"`;
}

/** 命中缓存后处理浏览器的条件请求，省掉整包 HTML */
function notModified(c: Context<{ Bindings: Env; Variables: Variables }>, hit: Response) {
  const sent = c.req.header('if-none-match');
  const etag = hit.headers.get('etag');
  if (!sent || !etag || !sent.split(',').some((tag) => tag.trim() === etag)) return null;

  const headers = new Headers();
  headers.set('etag', etag);
  const cacheControl = hit.headers.get('cache-control');
  if (cacheControl) headers.set('cache-control', cacheControl);
  const at = hit.headers.get(STAMP);
  if (at) headers.set(STAMP, at);
  return new Response(null, { status: 304, headers });
}

export const edgeCache: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (
  c,
  next,
) => {
  const path = c.req.path;
  if (skipped(path)) {
    await next();
    // 本站跳过还不够，得明确告诉 CDN 也不要存，否则后台页面会被缓存成旧状态
    if (NO_STORE.some((re) => re.test(path))) c.res.headers.set('cache-control', 'no-store');
    return;
  }
  if (c.req.method !== 'GET') return next();
  // 只有登录态会改变页面内容；口令 Cookie、统计脚本等其它 Cookie 不该让缓存整体失效
  const cookie = c.req.header('cookie') ?? '';
  if (cookie.includes(`${SESSION_COOKIE}=`)) {
    await next();
    // 登录态页面不进共享缓存；显式 private，避免浏览器之外的中间层留存个性化页面
    if (!c.res.headers.has('cache-control')) {
      c.res.headers.set('cache-control', 'private, no-store');
    }
    return;
  }

  // DOM lib 的 CacheStorage 没有 default 声明，workers-types 里才有，这里显式收窄
  const cache = (caches as unknown as { default: Cache }).default;
  // 能算出版本的页面把版本拼进缓存键：页面上线的是「书 + 站点设置」这个版本的内容
  const plan = await cachePlan(c.env.DB, path);
  const keyUrl = new URL(c.req.url);
  // 用 __v 而不是 v：/api/toc 自己用 ?v= 选卷，键上不能覆盖业务参数
  if (plan) keyUrl.searchParams.set('__v', plan.version);
  const keyStr = keyUrl.toString();
  const key = new Request(keyStr, { method: 'GET' });
  const ttl = plan?.ttl ?? TTL;
  const stale = plan?.stale ?? STALE;
  const refreshing = c.req.header(REFRESH) === '1';
  // 后台回源本来就是唯一的一份，不参与合并
  const coalesce = !!plan && !refreshing;
  const stamp = Math.floor(Date.now() / 1000);

  if (!refreshing) {
    const hit = await cache.match(key);
    if (hit) {
      const age = stamp - Number(hit.headers.get(STAMP) ?? 0);
      if (age < ttl || age < stale) {
        if (age >= ttl) c.executionCtx.waitUntil(revalidate(c.req.url));
        return notModified(c, hit) ?? hit;
      }
    }
    if (coalesce) {
      const pending = inflight.get(keyStr);
      if (pending) {
        // 回源方渲染完会先写缓存，这里等它写完再读一份，避免共享同一个 body
        await pending.catch(() => {});
        const hit = await cache.match(key);
        if (hit) return notModified(c, hit) ?? hit;
      }
    }
  }

  let settle: () => void = () => {};
  let fail: (err: unknown) => void = () => {};
  if (coalesce) {
    const shared = new Promise<void>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    // 没有等待者时避免未处理的 rejection
    shared.catch(() => {});
    inflight.set(keyStr, shared);
  }

  try {
    await next();

    const res = c.res;
    const type = res.headers.get('content-type') ?? '';
    const htmlLike = /text\/html|application\/(?:xml|rss\+xml)/.test(type);
    // 白名单接口只缓存 JSON，其它类型一律不碰
    const jsonLike = apiCacheable(path) && /application\/json/.test(type);
    // 图标是动态生成的 SVG，只有它能享受这套版本缓存
    const svgLike = path === FAVICON_PATH && /image\/svg\+xml/.test(type);
    const cacheable =
      res.status === 200 &&
      (htmlLike || jsonLike || svgLike) &&
      // 响应要写 Cookie 时不缓存
      !res.headers.get('set-cookie') &&
      // 路由自己声明了 no-store（口令页等）就尊重它
      !(res.headers.get('cache-control') ?? '').includes('no-store');
    if (!cacheable) {
      fail(new Error('edge-cache: skip'));
      return res;
    }

    // 直接改响应头：不要 new Response 再赋给 c.res，Hono 会把旧响应的头合并回来，
    // 路由自己写的 cache-control 会覆盖掉这里算好的值
    const headers = res.headers;
    if (jsonLike) {
      // 接口原本可能是 private，进共享缓存必须显式改成 public；
      // 浏览器仍然只存 60 秒，有版本时再给边缘一个更长的 s-maxage
      const shared = plan ? `, s-maxage=${plan.ttl}` : '';
      const swr = plan ? Math.max(plan.stale - API_TTL, 0) : API_STALE - API_TTL;
      headers.set('cache-control', `public, max-age=${API_TTL}${shared}, stale-while-revalidate=${swr}`);
    } else if (type.includes('text/html')) {
      // 浏览器仍然只存 60 秒；有版本的页面多给一个 s-maxage，让边缘/CDN 存更久
      const maxAge = plan ? TTL : ttl;
      const shared = plan ? `, s-maxage=${plan.ttl}` : '';
      headers.set(
        'cache-control',
        `public, max-age=${maxAge}${shared}, stale-while-revalidate=${stale - ttl}`,
      );
    }
    headers.set(STAMP, String(stamp));
    headers.set('etag', etagFor(plan, stamp));

    if (!coalesce) {
      c.executionCtx.waitUntil(cache.put(key, res.clone()));
      return res;
    }

    // 有等待者：先把结果写进缓存，等待者醒来后直接读缓存拿各自的副本
    try {
      await cache.put(key, res.clone());
    } catch {
      // 写缓存失败不影响本次响应，等待者没读到缓存会自己回源
    }
    settle();
    return res;
  } catch (err) {
    fail(err);
    throw err;
  } finally {
    if (coalesce) inflight.delete(keyStr);
  }
};
