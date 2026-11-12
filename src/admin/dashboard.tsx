import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import { getAdminOverview, getOwnerOverview, listBooks, listDiscussions } from '../db';
import { Dashboard } from '../pages/admin/dashboard';
import { adminTheme, adminUser, html, notice } from './shared';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get('/', async (c) => {
  const db = c.env.DB;
  const user = adminUser(c);
  const ownOnly = user.role === 'author';
  // 首屏只渲染最近 6 本和 4 条待审，统计数字交给 /admin/api/overview
  const [books, pending, theme] = await Promise.all([
    listBooks(db, {
      includeDrafts: true,
      ownerId: ownOnly ? user.id : undefined,
      limit: 6,
      order: 'recent',
    }),
    listDiscussions(db, 'pending', 4),
    adminTheme(c),
  ]);

  return html(
    c,
    <Dashboard
      user={user}
      recentBooks={books}
      pending={pending.slice(0, 4)}
      notice={notice(c)}
      theme={theme}
    />,
  );
});

/** 概览统计：页面骨架先出，数字随后补上 */
app.get('/api/overview', async (c) => {
  const user = adminUser(c);
  const overview =
    user.role === 'author'
      ? await getOwnerOverview(c.env.DB, user.id)
      : await getAdminOverview(c.env.DB);
  return c.json(overview, 200, { 'cache-control': 'no-store' });
});

export default app;
