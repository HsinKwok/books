import { Hono } from 'hono';
import type { AppContext, Env, Variables } from '../env';
import {
  countDiscussions,
  deleteDiscussion,
  deleteDiscussions,
  listDiscussions,
  logAudit,
  setDiscussionStatus,
  setDiscussionsStatus,
} from '../db';
import { DiscussionList, DiscussionsPage } from '../pages/admin/discussions';
import { clampPage } from '../db/paging';
import { adminTheme, adminUser, html, notice } from './shared';
import { readBatch } from './guard';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/** 每页条数：待审可能积压很多，分页后 ajax 也轻一些 */
const PER_PAGE = 20;

/** 讨论列表的公共查询：整页渲染和 ajax 切换栏目共用同一套条件 */
async function loadDiscussions(c: AppContext) {
  const param = c.req.query('status');
  const status: 'pending' | 'approved' | 'spam' =
    param === 'approved' || param === 'spam' ? param : 'pending';
  const db = c.env.DB;
  const [pending, approved, spam] = await Promise.all([
    countDiscussions(db, 'pending'),
    countDiscussions(db, 'approved'),
    countDiscussions(db, 'spam'),
  ]);
  const counts = { pending, approved, spam };

  // 先按总数算出页数，再把传进来的页码夹到有效范围
  const paging = clampPage(c.req.query('page'), counts[status], PER_PAGE);
  const items = await listDiscussions(db, status, PER_PAGE, paging.offset);

  return { status, items, counts, page: paging.page, pages: paging.pages };
}

app.get('/discussions', async (c) => {
  const { status, items, counts, page, pages } = await loadDiscussions(c);
  return html(
    c,
    <DiscussionsPage
      user={adminUser(c)}
      items={items}
      status={status}
      counts={counts}
      page={page}
      pages={pages}
      notice={notice(c)}
      theme={await adminTheme(c)}
    />,
  );
});

/** 切换待审 / 已通过 / 已屏蔽：只回列表那一块，前端原地替换 */
app.get('/api/discussions', async (c) => {
  const { status, items, counts, page, pages } = await loadDiscussions(c);
  return c.json(
    { html: String(<DiscussionList items={items} status={status} page={page} pages={pages} />), counts, page, pages },
    200,
    { 'cache-control': 'no-store' },
  );
});

/** 批量审核 / 删除：勾选后一次提交，返回处理条数交给前端刷新列表 */
app.post('/api/discussions/batch', async (c) => {
  const guard = await readBatch(c);
  if (guard instanceof Response) return guard;
  const { body, ids } = guard;

  const action = String(body.action ?? '');
  const db = c.env.DB;
  const uid = adminUser(c).id;
  // 日志里只记前 20 个 id，避免一行太长
  const sample = `#${ids.slice(0, 20).join(',')}${ids.length > 20 ? '…' : ''}`;

  if (action === 'delete') {
    await deleteDiscussions(db, ids);
    await logAudit(db, uid, 'discussion.batch.delete', `批量删除 ${ids.length} 条：${sample}`);
    return c.json({ ok: true, count: ids.length });
  }

  if (action === 'approved' || action === 'pending' || action === 'spam') {
    await setDiscussionsStatus(db, ids, action);
    await logAudit(db, uid, `discussion.batch.${action}`, `批量转「${action}」${ids.length} 条：${sample}`);
    return c.json({ ok: true, count: ids.length });
  }

  return c.json({ ok: false, error: 'bad-action' }, 400);
});

app.post('/discussions/:id/:action', async (c) => {
  const id = Number(c.req.param('id'));
  const action = c.req.param('action');

  if (action === 'delete') {
    await deleteDiscussion(c.env.DB, id);
    return c.redirect('/admin/discussions?m=deleted', 303);
  }

  if (action === 'approved' || action === 'pending' || action === 'spam') {
    await setDiscussionStatus(c.env.DB, id, action);
    return c.redirect('/admin/discussions?m=updated', 303);
  }

  return c.notFound();
});

export default app;
