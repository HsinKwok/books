import type { Context } from 'hono';
import type { Child } from 'hono/jsx';
import { Layout, type LayoutProps } from './layout';
import type { Env, Variables } from './env';
import { loadUser } from './auth';
import { getCategories, getStats, type Stats } from './db';
import { getSettings, type Settings } from './settings';

export type Shell = {
  stats: Stats;
  categories: string[];
  settings: Settings;
  user: Awaited<ReturnType<typeof loadUser>>;
};

export type PageProps = Omit<
  LayoutProps,
  'stats' | 'categories' | 'user' | 'settings' | 'children'
>;

export async function shell(
  c: Context<{ Bindings: Env; Variables: Variables }>,
): Promise<Shell> {
  const [stats, categories, settings] = await Promise.all([
    // 只算首屏用得到的统计，settings 在请求/实例内复用
    getStats(c.env.DB),
    getCategories(c.env.DB),
    getSettings(c.env.DB),
  ]);
  return { stats, categories, settings, user: c.get('user') };
}

export async function render(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  props: PageProps,
  node: Child,
  data?: Shell,
) {
  const base = data ?? (await shell(c));
  return c.html(String(<Layout {...props} {...base}>{node}</Layout>));
}

/** 每页展示的书数；首页 / 分类页共用 */
export const LIST_PER_PAGE = 24;
/** sitemap 每个分片覆盖多少本书，控制单次响应体积 */
export const SITEMAP_BOOKS = 500;

/** ?page= 只接受正整数，其它一律回第一页 */
export function pageParam(c: Context) {
  const n = Number(c.req.query('page') ?? '');
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
}
